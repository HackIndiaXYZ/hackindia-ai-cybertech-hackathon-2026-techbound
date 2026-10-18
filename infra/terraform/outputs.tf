// Outputs for the MissingWhisper stack template. NOT APPLIED — see README.md.
// These deliberately expose no secrets: the DB password and JWT secret are
// `sensitive` variables and are never referenced here.

output "postgres_endpoint" {
  description = "Host:port of the managed Postgres instance."
  value       = aws_db_instance.postgres.endpoint
}

output "redis_endpoint" {
  description = "Host:port of the Redis cluster."
  value       = aws_elasticache_cluster.redis.cluster_address
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster hosting the API service."
  value       = aws_ecs_cluster.main.name
}

output "api_service_name" {
  description = "Name of the running API ECS service (target an ALB at it in a real deploy)."
  value       = aws_ecs_service.api.name
}
