# Checks the design and security properties of the configuration without an AWS account:
# the AWS provider is mocked, so `terraform test` builds the plan and "applies" it to fake
# resources. Run from infra/: terraform init -backend=false && terraform test

mock_provider "aws" {
  mock_data "aws_availability_zones" {
    defaults = {
      names = ["ap-southeast-1a", "ap-southeast-1b", "ap-southeast-1c"]
    }
  }

  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
    }
  }

  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_resource "aws_db_instance" {
    defaults = {
      address = "rent-lens-prod.example.ap-southeast-1.rds.amazonaws.com"
      master_user_secret = [{
        secret_arn    = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:rds-db-credentials"
        secret_status = "active"
        kms_key_id    = ""
      }]
    }
  }

  mock_resource "aws_apigatewayv2_api" {
    defaults = {
      api_endpoint  = "https://abc123.execute-api.ap-southeast-1.amazonaws.com"
      execution_arn = "arn:aws:execute-api:ap-southeast-1:123456789012:abc123"
    }
  }

  # The provider still checks ARN formats, so resources whose ARN another resource uses get valid ones.
  mock_resource "aws_sns_topic" {
    defaults = { arn = "arn:aws:sns:ap-southeast-1:123456789012:rent-lens-prod-alarms" }
  }

  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/rent-lens-prod" }
  }

  mock_resource "aws_lambda_function" {
    defaults = {
      arn        = "arn:aws:lambda:ap-southeast-1:123456789012:function:rent-lens-prod"
      invoke_arn = "arn:aws:apigateway:ap-southeast-1:lambda:path/2015-03-31/functions/arn:aws:lambda:ap-southeast-1:123456789012:function:rent-lens-prod/invocations"
    }
  }

  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:ap-southeast-1:123456789012:log-group:rent-lens-prod" }
  }

  mock_resource "aws_s3_bucket" {
    defaults = {
      arn                         = "arn:aws:s3:::rent-lens-prod-bucket"
      bucket_regional_domain_name = "rent-lens-prod-bucket.s3.ap-southeast-1.amazonaws.com"
    }
  }

  mock_resource "aws_cloudfront_distribution" {
    defaults = { arn = "arn:aws:cloudfront::123456789012:distribution/E123EXAMPLE" }
  }

  mock_resource "aws_cloudfront_function" {
    defaults = { arn = "arn:aws:cloudfront::123456789012:function/rent-lens-prod-spa-routes" }
  }
}

variables {
  api_package_path    = "tests/fixtures/lambda.zip"
  ingest_package_path = "tests/fixtures/lambda.zip"
}

run "database_is_private_and_encrypted" {
  command = apply

  assert {
    condition     = aws_db_instance.main.publicly_accessible == false
    error_message = "The database must not be publicly accessible."
  }

  assert {
    condition     = aws_db_instance.main.storage_encrypted
    error_message = "Database storage must be encrypted."
  }

  assert {
    condition     = aws_db_instance.main.manage_master_user_password
    error_message = "RDS must manage the password in Secrets Manager, so it never appears in state."
  }

  assert {
    condition     = aws_db_instance.main.deletion_protection && aws_db_instance.main.backup_retention_period >= 7
    error_message = "Deletion protection must be on by default, with at least 7 days of backups."
  }

  assert {
    condition     = aws_vpc_security_group_ingress_rule.db_from_lambda.cidr_ipv4 == null && aws_vpc_security_group_ingress_rule.db_from_lambda.referenced_security_group_id == aws_security_group.lambda.id
    error_message = "Postgres must accept connections only from the Lambda security group, never from a CIDR range."
  }
}

