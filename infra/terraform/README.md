# Infrastructure templates

These are **starting-point Terraform templates** for the production topology
described in [`docs/OPERATIONS.md`](../../docs/OPERATIONS.md). They are **not
provisioned and were never applied** — no `terraform init`/`apply` was run
against any cloud, and nothing here has created real resources.

They exist so a platform engineer has a reviewable, version-controlled sketch of
what "deploying MissingWhisper" involves, wired to the same services the local
`docker-compose.yml` runs (Postgres, Redis, the API, the migrated web app).

## Before anyone uses these

1. Choose and pin a real cloud + region. The template is written for AWS
   (ECS/Fargate + RDS + ElastiCache + a load balancer); adapt to your provider.
2. Secrets must come from a secret manager (AWS Secrets Manager / SSM), **never**
   from the placeholder values or committed `.tfvars`. See the `sensitive`
   variables in [`variables.tf`](./variables.tf).
3. `terraform plan` and have a human read the diff before any `apply`. These
   files have only ever been eyeballed, not validated by the Terraform CLI.

## Layout

- [`main.tf`](./main.tf) — provider wiring and the compute/data resources.
- [`variables.tf`](./variables.tf) — inputs, with secrets marked `sensitive`.
- [`outputs.tf`](./outputs.tf) — the handful of values a deployment run surfaces.

Treat this directory as documentation-grade until an engineer has actually run
`terraform init && terraform validate` against a real backend.
