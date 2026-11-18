# Plan: CoinGecko-backed chart data (cron → DB → API)

Status: draft for discussion. No code in this change.

Goal: store CoinGecko market history in our Postgres database and serve charts from our API, following the near.com pattern (CoinGecko → cron jobs → our DB → our API). The browser must never call CoinGecko. Start on the CoinGecko **Basic** plan at **$29/month billed yearly**.

This document marks **existing** code and config as they are on `develop` today, and **proposed** work as a checklist of small follow-up PRs.

## 1. Goal and context

Charts should keep working if CoinGecko is slow or rate-limited, and we should not spend a credit on every page load.

**Existing today**

- The Angular app already talks only to this backend. Chart and snapshot traffic does not go to CoinGecko from the browser.
- `GET /api/v1/markets/:symbol/chart?windowSecs=` boots the chart with Hyperliquid OHLCV candles. Supported windows: `3600` (1m), `14400` (5m), `86400` (15m), `604800` (1h). There is no 1M / 1Y / ALL range.
- `GET /api/v1/markets/:symbol/candles` and the SSE / WebSocket streams also use Hyperliquid.
- `GET /api/v1/markets/snapshots?symbols=` calls CoinGecko `GET /coins/markets` and caches the result in process memory for `MARKET_SNAPSHOT_CACHE_TTL_MS` (default 5 minutes). Max 30 symbols per request. Returns USD price, 24h change, market cap, 24h volume, and a 7d sparkline.
- `GET /api/v1/markets/comparison` (swap-pair performance) already falls back Hyperliquid → CoinGecko `GET /coins/{id}/market_chart/range` → optional GeckoTerminal. GeckoTerminal is off by default (`MARKET_HISTORY_ENABLE_GECKOTERMINAL=false`).
- Spot prices on `GET /api/v1/assets` come from the 1Click `/v0/tokens` catalog (`price`, `priceUpdatedAt`), cached for `ASSETS_CACHE_TTL_MS` (default 5 minutes). Chart `currentPrice` uses Hyperliquid `markPx` when the market exists there.
- Symbol → CoinGecko id mapping lives in `src/api/markets/coingecko-ids.ts` (`coinGeckoIdsBySymbol`, **54 symbols**) plus env overrides `MARKET_COINGECKO_ID_<SYMBOL>`.
- `COINGECKO_API_KEY` and `COINGECKO_API_URL` are already in `.env.example`. The default URL is the public `https://api.coingecko.com/api/v3`. `CoinGeckoMarketSnapshotClient` sends `x-cg-pro-api-key` when the URL host is `pro-api.coingecko.com`, otherwise `x-cg-demo-api-key`. **`CoinGeckoMarketHistoryClient` does not attach the key today.**
- Database is PostgreSQL via Sequelize (`sequelize-typescript` models in `src/database/models/`, migrations in `db/migrations/`). There are **no** price-history tables. There is **no** `@nestjs/schedule` (or other cron) dependency. Snapshot and history caches are in-memory only, so they do not survive restarts and are not shared across instances.

**Proposed**

- Keep 1Click (and Hyperliquid mids) as the live spot feed.
- Ingest CoinGecko historical series and market snapshots on a schedule, persist them, and serve longer chart ranges from the database.
- Extend the existing `MarketsModule` and `GET /api/v1/markets/:symbol/chart` rather than adding a parallel `/tokens/:id/chart` API.
- Use Hyperliquid candles only where they already work well (short windows, assets that exist on Hyperliquid). Use the new DB series for tokens and ranges Hyperliquid cannot cover.

## 2. Jobs

Introduce `@nestjs/schedule` inside `MarketsModule` (proposed). Guard every job with a Postgres advisory lock so multiple API instances do not double-run and double-spend credits. Temporal is mentioned in `DEVELOPMENT_GUIDE.md` as a future orchestration path; it is not in this repo today, so start with in-process cron plus a lock.

