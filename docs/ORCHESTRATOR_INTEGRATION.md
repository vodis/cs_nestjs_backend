# Orchestrator integration (cs_nestjs_backend)

This repo publishes deploy artifacts; **cs_orchestrator** is the only production deploy authority.

## System boundaries

```text
App repo:     Dockerfile + build-prod / build-staging  →  GHCR image + metadata
Orchestrator: validate metadata, pull digest, run container on host
```

| Layer | This repository | `cs_orchestrator` |
|-------|-----------------|-------------------|
| Image build | Root [`Dockerfile`](../../Dockerfile) (CI target `production`) | Does not build |
| CI publish | [`build-staging.yml`](../.github/workflows/build-staging.yml), [`build-prod.yml`](../.github/workflows/build-prod.yml) | Watches GHCR tags / ingests metadata |
| Deploy | **No** SSH or `docker compose` on VPS | Blue/green container + Nginx on host |

Legacy [`.docker/Dockerfile`](../.docker/Dockerfile) is for local `docker-compose` only; orchestrator uses the root `Dockerfile`. Same pattern as [`cs_nextjs_client`](https://github.com/vodis/cs_nextjs_client) (root `Dockerfile` + workflows).

Full app-team guide: [`cs_orchestrator/docs/integration/SERVICE_INTEGRATION_GUIDE.md`](https://github.com/vodis/cs_orchestrator/blob/main/docs/integration/SERVICE_INTEGRATION_GUIDE.md).

## Branch flow

```text
develop  →  staging  →  master
   │           │           │
 build-dev   build-staging  build-prod
 (CI only)   (orchestrator) (orchestrator)
```

| Branch | Workflow | Orchestrator service | GHCR tags |
|--------|----------|----------------------|-----------|
| `develop` | `build-dev.yml` | — | — |
| `staging` | `build-staging.yml` | `staging-nestjs-backend` | `:staging`, `:staging-metadata` |
| `master` | `build-prod.yml` | `nestjs-backend` | `:production`, `:production-metadata` |

Promote by merging PRs: `develop` → `staging` → `master`.

## Production CI contract (`master`)

| Item | Value |
|------|-------|
| Workflow | `.github/workflows/build-prod.yml` |
| Service id | `nestjs-backend` |
| Environment | `production` |
| `git.branch` | `master` |
| `git.repository` | `https://github.com/vodis/cs_nestjs_backend.git` |

## Staging CI contract (`staging`)

| Item | Value |
|------|-------|
| Workflow | `.github/workflows/build-staging.yml` |
| Service id | `staging-nestjs-backend` |
| Environment | `staging` |
| `git.branch` | `staging` |

Each release run: lint/test/build → OCI image digest → Syft/Trivy → `deploy-metadata.json` → ORAS metadata push.

**CI must not** SSH to VPS or run host deploy steps.

## Runtime (orchestrator injects secrets)

- `DATABASE_URL`
- `API_SIGNING_KEY`

| Environment | Public health URL |
|-------------|-------------------|
| Staging | `https://staging-api.craftscript.com/health` |
| Production | `https://api.craftscript.com/health` |

## Health

`GET /health` → `{ "status": "ok" }` (outside `/api` prefix).

## GitHub setup

- Protect `staging` and `master`; require the matching build workflow on each.
- `develop`: optional PR checks via `build-dev.yml`.

## Reference

- `cs_nextjs_client` — same branch/tag pattern (`staging` / `master` + `:staging` / `:production` tags)
- `cs_orchestrator/docs/integration/SERVICE_INTEGRATION_GUIDE.md`
