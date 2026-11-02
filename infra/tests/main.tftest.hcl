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

run "postgres_settings_match_the_local_api" {
  command = plan

  assert {
    condition     = contains([for p in aws_db_parameter_group.main.parameter : "${p.name}=${p.value}"], "jit=0")
    error_message = "JIT must be off: it adds about 100 ms to queries that run in about 7 ms."
  }

  assert {
    condition     = contains([for p in aws_db_parameter_group.main.parameter : "${p.name}=${p.value}"], "statement_timeout=10000")
    error_message = "The statement timeout must match the local API's 10 s."
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
