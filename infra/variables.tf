variable "project" {
  description = "Name used as a prefix for every resource."
  type        = string
  default     = "rent-lens"
}

variable "environment" {
  description = "Deployment environment, for example prod or staging."
  type        = string
  default     = "prod"
}

variable "region" {
  description = "AWS region. Singapore, next to the users and to data.gov.sg."
  type        = string
  default     = "ap-southeast-1"
}

variable "vpc_cidr" {
  description = "CIDR block of the VPC. It holds only private subnets."
  type        = string
  default     = "10.20.0.0/16"
}

variable "db_instance_class" {
  description = "RDS instance class. The dataset is about 200,000 rows, so a small Graviton instance is enough."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage_gb" {
  description = "Initial database storage in GB. Storage autoscaling can grow it to db_max_allocated_storage_gb."
  type        = number
  default     = 20
}

variable "db_max_allocated_storage_gb" {
  description = "Upper limit for RDS storage autoscaling, in GB."
  type        = number
  default     = 50
}

variable "db_multi_az" {
  description = "Run a standby database in a second availability zone."
  type        = bool
  default     = false
}

variable "db_deletion_protection" {
  description = "Stop the database from being deleted by mistake. Turn off only to tear down an environment."
  type        = bool
  default     = true
}

variable "api_reserved_concurrency" {
  description = "Maximum concurrent API Lambda instances. Each instance keeps one Postgres connection (DB_POOL_MAX=1), so this also caps the API's connections."
  type        = number
  default     = 10
}

variable "api_throttle_rate_limit" {
  description = "Steady-state requests per second allowed by API Gateway. Replaces the in-memory rate limiter, which counts per Lambda instance."
  type        = number
  default     = 20
}

variable "api_throttle_burst_limit" {
  description = "Burst of requests API Gateway allows above the rate limit."
  type        = number
  default     = 40
}

variable "lambda_adapter_layer_version" {
  description = "Version of the AWS Lambda Web Adapter layer (arm64), which runs the Express app unchanged inside Lambda."
  type        = number
  default     = 25
}

variable "api_package_path" {
  description = "Zip of the API Lambda: the esbuild bundle (apps/api/dist), production node_modules and run.sh. Built by CI."
  type        = string
  default     = "../build/api.zip"
}

variable "ingest_package_path" {
  description = "Zip of the ingest Lambdas (fetch and load entry points). Built by CI."
  type        = string
  default     = "../build/ingest.zip"
}

variable "log_retention_days" {
  description = "How long CloudWatch keeps Lambda and API Gateway logs."
  type        = number
  default     = 30
}

variable "alarm_email" {
  description = "Email address subscribed to the alarm topic. Leave empty to create the topic without a subscription."
  type        = string
  default     = ""
}
