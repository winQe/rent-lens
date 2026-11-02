output "app_url" {
  description = "Public URL of the app (CloudFront)."
  value       = "https://${aws_cloudfront_distribution.main.domain_name}"
}

output "web_bucket" {
  description = "Bucket to upload the React build to."
  value       = aws_s3_bucket.web.id
}

output "cloudfront_distribution_id" {
  description = "Distribution to invalidate after a deploy."
  value       = aws_cloudfront_distribution.main.id
}

output "api_endpoint" {
  description = "API Gateway endpoint (CloudFront forwards /api/* to it)."
  value       = aws_apigatewayv2_api.main.api_endpoint
}

output "db_endpoint" {
  description = "Private RDS endpoint, reachable only from inside the VPC."
  value       = aws_db_instance.main.address
}

output "db_secret_arn" {
  description = "Secrets Manager secret that holds the database password."
  value       = local.db_secret_arn
}
