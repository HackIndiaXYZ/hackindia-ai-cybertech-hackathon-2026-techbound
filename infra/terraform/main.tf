// Production topology template for MissingWhisper.
// NOT PROVISIONED. No `terraform apply` has ever been run against this file and
// it has not been validated by the Terraform CLI (see README.md). It mirrors the
// services in docker-compose.yml so a platform engineer has a concrete starting
// point: a VPC, managed Postgres (RDS), Redis (ElastiCache), and the API + web
// as Fargate services behind an Application Load Balancer.

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  // A real deployment must configure an S3 + DynamoDB state backend here.
  backend "s3" {}
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "terraform"
      Applied   = "false" // Marker: this template has not been applied.
    }
  }
}

# --- Network ---------------------------------------------------------------

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${var.project}-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["${var.region}a", "${var.region}b"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true
}

# --- Data stores -----------------------------------------------------------

resource "aws_db_subnet_group" "postgres" {
  name       = "${var.project}-pg"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_security_group" "postgres" {
  name        = "${var.project}-pg-sg"
  description = "Postgres access from the API only"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    description = "API tasks"
    // In a real deploy, replace with the API service security group id.
    cidr_blocks = [module.vpc.vpc_cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_instance" "postgres" {
  identifier        = "${var.project}-pg"
  engine            = "postgres"
  engine_version    = "16"
  instance_class    = var.db_instance_class
  allocated_storage = var.db_allocated_storage_gb
  storage_encrypted = true

  db_name  = "isl"
  username = "isl"
  password = var.db_master_password

  vpc_security_group_ids = [aws_security_group.postgres.id]
  db_subnet_group_name   = aws_db_subnet_group.postgres.name
  multi_az               = false // Set true for production.
  skip_final_snapshot    = false
  final_snapshot_identifier = "${var.project}-pg-final"
  backup_retention_period   = 7
}

resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.project}-redis"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "${var.project}-redis"
  engine               = "redis"
  node_type            = var.redis_node_type
  num_cache_nodes      = 1
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.redis.name
  security_group_ids   = [aws_security_group.postgres.id] // Reuse the internal SG for the template.
  parameter_group_name = "default.redis7"
}

# --- Compute (ECS/Fargate) -------------------------------------------------

resource "aws_ecs_cluster" "main" {
  name = "${var.project}-cluster"
}

# The API reads DB/Redis URLs + auth secrets from the task environment. The env
// names must match apps/api/src/config exactly (e.g. API_AUTH_JWT_SECRET, not JWT_SECRET).
resource "aws_ecs_task_definition" "api" {
  family                   = "${var.project}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = var.api_image
      essential = true
      portMappings = [{ containerPort = 4000, protocol = "tcp" }]
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "API_PORT", value = "4000" },
        { name = "API_DB_DRIVER", value = "postgres" },
        { name = "API_REDIS_DRIVER", value = "redis" },
        { name = "API_AUTH_JWT_SECRET", value = var.api_jwt_secret },
        { name = "PUBLIC_WEB_BASE_URL", value = var.web_base_url },
        { name = "MAIL_TRANSPORT", value = var.mail_transport },
        { name = "TURNSTILE_ENABLED", value = var.turnstile_secret_key == "" ? "false" : "true" },
      ]
      secrets = [
        // Real values live in Secrets Manager; the names are wired here.
        { name = "API_DB_URL", valueFrom = "${var.project}/db-url:api_jwt_secret" },
        { name = "API_REDIS_URL", valueFrom = "${var.project}/redis-url:api_jwt_secret" },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"  = "/ecs/${var.project}-api"
          "awslogs-region" = var.region
          "awslogs-stream-prefix" = "api"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "api" {
  name            = "${var.project}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.desired_api_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.postgres.id]
    assign_public_ip = false
  }
}

# The web service (nginx serving the built SPA + reverse-proxying /api) is left as
// a deliberately small stub: give it the same shape as the API service, point the
// ALB target at containerPort 80, and terminate TLS at the load balancer
// (see docs/OPERATIONS.md — TLS is not handled inside these containers).

# --- Minimal IAM so the task definitions above are complete ---------------

resource "aws_iam_role" "task_execution" {
  name = "${var.project}-task-exec"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "task" {
  name = "${var.project}-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}
