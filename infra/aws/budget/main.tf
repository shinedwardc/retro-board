# Monthly cost alert for the whole AWS account. This is its own stack, separate from the
# server in ../, so `terraform destroy` on the server leaves the alert in place.
# Apply it once and leave it.

terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

# Budgets are global, but the provider still needs a region
provider "aws" {
  region = "us-east-1"
}

variable "email" {
  description = "Where the alerts go."
  type        = string
}

variable "limit_usd" {
  description = "Monthly budget in USD."
  type        = number
  default     = 5
}

resource "aws_budgets_budget" "monthly" {
  name         = "monthly-cost"
  budget_type  = "COST"
  limit_amount = tostring(var.limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # Spending has passed 80% of the budget
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.email]
  }

  # AWS predicts the month will end over budget, e.g. a server left running
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.email]
  }
}
