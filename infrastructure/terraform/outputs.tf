output "api_url" {
  description = "Base URL for the deployed API. POST {api_url}/memories, {api_url}/search, {api_url}/sync."
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "lambda_function_names" {
  value = { for k, v in aws_lambda_function.fn : k => v.function_name }
}

output "cockroach_db_secret_arn" {
  value = aws_secretsmanager_secret.cockroach_db_url.arn
}
