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
develop  →  staging  →  master
   │           │           │
 build-dev   build-staging  build-prod
 (CI only)   (orchestrator) (orchestrator)
```

| Branch    | Workflow            | Orchestrator service     | GHCR tags                             |
| --------- | ------------------- | ------------------------ | ------------------------------------- |
| `develop` | `build-dev.yml`     | —                        | —                                     |
| `staging` | `build-staging.yml` | `staging-nestjs-backend` | `:staging`, `:staging-metadata`       |
| `master`  | `build-prod.yml`    | `nestjs-backend`         | `:production`, `:production-metadata` |

Promote by merging PRs: `develop` → `staging` → `master`.

## Production CI contract (`master`)

| Item             | Value                                            |
| ---------------- | ------------------------------------------------ |
| Workflow         | `.github/workflows/build-prod.yml`               |
| Service id       | `nestjs-backend`                                 |
| Environment      | `production`                                     |
| `git.branch`     | `master`                                         |
| `git.repository` | `https://github.com/vodis/cs_nestjs_backend.git` |

## Staging CI contract (`staging`)

| Item         | Value                                 |
| ------------ | ------------------------------------- |
| Workflow     | `.github/workflows/build-staging.yml` |
| Service id   | `staging-nestjs-backend`              |
| Environment  | `staging`                             |
| `git.branch` | `staging`                             |

Each release run: lint/test/build → OCI image digest → Syft/Trivy → `deploy-metadata.json` → ORAS metadata push.

**CI must not** SSH to VPS or run host deploy steps.

## Runtime (orchestrator injects secrets)

Required for production boot:

-   `DATABASE_URL`
-   `CS_I18N_SERVICE_URL`
-   `DEFAULT_LANGUAGE`
-   `COOKIES_DOMAIN`

Required for authenticated user flows:

-   `PRIVY_APP_ID`
-   `PRIVY_APP_SECRET`
-   `PRIVY_JWKS_URL`

Keep `EXTERNAL_WALLET_BINDING_ENABLED=false` until the signed ownership-challenge
flow is deployed. Embedded Privy wallets are verified server-side against the
authoritative Privy user record before persistence.

Provider/config vars are documented in [.env.example](../.env.example). `API_SIGNING_KEY` is reserved in the environment contract but is not consumed by repository-visible code yet.

Passkey enrollment and passkey login are separate capabilities. Users first
authenticate with an existing CCO method such as email, Google, or Apple, then
enable a passkey on the authenticated account. Keep
`PRIVY_LOGIN_METHODS=email,google,apple` unless passkey WebAuthn relying-party
configuration has been verified for the deployed host and passkey login is
ready to be offered for already-enrolled accounts.

Enabling passkey login requires `passkey` in `PRIVY_LOGIN_METHODS` and
`PRIVY_PASSKEY_LOGIN_ENABLED` not set to false. `PRIVY_PASSKEY_LINK_ENABLED`
controls authenticated account passkey enrollment independently from login
methods. `PRIVY_PASSKEY_SIGNUP_ENABLED` remains false by default so passkey
authentication does not silently create a new account.

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

| Environment | Public health URL                            |
| ----------- | -------------------------------------------- |
| Staging     | `https://staging-api.craftscript.com/health` |
| Production  | `https://api.craftscript.com/health`         |

## Health

`GET /health` → `{ "status": "ok" }` (outside `/api` prefix).

## GitHub setup

-   Protect `staging` and `master`; require the matching build workflow on each.
-   `develop`: optional PR checks via `build-dev.yml`.

## Reference

-   `cs_nextjs_client` — same branch/tag pattern (`staging` / `master` + `:staging` / `:production` tags)
-   `cs_orchestrator/docs/integration/SERVICE_INTEGRATION_GUIDE.md`
