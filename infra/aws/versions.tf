terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "aws" {
  region = var.region

  # Tag everything this stack creates, so it's easy to find in the console and in billing
  default_tags {
    tags = {
      Project   = "retro-board"
      ManagedBy = "terraform"
    }
  }
}
