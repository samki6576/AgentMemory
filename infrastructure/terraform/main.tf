terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# ------------------------------------------------------------------------
# Secrets Manager: the CockroachDB connection string is never passed to
# Lambda as a plain environment variable string in this config -- it's
# stored in Secrets Manager and referenced by ARN, so it doesn't show up
# in `terraform plan` output or the Lambda console's env var view.
# ------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "cockroach_db_url" {
  name = "${var.project_name}/cockroach-db-url"
}

resource "aws_secretsmanager_secret_version" "cockroach_db_url" {
  secret_id     = aws_secretsmanager_secret.cockroach_db_url.id
  secret_string = var.cockroach_db_url
}

# ------------------------------------------------------------------------
# IAM: one least-privilege role shared by the three functions. Grants only
# CloudWatch Logs write access and read access to the one secret it needs.
# ------------------------------------------------------------------------
resource "aws_iam_role" "lambda_exec" {
  name = "${var.project_name}-lambda-exec"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "lambda_logs" {
  name = "${var.project_name}-lambda-logs"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "arn:aws:logs:${var.aws_region}:*:log-group:/aws/lambda/${var.project_name}-*"
    }]
  })
}

resource "aws_iam_role_policy" "lambda_secrets" {
  name = "${var.project_name}-lambda-secrets"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = aws_secretsmanager_secret.cockroach_db_url.arn
    }]
  })
}

# ------------------------------------------------------------------------
# Lambda functions. Each was packaged independently by
# infrastructure/package-lambdas.sh into build/<name>.zip.
# ------------------------------------------------------------------------
locals {
  functions = {
    write  = { handler = "index.handler", timeout = 10, memory = 512 }
    search = { handler = "index.handler", timeout = 10, memory = 512 }
    sync   = { handler = "index.handler", timeout = 30, memory = 1024 }
  }
}

resource "aws_lambda_function" "fn" {
  for_each = local.functions

  function_name = "${var.project_name}-${each.key}"
  role          = aws_iam_role.lambda_exec.arn
  handler       = each.value.handler
  runtime       = "nodejs20.x"
  timeout       = each.value.timeout
  memory_size   = each.value.memory

  filename         = "${path.module}/build/${each.key}.zip"
  source_code_hash = filebase64sha256("${path.module}/build/${each.key}.zip")

  environment {
    variables = {
      COCKROACH_DB_SECRET_ARN = aws_secretsmanager_secret.cockroach_db_url.arn
      SYNC_SALIENCE_THRESHOLD = tostring(var.sync_salience_threshold)
      NODE_OPTIONS            = "--enable-source-maps"
    }
  }
}

resource "aws_cloudwatch_log_group" "fn" {
  for_each          = local.functions
  name              = "/aws/lambda/${var.project_name}-${each.key}"
  retention_in_days = var.log_retention_days
}

# ------------------------------------------------------------------------
# API Gateway (HTTP API) -- permanently free tier, 1M calls/month.
# ------------------------------------------------------------------------
resource "aws_apigatewayv2_api" "http_api" {
  name          = "${var.project_name}-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http_api.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_apigatewayv2_integration" "fn" {
  for_each               = local.functions
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.fn[each.key].invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "memories_post" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /memories"
  target    = "integrations/${aws_apigatewayv2_integration.fn["write"].id}"
}

resource "aws_apigatewayv2_route" "search_post" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /search"
  target    = "integrations/${aws_apigatewayv2_integration.fn["search"].id}"
}

resource "aws_apigatewayv2_route" "sync_post" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /sync"
  target    = "integrations/${aws_apigatewayv2_integration.fn["sync"].id}"
}

resource "aws_lambda_permission" "apigw" {
  for_each      = local.functions
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.fn[each.key].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}

# ------------------------------------------------------------------------
# EventBridge schedule to trigger the sync path periodically (every 15 min).
# In addition to on-demand syncs from scripts/mempalace-sync-client.js.
# ------------------------------------------------------------------------
resource "aws_cloudwatch_event_rule" "sync_schedule" {
  name                = "${var.project_name}-sync-schedule"
  schedule_expression = "rate(15 minutes)"
}

resource "aws_cloudwatch_event_target" "sync_target" {
  rule = aws_cloudwatch_event_rule.sync_schedule.name
  arn  = aws_lambda_function.fn["sync"].arn
}

resource "aws_lambda_permission" "eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.fn["sync"].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.sync_schedule.arn
}
