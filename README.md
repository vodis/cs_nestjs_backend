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

### Swap execution contract

For signed-intent swaps, `POST /api/v1/swaps/prepare` returns a short-lived `preparationId` inside
`executionPackage.payload`. Clients must return that payload unchanged when
calling `POST /api/v1/swaps/execute`. Execution requires a Privy bearer token,
an active linked wallet matching `userAddress`, and an `Idempotency-Key` header
containing 8–128 letters, digits, dots, underscores, colons, or hyphens.
Successful replays return the stored intent hash without resubmitting upstream.
The optional `providerId` on prepare lets the wallet MFE request the 1Click
route explicitly; the backend validates the request and forwards it to that
registered provider.
After submission, the authenticated `GET /api/v1/swaps/status/:preparationId`
endpoint checks wallet ownership and queries 1Click using the stored quote's
deposit address and memo. `intentHash` means 1Click accepted the signed intent;
only a later `SUCCESS` status confirms settlement. The backend's idempotency
claim prevents duplicate submissions through this API, while 1Click controls
the actual spend of the user's Intents balance.
Terminal settlement outcomes are recorded with an audit event and remain
available through the status endpoint if 1Click becomes unavailable. `INTENTS`
and `CONFIDENTIAL_INTENTS` recipients may be NEAR named accounts, NEAR implicit
accounts, or EVM implicit accounts.
Apply the nullable `swap_preparations.settlement_status` migration before deploying
this version. The previous app version can run with the column present; reversing
the migration removes recorded settlement outcomes.

Production secrets and runtime env are injected by the orchestrator when it creates the container. Updating orchestrator env requires a redeploy; restarting an existing container is not enough to apply changed env.

## Branch Flow

Use short-lived task branches from `develop` and open PRs back to `develop`.
Merges to `develop` deploy the staging environment; production releases are
promoted from `develop` to `master`:

```text
develop -> staging environment
master  -> production environment
```

See [docs/ORCHESTRATOR_INTEGRATION.md](./docs/ORCHESTRATOR_INTEGRATION.md) for CI/deploy contract details.
