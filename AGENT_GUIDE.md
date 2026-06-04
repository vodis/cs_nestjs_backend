# AGENT_GUIDE.md

## Documentation index (start here)

Use **this file** as the single anchor when starting a new task or onboarding an agent. It summarizes product intent and policy; the linked documents carry detailed procedures.

| Document | Role |
|----------|------|
| **AGENT_GUIDE.md** (this file) | Mission, long-term topology, architecture standards, Temporal policy, latency/security/DB policy, testing gates, non-negotiables. |
| [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md) | Layers, use cases, NestJS upgrade path, Temporal orchestration, CI gates, branching, security/compliance defaults, backlog hints. |
| [INFRASTRUCTURE_ROADMAP.md](./INFRASTRUCTURE_ROADMAP.md) | Ubuntu/Docker → observability → Kubernetes decision; `craftscript.com` DNS/TLS; resilience and ops maturity. |
| [DEPLOYMENT_AND_MIGRATIONS_GUIDE.md](./DEPLOYMENT_AND_MIGRATIONS_GUIDE.md) | Multi-service deploys, who runs DB migrations, schema-per-service, rollout order, env/secrets, when *not* to use a global migration repo. |
| [README.md](./README.md) | Project bootstrap: install, run, test scripts (starter-level; extend as the app grows). |
| [docs/ORCHESTRATOR_INTEGRATION.md](./docs/ORCHESTRATOR_INTEGRATION.md) | GHCR production CI, `deploy-metadata.json`, health endpoint, cutover checklist. |

**Related repositories (not in this tree)**

- Translation service: local `cs_i18n_service`, remote `git@github.com:vodis/cs_i18n_service.git` — bounded context for i18n; integrate via `i18n-api` / client module per [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md).
- Private `core-finance` and other side services — contracts and ports only in this gateway repo; implementation lives in private repos.

**Prompt pattern for new tasks**

> Follow [AGENT_GUIDE.md](./AGENT_GUIDE.md) and linked docs. Scope: \<feature\>. Respect open-source vs private boundaries and financial-safety rules.

## Mission

This repository is the first-class backend gateway for our financial platform with crypto exchange capabilities:

- swap, deposit, withdraw
- spot and limit order routing
- multi-network support (EVM and non-EVM where required)
- coordination with side microservices (for example: `solver`, `spot`)

The gateway is the single, stable entry point for client applications and partner integrations.

## Long-Term Architecture Decision

Adopt a boundary-first model:

- public/open-source gateway repository for API contracts and orchestration
- private services/repositories for sensitive business logic and provider strategies
- dedicated translation service (`cs_i18n_service`) as an independent bounded context

This model optimizes long-term security, maintainability, and team velocity.

## Product and Domain Focus

- **Gateway responsibilities**
  - API contract ownership (REST/WS)
  - authn/authz, request validation, idempotency, rate limiting
  - orchestration across microservices
  - deterministic state transitions and audit events
  - public API versioning and backward compatibility
- **Open-source boundary**
  - keep only non-sensitive orchestration and transport logic in this repository
  - expose ports/interfaces, not proprietary trading/risk implementations
- **Side-service responsibilities**
  - `core-finance` (private): sensitive business logic, risk rules, settlement decisions
  - `solver`: route discovery, quote optimization, execution planning
  - `spot`: order book, matching/placement orchestration, fills/trades lifecycle
  - network adapters: deposit/withdraw address handling, chain transaction tracking
  - `i18n` (`cs_i18n_service`): translations and language assets
- **Out of scope for gateway**
  - heavy matching engines or route optimization algorithms
  - long-running blockchain indexer workers
  - settlement ledger internals owned by dedicated services
  - proprietary risk/scoring/anti-fraud models

## Architecture Standards Policy

### 1) Architectural Style

Use **modular clean architecture** with explicit use cases:

- `presentation` (controllers, DTOs, API models)
- `application` (use cases, orchestration, policies)
- `domain` (entities, value objects, domain services, domain events)
- `infrastructure` (database repos, HTTP clients, message bus adapters, chain clients)

No framework details should leak into `domain`.

### 2) Boundaries and Dependencies