Times below are UTC. CoinGecko publishes the previous day's completed daily point after 00:35 UTC, so the daily job is at **00:40**, not 00:20 (near.com's schedule is too early for a reliable final daily close).

| Job | Schedule | CoinGecko endpoint | What it writes | Notes |
|---|---|---|---|---|
| Live | every 1 minute (interval configurable 1–5 min) | `GET /coins/markets` (`vs_currency=usd`, up to 250 ids per page, sparkline / 24h / 7d change as needed) | `market_snapshots`; registers newly seen tokens for bootstrap | Reuse and extend **existing** `CoinGeckoMarketSnapshotClient.getMarkets`. One page covers the 54 mapped symbols with room to spare. |
| Bootstrap | every 10 minutes | `GET /coins/{id}/market_chart` (and/or `/market_chart/range`) | backfill `market_price_points` (daily, plus recent intraday) for tokens not yet bootstrapped | Only for newly added / unmapped-then-mapped tokens. About 1.5 calls per new token. |
| Hourly | minute 5 of every hour | `GET /coins/{id}/market_chart?vs_currency=usd&days=1` | upsert 5-minute intraday points | 5-minute granularity is retained by CoinGecko for the last 1 day only, on every plan including Basic. **Default: run only for "charted/active" tokens**, not every mapped symbol. |
| Daily | 00:40 | `GET /coins/{id}/market_chart` (daily history) and `GET /coins/categories` | upsert daily points; refresh categories; prune intraday older than the retention window | Daily after 00:35 so the last completed day is present. |

**Proposed shared client behaviour** (apply to both existing CoinGecko clients, then to the jobs): always send the API key; retry with backoff on 429 using `Retry-After` (the in-memory `MarketHistoryCache` already does a version of this for on-demand history); cap concurrency; count credits.

## 3. Subscription we might use

Recommendation: start with **CoinGecko API Basic, $29/month billed yearly** ($348/year; $35 if billed monthly).

