# DEPLOYMENT_AND_MIGRATIONS_GUIDE.md

## Purpose

Define how to operate multiple backend services safely when each service is deployed independently and owns its own schema changes.

Applies to:

- `gateway` (public API edge)
- `core-finance` (private sensitive logic)
- `i18n` (`cs_i18n_service`)
- future side services (`solver`, `spot`, workers)

## Core Decision (Recommended)

- Use **one PostgreSQL cluster** initially.
- Use **schema-per-service ownership**.
- Each service owns and runs **its own migrations**.
- Do **not** create a separate "global migration service/repo" for application schemas.

This keeps ownership clear and scales well when services are deployed independently.

## Database Ownership Model

Service ownership boundaries (example):

- schema `gateway` -> owned by `gateway` service only
- schema `core_finance` -> owned by `core-finance` service only
- schema `i18n` -> owned by `i18n` service only

Rules:

- A service can read/write only its own schema in normal operation.
- No direct cross-service table joins in runtime code.
- Cross-service data access happens through APIs/events/read models.

## Who Runs Migrations?

Each service runs its own migrations during its own deployment pipeline.

Pattern:

1. Build and test service artifact.
2. Acquire migration lock for that service.
3. Run only that service's pending migrations.
4. Release lock.
5. Deploy application version.
6. Verify health/readiness and smoke tests.

For this service's production image, inspect and apply migrations explicitly:

```sh
npm run db:migrate:status
npm run db:migrate
```

Run these commands as a one-shot job from the exact candidate image, with the
same `DATABASE_URL` and Docker network as the application. Take and verify a
backup first. Do not run migrations from the application startup command and
do not switch traffic until a database-backed smoke check succeeds. Production
execution remains owned by `cs_orchestrator`; application CI must not connect
to production or deploy directly.

## Migration Safety Requirements

All migrations must be:

- idempotent/re-runnable where possible
- forward-compatible with rolling deployments
- backward-safe during transition window
- accompanied by rollback/mitigation notes

For risky changes, use expand/contract:

1. add new columns/tables (expand)
2. deploy code that supports old + new
3. backfill data
4. switch reads to new structure
5. remove old structure later (contract)

## Deployment Order Across Services

General rule:

- Deploy producer/provider changes before consumer hard dependencies.
- Never require two services to switch in a single synchronized step.

Example sequence for API contract changes:

1. `core-finance` adds new field/endpoint in backward-compatible way.
2. `gateway` starts using new field while preserving fallback.
3. old behavior is deprecated and removed in later release.

## CI/CD Pipeline Template Per Service

Each service repo should have:

1. lint + typecheck
2. unit/integration tests
3. migration dry-run check (against ephemeral DB)
4. build image with immutable tag (commit SHA)
5. deploy to staging
6. run migrations for that service schema
7. run smoke/e2e checks
8. promote to production

## Environment and Config Strategy

- Keep `.env` local-only convenience file; never source control secrets.
- Use secret manager for production (`DATABASE_URL`, API keys, signer keys, etc.).
- Treat production env changes as deploy events. Docker container env is fixed at container creation; changing orchestrator catalog values does not update already-running containers.
- Apply runtime config changes through the normal orchestrator deploy path, or through a documented config-only redeploy mechanism when one exists. Do not rely on manual `docker restart` to apply new env.
- Maintain per-service environment contracts:
  - required vars list
  - defaults for non-sensitive local dev
  - validation at service startup (fail fast on missing required vars)

## Should We Create a Separate Migration Repo/Service?

Short answer: **usually no** for application schemas.

Use separate migration repo/service only if:

- you have a platform team managing shared infra schemas
- multiple services truly share a single domain schema (not recommended)
- regulatory controls require a dedicated release chain for DB changes

For your current stage, per-service migrations are cleaner and safer.

## Practical Structure Recommendation

Option A (best long-term): one repo per service

- `cs_gateway` (or current `cs_nestjs_backend`)
- `cs_core_finance` (private)
- `cs_i18n_service`

Each repo contains:

- app code
- migration folder for its schema
- service-specific CI/CD

Option B (temporary): monorepo with service folders

- keep strict ownership of migration folders
- separate pipelines per service path

## Operational Controls

- Backup policy at cluster level + restore drills.
- Migration lock table to prevent concurrent runs.
- Observability around migration duration/failures.
- Feature flags for risky behavior changes.
- Runbooks for failed migration recovery.

## Day-1 Checklist

- [ ] Create schemas: `gateway`, `core_finance`, `i18n`.
- [ ] Restrict DB users to schema-level privileges.
- [ ] Add migration command in each service pipeline.
- [ ] Add migration lock mechanism.
- [ ] Add startup env validation.
- [ ] Document rollback path per migration.

## Day-2 Scaling Path

- Move from single Postgres cluster to database-per-service when needed.
- Introduce read-model/event pipelines for cross-service reporting.
- Add canary deployment with migration compatibility checks.
- Keep migration ownership unchanged (still per service).
