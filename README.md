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

An authenticated NEAR wallet must be linked before executable swap preparation.
Wallet responses expose `ownershipVerified` for NEAR links so clients can show
whether the explicit ownership proof is still required. This flag is derived
from the stored verification marker; the backend continues to enforce proof
for swap authorization.
`POST /api/v1/wallets/link/challenge` accepts `{chainType: "near", address}` and returns a five-minute
NEP-413 challenge (`challengeId`, `message`, `recipient`, base64 `nonce`). The
wallet signs those exact fields and sends `{challengeId, chainType: "near", proof: {publicKey, signature}}`
to `POST /api/v1/wallets/link/verify`. The shared link service delegates proof
verification to the NEAR verifier; other networks require their own verifier. It
checks that the key currently has full access to the named NEAR account before
reactivating or creating its wallet link. Challenges are user-bound and exact-proof
retries are idempotent while the link remains active and the challenge is retained.
A removed link needs a new proof. Expired challenges are retained for 24 hours,
then cleaned up hourly across users.
Apply `20260928000100-create-wallet-link-challenges.js` before deploying this
API; the previous app version remains compatible with the additional table and
nullable verification marker. Legacy NEAR links have no marker and cannot
authorize swaps until the owner completes the new proof flow.
Disconnecting a browser wallet clears only the local connection; deleting a
wallet link revokes swap authorization until a new proof is completed.

For signed-intent and origin-chain deposit swaps, `POST /api/v1/swaps/prepare` returns a short-lived `preparationId` inside
`executionPackage.payload`. Preparation requires a Privy bearer token and an
active linked wallet matching `signerId` and `authMethod`; an unlinked wallet
receives `SWAP_WALLET_NOT_AUTHORIZED` before signing. Clients must return that
payload unchanged when calling `POST /api/v1/swaps/execute`. Execution requires
a Privy bearer token, an active linked wallet matching `userAddress`, and an
`Idempotency-Key` header containing 8–128 letters, digits, dots, underscores,
colons, or hyphens.
Successful replays return the stored intent hash without resubmitting upstream.
An HTTP 400 from 1Click's signed-intent endpoint is returned as
`ONE_CLICK_SUBMISSION_REJECTED`; the signed intent was rejected and the client
must not describe the response as lost. Other upstream failures return
`ONE_CLICK_UPSTREAM_ERROR` and require status reconciliation before another
attempt. Provider errors are mapped without logging credentials or signed data.
The optional `providerId` on prepare lets the wallet MFE request the 1Click
route explicitly; the backend validates the request and forwards it to that
registered provider.
After submission, the authenticated `GET /api/v1/swaps/status/:preparationId`
endpoint checks wallet ownership and queries 1Click using the stored quote's
deposit address and memo. `intentHash` means 1Click accepted the signed intent;
only a later `SUCCESS` status confirms settlement. The backend's idempotency
claim prevents duplicate submissions through this API, while 1Click controls
the actual spend of the user's Intents balance.
Native NEAR wallet swaps request `depositType: ORIGIN_CHAIN` and
`refundType: ORIGIN_CHAIN`, with `recipientType: DESTINATION_CHAIN` for USDC
paid to the NEAR wallet. An Intents transfer spends only the balance already
held by `intents.near`, not the wallet's native NEAR. Deposit preparations also
receive a stored `preparationId` for authenticated settlement tracking; a wallet
transfer hash is not evidence of swap success. Preparation expiry is capped at
the requested deadline, even if 1Click returns a longer late-deposit window.
Recipient validation applies to self-transfers as well as other recipients.
Amounts remain atomic integer strings and slippage remains in basis points.
No database migration is required for these routing and expiry corrections;
deploy the backend before the coordinated host and wallet MFE updates.

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

### Active wallet persistence

`WalletLink.isPrimary` is the account's persisted wallet preference. Registration
and session restoration preserve the existing primary, including legacy requests
with `isPrimary: true`; select explicitly with
`PATCH /api/v1/wallets/:walletId/primary`. Registration selects a wallet only when
no active primary exists. Selection, binding and removal lock the user's row.
Removing the primary promotes the oldest active wallet (ID breaks timestamp ties).

