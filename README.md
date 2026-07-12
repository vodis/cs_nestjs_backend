# CraftScript NestJS Backend

Backend gateway for CraftScript API traffic. This service owns public REST/WS contracts, request validation, auth integration, orchestration to side services, and non-sensitive asset/market metadata exposed to clients.

Start with [AGENT_GUIDE.md](./AGENT_GUIDE.md) for architecture policy and [docs/architecture/security-architecture-audit.md](./docs/architecture/security-architecture-audit.md) for current security/architecture gaps.

## Local Setup

```bash
pnpm install
cp .env.example .env
pnpm run start:dev
```

## Checks

```bash
pnpm test
pnpm run test:e2e
pnpm run lint
pnpm run build
```

## Runtime

- API prefix: `/api/v1`
- Health: `/health`
- Swagger: `/swagger`
- Production deploy authority: `cs_orchestrator`

Production secrets and runtime env are injected by the orchestrator when it creates the container. Updating orchestrator env requires a redeploy; restarting an existing container is not enough to apply changed env.

## Branch Flow

Use short-lived task branches from `develop` and open PRs back to `develop`. Promote through:

```text
develop -> staging -> master
```

See [docs/ORCHESTRATOR_INTEGRATION.md](./docs/ORCHESTRATOR_INTEGRATION.md) for CI/deploy contract details.
