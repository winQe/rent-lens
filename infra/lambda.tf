locals {
  adapter_layer_arn = "arn:aws:lambda:${var.region}:753240598075:layer:LambdaAdapterLayerArm64:${var.lambda_adapter_layer_version}"
  dataset_key       = "rentals/latest.csv"

  db_env = {
    DB_HOST = aws_db_instance.main.address
    DB_NAME = aws_db_instance.main.db_name
  }
}

# One secret per database login role (migrations/002_roles.sql): rentlens_api can only read,
# rentlens_ingest can write the data but not change the schema. Terraform creates the secrets
# and decides who may read them; the one-time provisioning step generates each password, stores
# it here, and runs the `roles` command with it, so no password ever enters Terraform state.
# Neither Lambda can read the master password.
resource "aws_secretsmanager_secret" "db_login" {
  for_each = toset(["api", "ingest"])

  name        = "${local.name}/db/${each.key}"
  description = "Password of the rentlens_${each.key} database role."
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "read_api_db_secret" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.db_login["api"].arn]
  }
}

# --- API: the existing Express app, run unchanged by the Lambda Web Adapter ---

resource "aws_iam_role" "api" {
  name               = "${local.name}-api"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

# Logs, plus the network interfaces a Lambda in a VPC needs.
resource "aws_iam_role_policy_attachment" "api_vpc" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "api_secret" {
  name   = "read-db-secret"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.read_api_db_secret.json
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.name}-api"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "api" {
  function_name    = "${local.name}-api"
  role             = aws_iam_role.api.arn
  runtime          = "nodejs24.x"
  architectures    = ["arm64"]
  filename         = var.api_package_path
  source_code_hash = filebase64sha256(var.api_package_path)

  # run.sh starts `node dist/main.js`; the adapter forwards each request to it over HTTP.
  handler = "run.sh"
  layers  = [local.adapter_layer_arn]

  memory_size = 512
  timeout     = 20 # just above the 15 s query timeout in the API's connection pool

  # Caps the number of instances, and with it the Postgres connections (pool of 2 each).
  reserved_concurrent_executions = var.api_reserved_concurrency

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = merge(local.db_env, {
      DB_USER                      = "rentlens_api"
      DB_SECRET_ARN                = aws_secretsmanager_secret.db_login["api"].arn
      DB_POOL_MAX                  = "1" # one request at a time per instance
      RATE_LIMIT_PER_MINUTE        = "0" # API Gateway throttles instead
      AWS_LAMBDA_EXEC_WRAPPER      = "/opt/bootstrap"
      AWS_LWA_READINESS_CHECK_PATH = "/healthz"
      PORT                         = "8080"
      NODE_ENV                     = "production"
    })
  }

  depends_on = [aws_cloudwatch_log_group.api]
}

# --- Ingest, step 1: download from data.gov.sg to S3. Outside the VPC, so it has internet access. ---

resource "aws_iam_role" "fetch" {
  name               = "${local.name}-fetch"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "fetch_logs" {
  role       = aws_iam_role.fetch.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "fetch_write" {
  statement {
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.data.arn}/${local.dataset_key}"]
  }
}

resource "aws_iam_role_policy" "fetch_write" {
  name   = "write-dataset"
  role   = aws_iam_role.fetch.id
  policy = data.aws_iam_policy_document.fetch_write.json
}

resource "aws_cloudwatch_log_group" "fetch" {
  name              = "/aws/lambda/${local.name}-fetch"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "fetch" {
  function_name    = "${local.name}-fetch"
  role             = aws_iam_role.fetch.arn
  runtime          = "nodejs24.x"
  architectures    = ["arm64"]
  filename         = var.ingest_package_path
  source_code_hash = filebase64sha256(var.ingest_package_path)
  handler          = "fetch.handler"
  memory_size      = 512
  timeout          = 300 # data.gov.sg can be slow, and the download retries

  environment {
    variables = {
      DATA_BUCKET = aws_s3_bucket.data.id
      DATA_KEY    = local.dataset_key
    }
  }

  depends_on = [aws_cloudwatch_log_group.fetch]
}

# --- Ingest, step 2: load the file from S3 into Postgres. Inside the VPC, started by the new file. ---

resource "aws_iam_role" "load" {
  name               = "${local.name}-load"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "load_vpc" {
  role       = aws_iam_role.load.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

data "aws_iam_policy_document" "load_access" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.db_login["ingest"].arn]
  }

  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.data.arn}/${local.dataset_key}"]
  }
}

resource "aws_iam_role_policy" "load_access" {
  name   = "read-dataset-and-db-secret"
  role   = aws_iam_role.load.id
  policy = data.aws_iam_policy_document.load_access.json
}

resource "aws_cloudwatch_log_group" "load" {
  name              = "/aws/lambda/${local.name}-load"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "load" {
  function_name    = "${local.name}-load"
  role             = aws_iam_role.load.arn
  runtime          = "nodejs24.x"
  architectures    = ["arm64"]
  filename         = var.ingest_package_path
  source_code_hash = filebase64sha256(var.ingest_package_path)
  handler          = "load.handler"
  memory_size      = 1024
  timeout          = 300

  # One load at a time. The table lock in the load already serialises overlapping loads.
  reserved_concurrent_executions = 1

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = merge(local.db_env, {
      DB_USER       = "rentlens_ingest"
      DB_SECRET_ARN = aws_secretsmanager_secret.db_login["ingest"].arn
      DATA_BUCKET   = aws_s3_bucket.data.id
      DATA_KEY      = local.dataset_key
    })
  }

  depends_on = [aws_cloudwatch_log_group.load]
}

resource "aws_lambda_permission" "load_from_s3" {
  statement_id  = "AllowS3Invoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.load.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.data.arn
}

resource "aws_s3_bucket_notification" "data" {
  bucket = aws_s3_bucket.data.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.load.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = local.dataset_key
  }

  depends_on = [aws_lambda_permission.load_from_s3]
}