- Allowed dependency direction: `presentation -> application -> domain`, `infrastructure -> application/domain`.
- Forbidden:
  - controller directly calling repository
  - domain importing NestJS decorators or ORM models
  - cross-module imports bypassing public interfaces
- Each module must expose a small public API (`index.ts`) and hide internals.
- Sensitive logic must not be committed to public repositories; integrate via private service APIs or private packages.

### 3) API and Contract Rules

- Version APIs (`/api/v1`, `/api/v2`) and deprecate with migration windows.
- DTOs are strict and validated (`class-validator` + whitelist).
- All mutating operations require:
  - idempotency key
  - request correlation id
  - actor identity and permission context
- Error model is stable and typed (`code`, `message`, `details`, `traceId`).

### 4) Financial-Safety and Risk Controls

- Never execute value movement without:
  - policy checks (limits, KYC/AML flags, sanctions/risk flags if integrated)
  - balance/availability checks
  - explicit state transition record
- Use deterministic decimal handling. Never use floating-point for money.
- Enforce safe defaults:
  - deny by default on policy uncertainty
  - retry only idempotent operations
  - circuit breaker for downstream failures

### 4.1) Exchange/Spot Trading Asset Ownership

This backend/BFF owns the canonical supported asset/token registry for exchange, spot trading, solver, and balance workflows.

- Own token identifiers, decimals, chain/network mappings, tradable/depositable/withdrawable flags, risk/safety flags, and public asset metadata exposed to clients.
- Execute private RPC balance reads through server-side adapters only; clients and wallet MFEs must not call private RPC directly.
- Validate every quote, balance, order, and execution request against the server-side registry and reject unsupported assets by default.
- Expose versioned read/execution contracts such as `/api/v1/assets`, `/api/v1/balances`, `/api/v1/markets`, `/api/v1/swaps/quote`, and `/api/v1/spot/orders`.
- Treat client-side or community token lists as non-authoritative inputs. Ingest, validate, and allowlist them server-side before they affect balances, quotes, orders, or execution.
- Keep `cs_ng_app_client` responsible for rendering/mapping backend-provided assets, and keep `cs_mfe-wallets` responsible only for wallet connectivity, account/chain events, safety/verification gates, and signing prepared payloads.

### 5) Multi-Network Rules

- Introduce chain/network abstraction (`NetworkAdapter` contract).
- Keep chain-specific logic in adapters, not in controllers/use cases.
- Normalize transaction statuses into a platform enum:
  - `created`, `submitted`, `pending`, `confirmed`, `failed`, `reversed`
- Require finality policy per network (confirmations, reorg strategy).

### 6) Eventing and Async Processing

- Use outbox pattern for reliable event publication.
- Events are immutable, versioned, and include `eventId`, `aggregateId`, `occurredAt`.
- Consumers must be idempotent and replay-safe.

### 6.1) Temporal Workflow Policy

- Temporal is the default orchestration engine for long-running, multi-step financial workflows.
- Use Temporal for:
  - withdrawal lifecycle (policy -> signing -> broadcast -> confirmation)
  - deposit confirmation tracking across networks
  - swap/order flows that require retries, compensation, or delayed confirmations
- Do not use Temporal for simple synchronous read endpoints or trivial stateless handlers.
- Workflow code must remain deterministic; external I/O must run in activities.
- Activities must be idempotent and include correlation/idempotency keys.
- Workflow state transitions must emit auditable events with `traceId` continuity.

### 7) Observability and Operations

- Structured logs with correlation id and actor id.
- OpenTelemetry traces across gateway -> side services -> external providers.
- SLOs:
  - p95 latency per critical endpoint
  - error budget by domain flow (swap/deposit/withdraw/order)
- Add health/readiness checks for all critical dependencies.

### 8) Security Baseline

- JWT/session validation centralized in guards.
- Principle of least privilege for service-to-service auth.
- Secrets only from secret manager or runtime env, never committed.
- Request signing for high-risk partner integrations where applicable.

## Use Case Architecture (Required Pattern)

Each business capability must be represented as an explicit use case:

- `CreateDepositRequestUseCase`
- `RequestWithdrawUseCase`
- `GetSwapQuoteUseCase`
- `ExecuteSwapUseCase`
- `CreateLimitOrderUseCase`
- `CancelOrderUseCase`

