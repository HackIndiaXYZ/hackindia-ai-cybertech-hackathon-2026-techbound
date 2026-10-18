// Template variables for the MissingWhisper production stack.
// NOT APPLIED — see README.md. Secrets are marked sensitive so Terraform never
// echoes their values in plan output; in a real deployment they are pulled from
// a secret manager, not passed as plaintext tfvars.

variable "region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "ap-south-1"
}

variable "project" {
  description = "Name prefix applied to every resource and tag."
  type        = string
  default     = "missingwhisper"
}

variable "api_image" {
  description = "Container image (with digest) for the API service."
  type        = string
}

variable "web_image" {
  description = "Container image (with digest) for the static web app served by nginx."
  type        = string
}

variable "desired_api_count" {
  description = "Number of API tasks to run."
  type        = number
  default     = 2
}

variable "db_instance_class" {
  description = "RDS instance class for Postgres."
  type        = string
  default     = "db.t4g.small"
}

variable "db_allocated_storage_gb" {
  description = "Initial RDS storage in GiB. Resizing down forces a new volume."
  type        = number
  default     = 20
}

variable "db_master_password" {
  description = "Master password for the Postgres instance. Source from Secrets Manager in real use."
  type        = string
  sensitive   = true
}

variable "redis_node_type" {
  description = "ElastiCache node type for Redis."
  type        = string
  default     = "cache.t4g.micro"
}

variable "api_jwt_secret" {
  description = "JWT signing secret. Maps to API_AUTH_JWT_SECRET; the API refuses to boot in production without a real value."
  type        = string
  sensitive   = true
}

variable "turnstile_secret_key" {
  description = "Cloudflare Turnstile shared secret. Leave empty to keep verification disabled."
  type        = string
  sensitive   = true
  default     = ""
}

variable "web_base_url" {
  description = "Public base URL of the web app, used when building password-reset links."
  type        = string
  default     = "https://app.missingwhisper.example"
}

variable "mail_transport" {
  description = "Outbound email transport for the API: console (dev) or none (disabled). Wire a real provider before relying on reset emails."
  type        = string
  default     = "none"
}