run "postgres_settings" {
  command = plan

  assert {
    condition     = contains([for p in aws_db_parameter_group.main.parameter : "${p.name}=${p.value}"], "jit=0")
    error_message = "JIT must be off: it adds about 100 ms to queries that run in about 7 ms."
  }

  assert {
    condition     = !contains([for p in aws_db_parameter_group.main.parameter : p.name], "statement_timeout")
    error_message = "statement_timeout must not be set for every role: the ingest and migrations run long statements. The API sets its own per connection."
  }

  assert {
    condition     = aws_cloudwatch_log_group.rds.name == "/aws/rds/instance/rent-lens-prod/postgresql" && aws_cloudwatch_log_group.rds.retention_in_days == var.log_retention_days
    error_message = "The RDS log group must be managed, with a retention period, so RDS does not keep logs forever."
  }
}

run "network_has_no_route_to_the_internet" {
  command = apply

  assert {
    condition     = length(aws_route_table.private.route) == 0
    error_message = "The private route table must have no routes out (no NAT or internet gateway)."
  }

  assert {
    condition     = length(aws_subnet.private) == 2 && alltrue([for s in aws_subnet.private : !s.map_public_ip_on_launch])
    error_message = "Two private subnets, with no public IP addresses."
  }
}

run "lambdas_sit_where_the_design_says" {
  command = apply

  assert {
    condition     = length(aws_lambda_function.api.vpc_config) == 1 && length(aws_lambda_function.load.vpc_config) == 1
    error_message = "The API and load Lambdas must run in the VPC, to reach Postgres."
  }

  assert {
    condition     = length(aws_lambda_function.fetch.vpc_config) == 0
    error_message = "The fetch Lambda must run outside the VPC, so it reaches data.gov.sg without a NAT gateway."
  }

  assert {
    condition     = aws_lambda_function.api.reserved_concurrent_executions == var.api_reserved_concurrency
    error_message = "The API Lambda's concurrency must be capped, to cap Postgres connections."
  }

  assert {
    condition     = aws_lambda_function.load.reserved_concurrent_executions == 1
    error_message = "Only one load may run at a time."
  }

  assert {
    condition     = aws_lambda_function.api.environment[0].variables["AWS_LAMBDA_EXEC_WRAPPER"] == "/opt/bootstrap"
    error_message = "The API Lambda must start through the Lambda Web Adapter."
  }

  assert {
    condition     = aws_lambda_function.api.environment[0].variables["DB_CA_PATH"] == "/var/task/rds-ca.pem" && aws_lambda_function.load.environment[0].variables["DB_CA_PATH"] == "/var/task/rds-ca.pem"
    error_message = "The Lambdas that connect to Postgres must check TLS against the RDS CA bundle in their package."
  }

  assert {
    condition     = aws_lambda_function.api.environment[0].variables["DB_POOL_MAX"] == "1"
    error_message = "A Lambda instance serves one request at a time: one Postgres connection each keeps the total at the reserved concurrency."
  }

  assert {
    condition     = aws_lambda_function.api.environment[0].variables["RATE_LIMIT_PER_MINUTE"] == "0"
    error_message = "The in-memory rate limiter must be off on AWS; it counts per instance, and API Gateway throttles instead."
  }

  assert {
    condition     = alltrue([for f in [aws_lambda_function.api, aws_lambda_function.fetch, aws_lambda_function.load] : f.runtime == "nodejs24.x"])
    error_message = "The Lambdas must run Node 24, the version CI and Docker test."
  }
}

