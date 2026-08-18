variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefix used for all created resource names."
  type        = string
  default     = "agent-memory"
}

variable "cockroach_db_url" {
  description = "CockroachDB Serverless connection string (postgresql://...). Stored in Secrets Manager, never in state as a plain resource attribute."
  type        = string
  sensitive   = true
}

variable "sync_salience_threshold" {
  description = "Minimum salience score for a MemPalace memory to be synced to CockroachDB."
  type        = number
  default     = 0.6
}

variable "log_retention_days" {
  description = "CloudWatch log retention for all three Lambdas."
  type        = number
  default     = 14
}
