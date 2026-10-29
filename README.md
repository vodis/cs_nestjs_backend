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

Network balance readers distinguish known balances (including zero) from unavailable
reads. Shared balance and cache processing does not interpret chain-specific errors.
Only a network adapter may establish zero from structured provider evidence; unknown
errors, malformed balances, contract execution failures and RPC outages remain
unavailable. Portfolio refuses to present incomplete reads as a complete total.

The NEAR token reader recognizes an account-bound `UNKNOWN_ACCOUNT` response for
its exact NEP-141 contract as zero. Native wallet failures do not use this rule,
and EVM errors do not inherit NEAR semantics. This balance-only handling does not
authorize a token for execution.



Chain balance RPC reads coalesce identical in-flight batches by network and
request parameters; completed results are not retained by the RPC layer.
HTTP 429 immediately cools down that endpoint for at least the configured
cooldown across configured networks and honors a longer `Retry-After` (seconds or
HTTP date), allowing the configured backup to serve reads. Exhausted providers still produce incomplete
balances. JSON-RPC limit errors also trigger cooldown even when HTTP succeeds.
Concurrent failures preserve the longest rate-limit delay, and a late success
cannot cancel an active cooldown. Numeric provider error codes alone are not
universal rate-limit evidence. Provider rate limits may still require an
operator-managed capacity or endpoint change.