run "each_lambda_reads_only_its_own_database_login" {
  command = apply

  # The mock gives each secret its own random ARN, so the first assertion proves the two differ
  # and the next two prove each Lambda points at the right one.
  assert {
    condition     = aws_secretsmanager_secret.db_login["api"].arn != aws_secretsmanager_secret.db_login["ingest"].arn
    error_message = "The API and ingest logins must be separate secrets."
  }

  assert {
    condition     = aws_lambda_function.api.environment[0].variables["DB_USER"] == "rentlens_api" && aws_lambda_function.api.environment[0].variables["DB_SECRET_ARN"] == aws_secretsmanager_secret.db_login["api"].arn
    error_message = "The API Lambda must log in as the read-only rentlens_api role."
  }

  assert {
    condition     = aws_lambda_function.load.environment[0].variables["DB_USER"] == "rentlens_ingest" && aws_lambda_function.load.environment[0].variables["DB_SECRET_ARN"] == aws_secretsmanager_secret.db_login["ingest"].arn
    error_message = "The load Lambda must log in as the rentlens_ingest role."
  }

  # IAM: each role's policy may read only its own secret.
  assert {
    condition     = toset(data.aws_iam_policy_document.read_api_db_secret.statement[0].resources) == toset([aws_secretsmanager_secret.db_login["api"].arn])
    error_message = "The API role's policy must allow reading the rentlens_api secret and nothing else."
  }

  assert {
    condition     = toset(one([for st in data.aws_iam_policy_document.load_access.statement : st.resources if contains(st.actions, "secretsmanager:GetSecretValue")])) == toset([aws_secretsmanager_secret.db_login["ingest"].arn])
    error_message = "The load role's policy must allow reading the rentlens_ingest secret and nothing else."
  }

  assert {
    condition = !contains([
      aws_lambda_function.api.environment[0].variables["DB_SECRET_ARN"],
      aws_lambda_function.load.environment[0].variables["DB_SECRET_ARN"],
    ], aws_db_instance.main.master_user_secret[0].secret_arn)
    error_message = "No Lambda may use the master password."
  }
}

run "buckets_are_private" {
  command = plan

  assert {
    condition = alltrue([
      for b in [aws_s3_bucket_public_access_block.web, aws_s3_bucket_public_access_block.data] :
      b.block_public_acls && b.block_public_policy && b.ignore_public_acls && b.restrict_public_buckets
    ])
    error_message = "Both buckets must block every form of public access."
  }
}

run "cloudfront_serves_https_with_security_headers" {
  command = plan

  assert {
    condition     = aws_cloudfront_distribution.main.default_cache_behavior[0].viewer_protocol_policy == "redirect-to-https"
    error_message = "The app must redirect HTTP to HTTPS."
  }

  assert {
    condition     = one([for b in aws_cloudfront_distribution.main.ordered_cache_behavior : b.viewer_protocol_policy if b.path_pattern == "/api/*"]) == "https-only"
    error_message = "The API must be reachable over HTTPS only, on the app's own origin."
  }

  assert {
    condition = (
      aws_cloudfront_cache_policy.api.parameters_in_cache_key_and_forwarded_to_origin[0].headers_config[0].header_behavior == "none"
      && aws_cloudfront_cache_policy.api.parameters_in_cache_key_and_forwarded_to_origin[0].cookies_config[0].cookie_behavior == "none"
    )
    error_message = "The API cache key must hold no headers (Host would reach API Gateway and be rejected) and no cookies."
  }

  assert {
    condition     = strcontains(aws_cloudfront_response_headers_policy.security.security_headers_config[0].content_security_policy[0].content_security_policy, "frame-ancestors 'none'")
    error_message = "The Content Security Policy must forbid framing, as nginx does locally."
  }
}

run "api_gateway_throttles" {
  command = plan

  variables {
    api_throttle_rate_limit  = 5
    api_throttle_burst_limit = 10
  }

  assert {
    condition     = aws_apigatewayv2_stage.default.default_route_settings[0].throttling_rate_limit == 5 && aws_apigatewayv2_stage.default.default_route_settings[0].throttling_burst_limit == 10
    error_message = "API Gateway must apply the configured throttling."
  }
}

run "failed_ingests_raise_alarms" {
  command = plan

  assert {
    condition     = toset(keys(aws_cloudwatch_metric_alarm.ingest_errors)) == toset(["fetch", "load"])
    error_message = "Both ingest steps must have an error alarm."
  }

  variables {
    alarm_email = "ops@example.com"
  }

  assert {
    condition     = length(aws_sns_topic_subscription.alarm_email) == 1
    error_message = "An alarm email must create a subscription."
  }
}
