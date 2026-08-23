# Post-Phase 7 — NestJS Backend Onboarding

Platform checklist: `cs_orchestrator/docs/phases/nestjs-backend-onboarding.md`.

## Branch flow

```text
develop  →  staging environment
master   →  production environment
```

| Branch | CI | Orchestrator service | Environment |
| --------------- | ------------------- | ------------------------ | ------------ |
| PR to `develop` | `build-dev.yml`     | —                        | —            |
| `develop`       | `build-staging.yml` | `staging-nestjs-backend` | `staging`    |
| `master`        | `build-prod.yml`    | `nestjs-backend`         | `production` |

## Production (`master` → `nestjs-backend`)

| Field | Value |
| -------------- | --------------------------------------------------------------------- |
| Tracked branch | `master`                                                              |
| Public URL     | `https://api.craftscript.com`                                         |
| Health         | `/health`                                                             |
| Images         | `ghcr.io/vodis/cs_nestjs_backend:production` + `:production-metadata` |

## Staging (`develop` → `staging-nestjs-backend`)

| Field | Value |
| -------------- | --------------------------------------------------------------- |
| Tracked branch | `develop`                                                       |
| Public URL     | `https://staging-api-a41bf4534acb.craftscript.com`              |
| Health         | `/health`                                                        |
| Images         | `ghcr.io/vodis/cs_nestjs_backend:staging` + `:staging-metadata` |

## App repo checklist

| Area | Status |
| ----------------------------------- | ------------------------------------------ |
| `build-prod.yml` on `master`        | Done                                       |
| `build-staging.yml` on `develop`    | Done                                       |
| `build-dev.yml` on `develop`        | Done                                       |
| `/health` + production `Dockerfile` | Done                                       |
| Green staging workflow              | Pending (merge to `develop`)               |
| Green production workflow           | Pending (merge to `master`)                |
| Orchestrator registry watch         | Platform (after green CI + verify-cutover) |

## Validate metadata

```bash
go run ./cmd/validate-metadata /path/to/deploy-metadata.json
```

(from `cs_orchestrator` clone)