Checked 18 Nov 2026 against [CoinGecko API pricing](https://www.coingecko.com/en/api/pricing) and [market chart docs](https://docs.coingecko.com/reference/coins-id-market-chart).

| Plan | Monthly | Yearly equivalent | Credits / month | Rate limit | History depth | Fits this design when… |
|---|---|---|---|---|---|---|
| Demo | $0 | — | 10k (public), 30/min | No commercial licence | Not usable for CraftScript | Never. |
| **Basic (recommended start)** | **$35** | **$29/mo ($348/yr)** | **100k** | **300 calls/min** | Daily + hourly: 2 years; 5-min: last 1 day | Up to ~120 tokens if hourly runs for every token; more if hourly is limited to active tokens. The current 54 mapped symbols fit. |
| Analyst | $129 | $103.20/mo | 500k | 500/min | Daily from 2013, hourly from 2018 | ~250 tokens with hourly-for-all, or when we need history before the Basic 2-year window. |
| Lite | $499 | $399.20/mo | 2M | 500/min | Same deeper history | ~1,000 tokens; stagger the hourly job over ≥2 minutes to stay under 500/min. |
| Pro | $999 | $799.20/mo | 5M | 1,000/min | Same deeper history | Further growth. |

Other plan facts:

- 1 REST call = 1 credit. Credits reset on the 1st of each month.
- Overage is $0.0005/call and is **off** by default. Leave it off and fail jobs softly when the budget is exhausted, rather than surprising billing.
- Paid plans require on-screen attribution: "Data provided by CoinGecko" with a link to `https://www.coingecko.com/en/api`.
- Paid access uses `https://pro-api.coingecko.com/api/v3` and the `x-cg-pro-api-key` header. The snapshot client already selects that header from the URL. Switch `COINGECKO_API_URL` when the key is provisioned; do not commit the key.

The 54 symbols already in `coinGeckoIdsBySymbol` are: AAVE, ADA, ALEO, APT, ARB, AURORA, AVAX, BCH, BERA, BNB, BOME, BTC, DAI, DOGE, ETH, GMX, GNO, KAITO, KNC, LINK, LTC, MELANIA, MOG, NEAR, OKB, OP, PENGU, PEPE, POL, PUBLIC, REF, SAFE, SHIB, SOL, SPX, STRK, SUI, SWEAT, TON, TRUMP, TRX, TURBO, UNI, USDC, USDT, VVV, WBTC, WETH, WIF, WNEAR, XAUT, XLM, XRP, ZEC. How many additional 1Click catalog tokens we will map is still an open question and is what would push us from Basic to Analyst.

## 4. Credit budget

Assumptions: 30-day month; 1 REST call = 1 credit.

| Job | Formula | 54 mapped symbols (all hourly) | 50 tokens | ~120 tokens (Basic ceiling, hourly-for-all) | 250 tokens | 1,000 tokens |
|---|---|---|---|---|---|---|
| Live | 1 page/min × 43,200 min, if ≤250 ids | 43,200 | 43,200 | 43,200 | 43,200 | 43,200 × pages |
| Hourly | 720 calls / token / month | 38,880 | 36,000 | 86,400 | 180,000 | 720,000 |
| Daily | 30 / token + 30 (categories) | 1,650 | 1,530 | 3,630 | 7,530 | 30,030 |
| Bootstrap | ~1.5 / new token | small | small | small | small | small |
| **Total** | | **~83.7k** | **~80.7k** | **~133k (over Basic)** | **~231k** | **~923k** |

54 symbols with hourly-for-all use about 84k of Basic's 100k credits — tight, but it fits. Adding more mappings without narrowing the hourly set will not.

**Guardrails to stay on Basic**

1. Hourly refresh only "charted/active" tokens: recently viewed on the chart endpoint, recently traded, or an explicit allowlist. Everyone else gets daily points only. This is the main lever.
2. Make the live job interval configurable (`MARKET_SNAPSHOT_CRON_INTERVAL_MIN`, 1–5). A 5-minute live interval cuts that job to 8,640 calls, but it does not by itself drop a 250-token hourly-for-all workload onto Basic.
3. Optional later: CoinGecko WebSocket (0.1 credit/response) for live prices. Not required for the first version; 1Click + Hyperliquid already cover spot.
4. Credit counter in logs / metrics. Alert at ~80% of the monthly budget. Verify whether `GET /key` (or the current usage endpoint in CoinGecko's docs at implementation time) returns remaining credits; if it does, poll it from the daily job. If it does not, count our own outbound calls.
5. Leave overage off. Skip or delay non-critical jobs when the budget is exhausted.

## 5. Data model (proposed)

Sequelize + PostgreSQL, same pattern as existing models (`@Table`, underscored, registered in `src/database/database.module.ts`) and timestamped migrations under `db/migrations/`. Table names are proposals.

### `market_token_mappings`

Resolves our symbol / asset to a CoinGecko id. Seed from **existing** `coinGeckoIdsBySymbol`. Keep env `MARKET_COINGECKO_ID_<SYMBOL>` as an emergency override during rollout, then prefer this table for manual fixes (for example NEAR-listed tokens such as nTTWO that do not share the obvious CoinGecko id).

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| symbol | STRING, unique with `asset_id` | Uppercase, same normalisation as `MarketsService` |
| asset_id | STRING, nullable | 1Click / defuse asset id when we care about a specific listing |
| coingecko_id | STRING, not null | |
| source | ENUM (`seed`, `env`, `auto`, `manual`) | `manual` wins |
| history_enabled | BOOLEAN | default true |
| hourly_refresh | BOOLEAN | default false; set true for active/allowlisted tokens |
| bootstrap_status | ENUM (`pending`, `complete`, `failed`, `unsupported`) | |
| last_bootstrapped_at, last_hourly_at, last_daily_at | TIMESTAMPTZ | |
| created_at, updated_at | TIMESTAMPTZ | |

Unique `(symbol, asset_id)`. Index `coingecko_id`. Index `(hourly_refresh, history_enabled)`.

### `market_price_points`

One row per token, timestamp, and resolution. Upsert on `(mapping_id, resolution, time)`.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | or omit and use the unique key as PK |
| mapping_id | UUID FK | |
| resolution | ENUM (`min5`, `hourly`, `daily`) | |
| time | TIMESTAMPTZ | candle / sample start, UTC |
| price_usd | DECIMAL | required |
| market_cap_usd, volume_usd | DECIMAL, nullable | when the endpoint provides them |
| created_at, updated_at | TIMESTAMPTZ | |

Indexes: unique `(mapping_id, resolution, time)`; `(mapping_id, resolution, time DESC)` for chart reads.

Retention (proposed, configurable):

- `min5`: 2–7 days, then prune in the daily job. (CoinGecko itself only keeps 5-minute data for 1 day, so we cannot backfill older 5-minute points later.)
- `hourly`: keep up to the plan's hourly depth (2 years on Basic). Optional: we may skip storing a separate hourly series at first and downsample `min5` plus `daily` in the API.
- `daily`: keep the full series we have ingested.

### `market_snapshots`

Latest CoinGecko market snapshot per mapping. Replaces the process-local cache in `MarketSnapshotService` as the source of truth, with a short in-memory cache still allowed in front.

Columns (align with **existing** `MarketSnapshotDto`): `mapping_id` unique, `price_usd`, `change_24h_percent`, `change_7d_percent` (optional), `market_cap_usd`, `volume_24h_usd`, `sparkline_7d` JSONB, `fetched_at`, `updated_at`.

`GET /api/v1/markets/snapshots` should read this table (or the short cache in front of it) instead of calling CoinGecko on demand.

### `market_categories`

Optional, filled by the daily `GET /coins/categories` job. Defer if no UI needs it in the first version.

## 6. API

Keep the existing prefix `/api/v1` and the existing markets routes. Do not introduce a second chart contract unless the frontend cannot extend the current one.

**Proposed changes to existing endpoints**

- `GET /api/v1/markets/:symbol/chart`
  - Keep `windowSecs` for the current 1h / 4h / 1d / 7d Hyperliquid bootstrap so the current app does not break.
  - Add `range=1D|7D|1M|1Y|ALL` (and/or additional `windowSecs` values). Serve from `market_price_points`:
    - `1D` → `min5`
    - `7D` / `1M` → hourly (or downsampled `min5` + daily)
    - `1Y` / `ALL` → daily
  - For tokens that exist on Hyperliquid, short windows may still use Hyperliquid candles, with DB as fallback.
  - Response: existing candle / chart DTO shape where possible, plus `source` (`database` / `hyperliquid` / `unavailable`), `bootstrapStatus`, and cache headers (`Cache-Control: public, max-age=…` scaled to the range: short for 1D, longer for 1Y/ALL).
  - If bootstrap is still `pending`, return `200` with an empty series and `bootstrapStatus: "pending"` — do not 404 or 503.
- `GET /api/v1/markets/snapshots` — read persisted snapshots. Same DTO. `meta.source` stays `coingecko` | `unavailable`.
- `GET /api/v1/markets/comparison` — prefer DB history when present; keep the current provider fallback for gaps.

Mark a chart read as "active" (sets `hourly_refresh` on the mapping, with a TTL) so the hourly job stays targeted.

## 7. Implementation steps (small PRs)

All PRs target `develop`. Acceptance criteria are in each step.

1. **Config and client hardening**
   - Document `COINGECKO_API_URL=https://pro-api.coingecko.com/api/v3` for paid keys; keep the key backend-only (already stated in `.env.example`).
   - Attach the API key on **all** CoinGecko calls, including `CoinGeckoMarketHistoryClient` (gap today).
   - Shared rate limiter + 429 retries/backoff, credit counter.
   - Acceptance: snapshot and history clients send the correct header against pro-api; 429 is retried and not charged as success; tests cover missing key, 429, and redaction (already started in the snapshot client spec).

2. **Migrations and models**
   - Add the tables above; register models in `DatabaseModule`; seed mappings from `coinGeckoIdsBySymbol`.
   - Acceptance: `pnpm db:migrate` is reversible; unique upsert keys exist; seed matches the 54 known ids.

3. **Jobs**
   - Add `@nestjs/schedule`, the four jobs, advisory lock, interval config, hourly allowlist behaviour, prune.
   - Acceptance: a single instance runs each tick; a second instance no-ops on the lock; live job upserts snapshots for mapped ids; bootstrap then hourly/daily write points; prune removes old `min5` rows only.

4. **Chart and snapshot reads from DB**
   - Wire the endpoint changes in section 6.
   - Acceptance: 1D/7D/1M/1Y/ALL return the right resolution; pending bootstrap returns an empty series; existing `windowSecs` clients still work; snapshots no longer call CoinGecko on the request path.

5. **Frontend (separate PR in `cs_ng_app_client`)**
   - Switch longer ranges to the new `range` param; keep short Hyperliquid windows if desired.
   - Show "Data provided by CoinGecko" with a link to `https://www.coingecko.com/en/api` wherever CoinGecko-backed series or snapshots are shown.
   - Empty/pending chart state.
   - Acceptance: no browser calls to `api.coingecko.com` or `pro-api.coingecko.com`; attribution is visible on chart views.

6. **Monitoring**
   - Log credits used per job, monthly total, lock failures, 429s, bootstrap failures.
   - Alert at 80% of 100k (configurable). Verify the CoinGecko key-usage endpoint at implementation time.
   - Acceptance: a dry-run or staging day can answer "how many credits did we use?" without reading application logs by hand.

## 8. Risks and open questions

- **Aggregated history, not per-exchange.** CoinGecko `market_chart` is a blended price. There is no verified endpoint for a single listing's history (for example Backpack's TTWO). Manual `market_token_mappings` overrides fix identity, not venue-specific series. If a listing must diverge from the CoinGecko aggregate, we need another source.
- **Tokens missing on CoinGecko.** GeckoTerminal is already an optional on-demand fallback and **shares the same credit pool** if we later use a paid CoinGecko on-chain API. Keep it off until a specific unmapped asset needs it. Mark those mappings `unsupported` rather than retrying forever.
- **CoinGecko terms.** Cache refresh must be at least every 24 hours for stored data (our hourly/daily jobs satisfy this for active tokens; confirm the clause for daily-only tokens). If the subscription ends, delete stored CoinGecko data from these tables.
- **Tracked-token count is still unknown.** 54 mapped symbols fit Basic even with hourly-for-all. The 1Click catalog may add more. Count distinct catalog symbols vs mapped ids before buying the key; that number is what decides Basic vs Analyst.
- **Multiple instances.** Without an advisory lock (or equivalent), two API replicas will double the credit spend. This must ship with the first jobs PR.
- **History client auth gap.** On-demand `market_chart/range` calls today go out without `COINGECKO_API_KEY`. On a paid plan / pro-api host those calls will fail until step 1 is done. Fix this before pointing `COINGECKO_API_URL` at pro-api.
- **`MARKET_HISTORY_PROVIDER_ORDER`** is in `.env.example` but the comparison fallback order is hardcoded (Hyperliquid → CoinGecko → GeckoTerminal). Not required for this plan; tidy it up if we touch that path.
- **In-memory snapshot cache** will be stale or split across replicas until snapshots are persisted. The live job plus a DB read fixes that.
- **Demo vs Basic.** A Demo key has no commercial rights. Staging may use Demo only for wiring tests; production must use Basic (or higher) and show attribution.

## Decision

Start implementation against Basic ($29/month yearly) once the key is available. Ship client hardening and mappings first, then jobs with the hourly allowlist default, then DB-backed chart reads. Revisit Analyst only if mapped tokens that need hourly refresh grow past the budget in section 4, or if we need history older than two years.
