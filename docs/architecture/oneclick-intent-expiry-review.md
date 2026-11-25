# 1Click and NEAR Intents expiry review (CS-56)

Last reviewed: 2026-11-25, against `develop` at `0f38a5d`.

Scope: an awareness check of how CraftScript sets expiry for 1Click quotes,
deposit addresses, signed intents and tokens, and whether we should request a
longer `expires_in` through `external_app_data.configs`. **No production expiry
is changed by this document.** Any change needs its own follow-up issue.

Repos read: `cs_nestjs_backend` (this repo), `cs-sdk` (`main`),
`cs_ng_app_client` (`develop`). Line numbers refer to those revisions.

## 1. Four different clocks (do not mix them up)

| Clock | Where it lives | Who sets it | Meaning |
|---|---|---|---|
| Signed-intent `deadline` | Inside the signed message (`{"signer_id","deadline","intents"}`) | The signer, or 1Click's `/v0/generate-intent` | Last moment `intents.near` will execute that signed message. Replay window of the signature. |
| 1Click quote `deadline` (request) | `POST /v0/quote` body | CraftScript client/backend | When the refund starts if the swap has not completed. |
| 1Click deposit-address deadline (response) | `quote.deadline` / `timeWhenInactive` in the quote response | 1Click | How long the deposit address is watched. |
| `expires_in` in `external_app_data.configs` (`type: "auth"`) | Inside an empty auth intent (only seen in a public gist, on `staging-intents.near`) | The signer | Unverified. Presumably the requested lifetime of a 1Click user-session token. Not documented. |

User-session token lifetimes (`expiresIn` 3600 s, `refreshExpiresIn`
2592000 s per the public docs) are a fifth thing: they are *response* fields of
`/v0/auth/authenticate`, not something we send.

## 2. Current CraftScript behaviour

### 2.1 Signed-intent `deadline`

- **Client default is 15 minutes.** `cs_ng_app_client`
  `src/app/domains/exchange/application/swap-executable-quote.coordinator.ts:200`
  and `src/app/pages/home/home.component.ts:2403` set
  `deadline: new Date(Date.now() + 15 * 60 * 1000)`. That value is sent to
  `POST /swaps/prepare` (`swap-api.client.ts:278`, `:305`).
- **Backend accepts any future ISO timestamp, with no upper bound.**
  `src/modules/swaps/presentation/dto/prepare-swap-request.dto.ts:42-44`
  (`@IsISO8601()` only) and
  `src/modules/swaps/domain/services/swap-request-validation.service.ts:55-62`
  (rejects only past or unparseable values).
- **Solver-relay path (`intent_sign`, our own package):** the user's deadline is
  copied straight into the package the user signs:
  `src/modules/swaps/application/services/prepare-package.builder.ts:26`,
  `:77-78` (`deadline`, `deadlineTimestamp`). `cs-sdk`
  `packages/cs-intents/src/index.ts:117-120` (`toNearIntentsSigningRequest`)
  takes `deadlineTimestamp` from that package. The relay quote also asks
  solvers for `min_deadline_ms`, default 60 000 ms (`SWAP_MIN_DEADLINE_MS`):
  `src/modules/swaps/infrastructure/providers/solver-relay-quote.provider.ts:24`,
  `:47-50`.
- **1Click path (`intent_sign` from an Intents balance):** the message the user
  signs is built by 1Click's `POST /v0/generate-intent`
  (`src/modules/swaps/infrastructure/providers/one-click-quote.provider.ts:58`,
  `src/http-clients/one-click-api/one-click-api.http-client.ts:67-73`). We do
  **not** set or read its `deadline`. On execute,
  `src/modules/swaps/infrastructure/providers/one-click-execution.provider.ts:79-106`
  checks the standard, that the signed payload is byte-identical to the
  generated one (`payloadsMatch`, `:108`) and that `signer_id` matches the
  wallet. It does not check the embedded `deadline`.
- **No auth/empty-intent path exists.** Nothing in the backend, SDK or Angular
  client builds an empty `"intents": []` message or calls `/v0/auth/*`.

### 2.2 1Click quote and deposit-address deadlines

- **Swap quotes:** the request `deadline` is the user's swap deadline
  (`one-click-quote.provider.ts:149`; `src/api/quotes/quotes.service.ts:135`
  for the legacy `/quotes` endpoint, again `@IsISO8601()` only in
  `src/api/quotes/dto/create-one-click-quote-request.dto.ts:28-30`). The quote's
  own expiry is `quote.deadline ?? quote.expiration_time ?? command.deadline`
  (`one-click-quote.provider.ts:78`).
- **The provider window never extends the user's authorization:**
  `prepare-package.builder.ts:34-38` caps `quoteExpiration` at the user's
  deadline, `src/modules/swaps/application/use-cases/prepare-swap.use-case.ts:110-133`
  also caps it at the funding expiry, rejects an expired value, and stores it as
  the preparation's `expiresAt`. `src/modules/swaps/application/use-cases/execute-swap.use-case.ts:139`
  refuses to execute an expired preparation.
- **Deposit instructions:** 15 minutes, or 120 minutes for Bitcoin
  (`src/modules/deposits/infrastructure/one-click-deposit.adapter.ts:42`); the
  shown expiry is `min(quote.deadline, our deadline)` (`:79-81`).
