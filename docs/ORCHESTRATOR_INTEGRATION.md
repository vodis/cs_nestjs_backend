# Orchestrator integration (cs_nestjs_backend)

This repo publishes deploy artifacts; **cs_orchestrator** is the only production deploy authority.

## System boundaries

```text
App repo:     Dockerfile + build-prod / build-staging  →  GHCR image + metadata
Orchestrator: validate metadata, pull digest, run container on host
```

| Layer       | This repository                                                                                                        | `cs_orchestrator`                    |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Image build | Root [`Dockerfile`](../../Dockerfile) (CI target `production`)                                                         | Does not build                       |
| CI publish  | [`build-staging.yml`](../.github/workflows/build-staging.yml), [`build-prod.yml`](../.github/workflows/build-prod.yml) | Watches GHCR tags / ingests metadata |
| Deploy      | **No** SSH or `docker compose` on VPS                                                                                  | Blue/green container + Nginx on host |

Legacy [`.docker/Dockerfile`](../.docker/Dockerfile) is for local `docker-compose` only; orchestrator uses the root `Dockerfile`. Same pattern as [`cs_nextjs_client`](https://github.com/vodis/cs_nextjs_client) (root `Dockerfile` + workflows).

Full app-team guide: [`cs_orchestrator/docs/integration/SERVICE_INTEGRATION_GUIDE.md`](https://github.com/vodis/cs_orchestrator/blob/main/docs/integration/SERVICE_INTEGRATION_GUIDE.md).

## Branch flow

```text
task PR  →  develop  →  staging environment
               │
          build-staging
           (orchestrator)

develop  →  master  →  production environment
               │
           build-prod
          (orchestrator)
```

| Branch          | Workflow            | Orchestrator service     | GHCR tags                             |
| --------------- | ------------------- | ------------------------ | ------------------------------------- |
| PR to `develop` | `build-dev.yml`     | —                        | —                                     |
| `develop`       | `build-staging.yml` | `staging-nestjs-backend` | `:staging`, `:staging-metadata`       |
| `master`        | `build-prod.yml`    | `nestjs-backend`         | `:production`, `:production-metadata` |

Every merge to `develop` publishes a staging candidate. Promote a reviewed
`develop` commit to production through a PR to `master`.

## Production CI contract (`master`)

| Item             | Value                                            |
| ---------------- | ------------------------------------------------ |
| Workflow         | `.github/workflows/build-prod.yml`               |
| Service id       | `nestjs-backend`                                 |
| Environment      | `production`                                     |
| `git.branch`     | `master`                                         |
| `git.repository` | `https://github.com/vodis/cs_nestjs_backend.git` |

## Staging CI contract (`develop`)

| Item         | Value                                 |
| ------------ | ------------------------------------- |
| Workflow     | `.github/workflows/build-staging.yml` |
| Service id   | `staging-nestjs-backend`              |
| Environment  | `staging`                             |
| `git.branch` | `develop`                             |

Manual staging dispatches must run from `develop`. Set
`force_database_migration=true` for first-database bootstrap or a controlled
database-gate retry; this override can only strengthen metadata to
`database.risk=migration`.

Every staging and production bundle also publishes
`database.migrationFingerprint`, a SHA-256 fingerprint over the complete,
ordered migration inventory. The orchestrator compares it with the last
successful migration evidence and promotes a changed or unrecorded fingerprint
to the approval flow. This keeps an undeployed migration gated across later
pushes even when the latest Git diff does not contain the migration file.

Each release run: lint/test/build → OCI image digest → Syft/Trivy → `deploy-metadata.json` → ORAS metadata push.

**CI must not** SSH to VPS or run host deploy steps.

## Runtime (orchestrator injects secrets)

Required for production boot:

- `DATABASE_URL`
- `CS_I18N_SERVICE_URL`
- `DEFAULT_LANGUAGE`
- `COOKIES_DOMAIN`

Required for authenticated user flows (production **and** staging):

- `PRIVY_APP_ID`
- `PRIVY_APP_SECRET`
- `PRIVY_JWKS_URL`
- `CHAIN_RPC_ENDPOINTS_JSON`

Staging injects these via `staging-nestjs-backend` `requiredSecrets` in
`cs_orchestrator` (`ops/scaffold/services.catalog.yml`). Locally, set the same
keys in gitignored `.env`; `/api/v1/public/auth-config` stays `enabled: false`
until `PRIVY_APP_ID` is non-empty.

Keep `EXTERNAL_WALLET_BINDING_ENABLED=false` until the signed ownership-challenge
flow is deployed. Embedded Privy wallets are verified server-side against the
authoritative Privy user record before persistence.

Provider/config vars are documented in [.env.example](../.env.example). `API_SIGNING_KEY` is reserved in the environment contract but is not consumed by repository-visible code yet.

### Balance RPC contract

`CHAIN_RPC_ENDPOINTS_JSON` is a backend-only, orchestrator-managed secret. It is
an object keyed by CAIP-2 network id. Each value is an ordered list of one to
four `{ "alias", "url" }` providers. Aliases are safe for logs; URLs may contain
provider credentials and must never be exposed to the browser or committed.

During production-mode startup, the backend verifies that every configured
network has at least one reachable provider reporting the expected chain. A
failure prevents readiness, so the orchestrator does not switch traffic. The
backend retries transport errors, timeouts, rate limits, and provider 5xx
responses on the next configured endpoint, and temporarily opens a circuit
after repeated failures.
Deterministic per-token errors remain partial batch results. When every provider
fails, an expired cached value may be returned with `stale: true` and
`meta.partial: true`; the API never invents a zero balance.

`POST /api/v1/balances` accepts one `assetId` or up to 20 `assetIds`, plus an
optional owned `walletId`/`walletAddress` and network. A `walletId` is always
ownership-scoped. An address that is not linked to the authenticated user is an
explicit read-only target: `network` is mandatory, `walletId` is returned as
`null`, and the result is not written to the user's cache. Requested assets
must exist in the backend asset allowlist.

NEAR and EVM reads use the resilient JSON-RPC provider pool. EVM token reads
use authoritative contract metadata and ERC-20 `balanceOf`; native reads use
the network-specific native asset. TON uses the server-side TON Center adapter:
API v2 for native nanotons and API v3 owner/master filtering for allowlisted
Jettons. `TONCENTER_API_KEY` and `TONCENTER_TESTNET_API_KEY` are S3 provider
credentials and must stay in Vault or the orchestrator's controlled secret
backend; unauthenticated hosted access is limited to 1 request per second.
See the official [TON Center v2 overview](https://docs.ton.org/api/v2/overview),
[native balance endpoint](https://docs.ton.org/api/v2/accounts/get-address-balance),
and [Jetton-wallet query](https://docs.ton.org/api/v3/jettons/get-jetton-wallets).

Omitting asset ids refreshes only the chain's native asset. Discovering an
entire token portfolio is intentionally not attempted through unbounded RPC
scans; the Angular host supplies bounded asset IDs from `/api/v1/assets`.

The `20260830000100-add-balance-cache-network.js` migration must be applied by
the orchestrator before this application version serves traffic. It is an
expand/application-transition migration: `network` remains nullable, and the
legacy `(user_id, wallet_id, asset_id)` unique index remains alongside the new
network-aware index so both the active and rollback images can upsert safely.
This transition application deliberately uses the legacy conflict key while
writing `network`, so a row written by the old active image after the migration
can be adopted rather than causing a unique-key failure after traffic switches.
The legacy index temporarily prevents storing the same wallet/asset pair on two
networks. After this version is active in both staging and production and its
rollback windows close, a separately approved contract migration must backfill
again, enforce `network NOT NULL`, remove the legacy index, and switch the model
and upsert conflict key to the network-aware identity. Do not combine that
contract step with this deployment.

Passkey enrollment and passkey login are separate capabilities. Users first
authenticate with an existing CCO method such as email, Google, or Apple, then
enable a passkey on the authenticated account. The backend default public auth
config now includes passkey login when Privy is enabled.

Enabling passkey login requires `passkey` in `PRIVY_LOGIN_METHODS` (included in
the backend default and `.env.example`). `PRIVY_PASSKEY_LOGIN_ENABLED` is an
emergency kill switch for passkey login when `PRIVY_LOGIN_METHODS` already
includes `passkey`. `PRIVY_PASSKEY_LINK_ENABLED` controls authenticated account
passkey enrollment independently from login methods. Passkey signup is not
configurable and remains disabled so passkey authentication does not silently
create a new account.

## Privy wallet ownership boundary

The cross-repository decision is canonical in
[`cs_orchestrator/docs/architecture/privy-wallet-ownership.md`](https://github.com/vodis/cs_orchestrator/blob/main/docs/architecture/privy-wallet-ownership.md).

- `cs_mfe-wallets` owns the Privy browser SDK/provider, connect/sign/send,
  `WalletIdentity` production, and provider session coordination.
- `cs_ng_app_client` mounts the MFE and consumes only generic auth/session and
  wallet events; it contains no Privy-specific code.
- This backend publishes public runtime provider configuration, verifies Privy
  access tokens against the configured app, verifies embedded-wallet ownership
  against Privy's authoritative user record, and owns account/wallet
  persistence.
- Passkey enablement is exposed as provider-neutral account state
  (`POST /api/v1/me/passkey`, `passkeyEnabled`). The current guard is Privy
  because Privy is the active auth provider, but the backend does not persist
  Privy passkey credential IDs or linked-account payloads.
- External wallet binding remains disabled until a signed ownership-challenge
  protocol is implemented. A bearer token plus browser-supplied address is not
  proof of external wallet ownership.

Provider-neutral API responses use `providerUserId` and `providerWalletId`.
Internal database/model names may remain Privy-specific until separately
migrated; they must not leak into the public host contract.

Runtime env is applied when the orchestrator creates a new container. Updating service catalog values after a deployment does not mutate the active container. Use the normal branch promotion/deploy path, or a documented orchestrator config-only redeploy mechanism, whenever production env changes must take effect.

| Environment | Public health URL                                         |
| ----------- | --------------------------------------------------------- |
| Staging     | `https://staging-api-a41bf4534acb.craftscript.com/health` |
| Production  | `https://api.craftscript.com/health`                      |

## Health

`GET /health` → `{ "status": "ok" }` (outside `/api` prefix).

## GitHub setup

- Protect `develop` and `master`; require `build-dev.yml` for PRs to `develop`
  and the production workflow for PRs to `master`.

## Reference

- `cs_nextjs_client` — related orchestrator integration using the same metadata contract.
- `cs_orchestrator/docs/integration/SERVICE_INTEGRATION_GUIDE.md`