Use-case contract:

1. validate input and actor permissions
2. load required aggregates/read models
3. enforce business invariants
4. call domain service or external port
5. persist state transition
6. emit domain/integration event
7. return response model

## Definition of Done (Engineering Policy)

A task is done only if:

- architecture boundary rules are respected
- unit + integration tests are added/updated
- regression tests exist for bug fixes
- observability is updated (logs/metrics/traces where relevant)
- migration notes are included for contract or schema changes
- API documentation is updated

## Coding and Review Best Practices

- Prefer small, composable modules over shared god-services.
- One use case, one responsibility.
- Keep controllers thin; no business logic in controllers.
- Use explicit interfaces for repositories/clients.
- Fail fast on invalid input; return typed domain errors.
- Every PR must include risk notes for financial flows.

## NestJS Upgrade Direction (Strategic)

Current baseline is NestJS 10. Target is **latest stable NestJS major** (NestJS 11 or newer at implementation time) with current LTS Node.

Policy:

- no direct framework usage in domain
- isolate framework-specific upgrades to `presentation/infrastructure/bootstrap`
- maintain compatibility test suite before and after upgrade

## Testing Coverage Standard

Minimum quality gates:

- **Unit tests**: business logic and domain services
  - target >= 85% statements/functions in `application` + `domain`
- **Integration tests**: module wiring + db adapters + http clients (mock upstream where needed)
  - target >= 70% for `infrastructure` adapters
- **Regression tests**: mandatory for every production bug
  - test name references incident/ticket id
- **E2E/API tests**: critical paths
  - deposit request, withdraw request, swap quote/execute, limit order create/cancel

Coverage is not a vanity metric; critical risk branches must be explicitly tested.

## Latency and Performance Policy

- Define and monitor latency SLOs by endpoint class:
  - quote/read endpoints: p95 <= 250ms
  - mutating submit endpoints (withdraw/order/swap execute request): p95 <= 500ms
- API must return quickly for accepted long-running actions; completion is async via events/workflows.
- Set explicit timeout budgets for downstream calls and avoid unbounded waits.
- Use cache (for example Redis) only for ephemeral data (quotes, rate-limits, short TTL reads), never as source of truth for balances.
- Propagate and log `traceId` across gateway, Temporal workflows, side services, and adapters.

## Security Policy (Financial Grade)

- Enforce authn/authz on every mutating endpoint (RBAC/ABAC + policy checks).
- Require idempotency keys for all fund-moving and order-mutating operations.
- Encrypt data in transit and at rest; apply field-level protection for sensitive data.
- Redact secrets and sensitive financial payloads from logs.
- Keep immutable audit events for all state-changing financial actions.
- Apply least-privilege IAM and service credentials with regular rotation.

## Database Decision Standard

- Primary transactional database: **PostgreSQL** (production source of truth).
- Cache/ephemeral state: **Redis** (non-authoritative).
- `sqlite3` is local dev/test only and must not be used in production runtime.
- Near-term data model: one PostgreSQL cluster with service-owned schemas (`gateway`, `core_finance`, `i18n`).
- Long-term target: database-per-service where compliance/scale requires stronger isolation.
- Model financial state with append-friendly auditability:
  - immutable transaction/audit records
  - explicit state transition history for withdrawals, deposits, swaps, orders
- Use forward-only migrations with rollback/mitigation plan documented per release.

## Initial Module Map (Reference)

- `modules/gateway-auth`
- `modules/accounts`
- `modules/wallets` (deposit/withdraw abstractions)
- `modules/swaps` (quotes + execute via solver)
- `modules/spot-orders` (limit/market via spot service)
- `modules/networks` (adapter registry)
- `modules/risk-policy`
- `modules/audit-events`
- `modules/core-finance-client` (private service integration boundary)
- `modules/i18n-client` (translation service integration boundary)

## Non-Negotiable Rules

- Never merge code that can move funds without policy + idempotency checks.
- Never add business logic directly into transport/infrastructure layers.
- Never change API contracts without versioning and migration notes.
- Never ship without automated tests for critical financial paths.
- Never commit proprietary keys, strategies, or sensitive provider contracts into public code.