- **Indicative previews:** dry quotes use a fixed 15-minute request deadline
  (`quotes.service.ts:87`) and are labelled valid for 30 s on our side
  (`quotes.service.ts:52`, `:110`).

### 2.3 Token TTLs we set or store

- **1Click user-session tokens:** none. We never call `/v0/auth/authenticate` or
  `/v0/auth/refresh`, and store no 1Click `accessToken`/`refreshToken`.
- **1Click partner credential:** a static `ONE_CLICK_API_KEY` (`X-API-Key`) or
  `ONE_CLICK_API_JWT` (Bearer) from env
  (`one-click-api.http-client.ts:124-132`). We do not set or track its TTL; it is
  whatever the Partner Dashboard issued. Rotation is manual.
- **Our own agent OAuth tokens (`modules/agent-access`):**
  `src/modules/agent-access/application/agent-access.service.ts:28-30` —
  authorization/device codes 10 min, access tokens 10 min (`expires_in: 600`,
  `:428-433`), refresh tokens bound to a 30-day grant (`:183`, `:443`). Refresh
  tokens rotate and reuse revokes the whole family (`:281-300`). Scopes are
  read-only. `cs-sdk` `packages/cs-cli/src/commands.ts:48`, `:138-156` honours
  the server `expires_in`.

## 3. Is `external_app_data.configs` `{ "type": "auth", "expires_in": … }` accepted on production?

**Not confirmed. Open question.**

- The only source is the public gist; every example targets
  `staging-intents.near`. The public docs for `/v0/auth/authenticate`, Signing
  Intents and Refresh Access Token show no `external_app_data`, and the field is
  absent from the published OpenAPI schema for the authenticate endpoint
  (checked 2026-11-25).
- We did not test it. A real check needs a signed empty intent posted to
  production `/v0/auth/authenticate`, which is a write against production with a
  signature. That was out of scope for a read-only check, and we hold no user
  key we would be willing to sign with.
- What it would change, if accepted, is also unconfirmed. The response already
  reports `expiresIn` (access, 3600 s in docs) and `refreshExpiresIn` (refresh,
  2592000 s = 30 days in docs). `604800` (7 days, if seconds) fits neither
  default, so it may override the access-token lifetime, the refresh lifetime,
  or something else.

Safe way to confirm later (follow-up issue, not done here): on staging first,
then production, use a **freshly generated throwaway key with a zero-balance
Intents account**, a 5-minute signed `deadline`, and our partner credential;
send once without and once with `expires_in: 604800`; compare `expiresIn` and
`refreshExpiresIn` in the responses, and ask the 1Click team to confirm the unit
and the maximum. Never use a funded or real user key.

## 4. Recommendation

**Keep current TTLs. Do not request a longer `expires_in` today.**

- We have no feature that uses 1Click user-session tokens (they only reveal
  confidential balances/history), so there is no named case that justifies it.
- If Confidential Intents balances/history are added later, use the documented
  defaults (access 3600 s, refresh via the refresh endpoint) and refresh on
  demand. Only if a named case appears (for example a background balance sync
  for a user who opted in) consider an explicit `expires_in`, capped at
  **604800 seconds (7 days)**, after section 3 is confirmed, with the token
  stored server-side encrypted and revocable.
- Separately, worth a small follow-up: cap the swap `deadline` the backend
  accepts on `/swaps/prepare` and `/quotes` (for example 60 minutes; 120 for
  Bitcoin deposits) so a client bug cannot ask the user to sign a long-lived
  intent. Today only the client enforces 15 minutes.

## 5. Security notes

- **A signed intent is a bearer instrument until its `deadline`.** Anyone holding
  a still-valid signed swap intent can submit it. Nonces stop double execution,
  but a far-future deadline (the gist uses ~10 years) means a leaked or
  unsubmitted signature stays executable at a stale price. Keep signed-intent
  deadlines in minutes.
- **A signed empty auth intent is a login credential until its deadline.** With
  a long deadline, a leaked one can be exchanged for new session tokens
  repeatedly (subject to the 5-minute nonce-timestamp check described in the
  docs).
- **A long-lived 1Click session/refresh token** reveals the user's confidential
  balances and history for its lifetime. The docs warn that a refresh-token
  holder can mint access tokens until it expires. Longer `expires_in` = longer
  exposure after a leak, and we have no revocation path for 1Click tokens today.
- **Our own agent tokens** stay short (10 min access, rotating refresh, 30-day
  grant, read-only scopes). Nothing here suggests lengthening them.
- **CS-48:** the non-custodial design keeps per-trade user signatures and a
  user-signed mandate with its own expiry. Those must stay short regardless of
  any 1Click auth TTL: mandate expiry in hours-to-days chosen by the user, and
  per-trade signed intents with minute-scale deadlines. A long 1Click session
  token must never be treated as authority to trade.

## 6. Done-when checklist (CS-56)

- [x] Current expiry behaviour written up (section 2).
- [ ] Production acceptance of `external_app_data` `expires_in` — open, not
      testable read-only; safe test plan in section 3.
- [x] Recommendation recorded (section 4): keep current TTLs; 7 days max only
      for a named case after confirmation.
- [x] Security notes recorded, CS-48 mandate/per-trade expiry stays short
      (section 5).
- [x] Quote/deposit `deadline` kept separate from signed-intent `deadline` and
      `expires_in` (section 1).
- [x] No production expiry changed.