`POST /api/v1/wallets` accepts optional `restoreOnly: true` for automatic binding;
it rejects removed links instead of reactivating them. Session-attached wallet
restoration applies the same rule. Explicit binding retains relinking support.
No schema migration is needed. Deploy this protection before the wallet MFE and
host selection-capability updates; provider connection status is never a reason
to change the backend preference.

### Wallet-funded token swaps

Prepare accepts `sourceAssetId` and CAIP-2 `network`. For origin-chain deposits,
the BFF uses the selected quote's `amountIn` (including exact-output requests)
and registered origin metadata to persist versioned `executionPackage.payload.funding`.
It validates destination/memo, wallet network, exact asset identity, token balance,
and native gas/storage reserve before returning a transfer descriptor. Supported
adapters cover NEAR native/NEP-141, nine registered EVM mainnets native/ERC-20,
and TON mainnet native/jettons. Missing contracts only imply native assets for
explicit known provider route IDs; display symbols are not authoritative.
TON jetton wallets are resolved server-side and checked against owner/master.
NEAR reserves storage plus 100 Tgas; TON reserves 0.01 TON beyond the native
amount or 0.05 TON jetton attachment. Wallet/provider fees may still change.

External EVM and TON signers require stored ownership verification. Their existing
single-use wallet-link challenges validate EIP-191 and TON Connect text signatures,
respectively. TON binds the expected wallet/domain/timestamp/challenge and resolves
the public key from the deployed wallet's on-chain getter; undeployed wallets cannot
complete this proof. TON funding supports origin-chain deposits only.

No schema migration is needed for the additive funding payload. Deploy BFF first,
then MFE, then host advertising `walletFundingVersion: '1.0.0'`. Old clients retain
the native NEAR path. A host rollback disables new token funding without deleting
preparations or disrupting status reconciliation. A quote never bypasses ownership,
funding checks, expiry, confirmation or settlement checks.

The assets API provides optional `balanceAssetId` for native provider routes.
The host matches it to native RPC holdings while preserving `assetId` for quotes
and execution. Native classification is backend-owned and never inferred from
a missing contract or display symbol.

### Swap UX, indicative previews and History

Apply `20261010000100-add-swap-history.js` before deploying this backend. It adds
nullable preparing-user, display-details and attempt timestamp fields plus a
history index. Old preparations are not backfilled into account History.
Application rollback may leave these additive columns in place. Removing the
migration deletes new recovery metadata and must not be part of an app rollback.

- Public `POST /api/v1/quotes/preview` forces dry indicative Intents pricing and
  allowlisted assets; it returns amounts and a 30-second display lifetime only.
  These estimates exclude destination delivery fees and cannot fund a swap. Dry
  previews accept valid basis-point tolerances; executable preparation enforces
  the configured slippage policy.
- Public `GET /api/v1/swaps/policy` exposes the configured slippage maximum.
- Authenticated `POST /api/v1/swaps/spendable` validates native asset, wallet
  ownership and network and returns an estimated Max after gas/storage reserves.
  EVM reserves twice the sampled self-transfer gas cost; NEAR reserves storage
  and 150 Tgas; TON reserves 0.02 TON. Final preparation still validates the
  actual transfer and may reject if fees change or the real route costs more.
- Authenticated `POST /api/v1/swaps/:preparationId/attempt` records approval or
  submission progress before wallet I/O. It cannot assert settlement success.
- Authenticated `GET /api/v1/swaps/history?before=<timestamp>|<id>` returns up
  to 50 attempted preparations for the preparing user, with stable pagination.
  It never returns execution payloads or signatures. Settlement stores valid
  actual amounts and HTTPS transaction references separately from quote amounts.
- Exact-output quote selection minimizes input; exact-input maximizes output.
  Provider validation errors remain distinguishable from an upstream outage.

Deploy the backend first, then the coordinated wallet MFE and Angular host.
No migration or live transfer is run by the local implementation/test workflow.
