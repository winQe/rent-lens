terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Remote state in S3 with native locking (use_lockfile, Terraform 1.10+).
  # Partial config: pass the bucket and key at init time, for example
  #   terraform init -backend-config="bucket=<state-bucket>" -backend-config="key=rent-lens/prod.tfstate"
  backend "s3" {
    region       = "ap-southeast-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
