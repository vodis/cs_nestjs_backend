# DEVELOPMENT_GUIDE.md

## Purpose

This guide defines how we build and evolve the crypto-exchange gateway backend for:

- deposit/withdraw lifecycle
- swap quote and execution
- spot and limit order APIs
- multi-network operations
- orchestration with side microservices (`solver`, `spot`, and future services)

The goal is predictable delivery, financial safety, and long-term maintainability.

## Long-Term Topology (Approved)

- `gateway` (this repository, open-source): API edge, validation, auth, orchestration, observability.
- `core-finance` (private): sensitive financial logic, proprietary risk/strategy/provider logic.
- `i18n` (`cs_i18n_service`): independent translations service and language content lifecycle.

This is the default long-term architecture and should guide all new implementation decisions.

## Target Technical Baseline

- Node.js: current LTS (upgrade in lockstep with NestJS support matrix)
- NestJS: latest stable major (plan from current NestJS 10 to latest)
- TypeScript: latest stable minor supported by NestJS
- PostgreSQL for production persistence
- Message broker (recommended): Kafka or NATS for domain/integration events

## Layered Structure (Required)

Use feature modules with internal layering:

```text
src/modules/<feature>/
  presentation/   // controllers, DTOs, validators, response mappers
  application/    // use cases, command/query handlers, policies
  domain/         // entities, value objects, domain services, events
  infrastructure/ // repositories, orm models, http clients, message adapters
```

Rules:

- `presentation` depends on `application` only
- `application` depends on `domain` and ports/interfaces
- `infrastructure` implements ports and can depend on frameworks
- `domain` is framework-agnostic and pure TypeScript

## Use Case Architecture

Each endpoint maps to one use case. Example flows:

- `POST /api/v1/deposits` -> `CreateDepositRequestUseCase`
- `POST /api/v1/withdrawals` -> `RequestWithdrawUseCase`
- `POST /api/v1/swaps/quote` -> `GetSwapQuoteUseCase`
- `POST /api/v1/swaps/execute` -> `ExecuteSwapUseCase`
- `POST /api/v1/spot/orders` -> `CreateLimitOrderUseCase`
- `DELETE /api/v1/spot/orders/:id` -> `CancelOrderUseCase`

Use case template:

1. parse and validate command/query
2. authorize actor and validate policy context
3. load state and enforce domain invariants
4. execute domain logic and side effects through interfaces
5. persist atomic state transition (transaction/outbox where needed)
6. publish integration events
7. return deterministic response

## Architecture Best Practices

- Keep controllers thin; business logic only in use cases/domain.
- Introduce ports for external dependencies:
  - `QuoteProviderPort`, `SpotExecutionPort`, `NetworkAdapterPort`, `RiskPolicyPort`
- Prefer immutable input/output models between layers.
- Use explicit mappers between transport DTOs and domain models.
- Use idempotency keys on all fund-moving or order-mutating operations.
- Enforce numeric precision with decimal libraries/value objects (never float math).
- Write domain errors with stable codes; map to HTTP errors at edge only.

## Microservice Interaction Policy

- Gateway is synchronous entrypoint; side services are internal collaborators.
- For critical flows, combine sync response + async confirmation events.
- Add timeout/retry/circuit-breaker policies per dependency.
- Propagate `traceId` and `requestId` across all calls/messages.
- Define service contracts in versioned schemas (OpenAPI/AsyncAPI/protobuf as chosen).
- Keep open-source boundary clean: gateway depends on private services through explicit contracts only.
- Do not duplicate sensitive business logic in gateway "for convenience."

## Temporal Orchestration Policy

- Adopt Temporal (`docs.temporal.io`) for durable orchestration of long-running financial flows.
- Start with `withdraw` as first workflow, then expand to deposit confirmation and swap execution.
- Keep gateway handlers thin: they start/signal/query workflows; workers execute orchestration logic.
- Map external calls (solver/spot/network providers/signers) to Temporal activities.
- Configure retries/timeouts per activity based on risk and idempotency characteristics.
- Implement compensation/cancellation paths for partially completed flows.
- Preserve deterministic workflow code (no direct random/time/network calls in workflow body).
- Keep short synchronous flows outside Temporal to avoid unnecessary complexity.

Recommended initial workflow set:

- `WithdrawWorkflow`
- `DepositConfirmationWorkflow`
- `SwapExecutionWorkflow`

## Migration Plan to Newest NestJS

### Phase 0 - Stabilize and Measure

- Freeze non-critical refactors.
- Establish baseline CI:
  - unit, integration, e2e, lint, typecheck
- Capture current performance and error-rate baseline.

### Phase 1 - Prepare Codebase

- Remove deprecated Nest patterns and legacy decorators.
- Isolate bootstrap/config code (`main.ts`, app module wiring).
- Introduce architecture tests (dependency rules between layers).

### Phase 2 - Upgrade Dependencies

- Upgrade NestJS core ecosystem (`@nestjs/*`) to latest stable major.
- Upgrade peer deps: `rxjs`, `class-validator`, `class-transformer`, `@nestjs/swagger`.
- Upgrade tooling: `@nestjs/cli`, Jest/ts-jest, ESLint, TypeScript.
- Resolve compile/runtime breaks incrementally.

### Phase 3 - Compatibility and Hardening

- Run full automated test matrix and fix regressions.
- Validate API schema diffs and preserve backward compatibility.
- Run staging soak tests with realistic traffic and downstream mocks.
- Confirm telemetry dashboards and alerts remain accurate.

### Phase 4 - Rollout

- Deploy behind canary/percentage rollout.
- Monitor SLOs and business error rates by flow.
- Keep rollback path ready (image + migration rollback plan).

## Data and Migration Policy

- DB migrations are forward-only, reviewed, and reversible where possible.
- Every migration must include:
  - business reason
  - data safety notes
  - rollback/mitigation strategy
- For risky data transformations, perform expand-and-contract:
  1. add new schema
  2. dual write/read compatibility
  3. backfill
  4. switch reads
  5. remove legacy schema

## Test Strategy and Coverage

### 1) Unit Tests

- Scope: domain services, value objects, use cases, policy evaluators.
- Required for all new business logic.
- Recommended coverage target:
  - `application` + `domain`: >= 85%

### 2) Integration Tests

- Scope: repository adapters, module wiring, HTTP clients to side services (with controlled test doubles).
- Validate transaction boundaries and outbox/event emission behavior.
- Coverage target:
  - `infrastructure`: >= 70%

### 3) E2E Tests

- Scope: API surface with real Nest app bootstrapping and test DB.
- Required critical journeys:
  - deposit request creation and status retrieval
  - withdraw request with policy checks
  - swap quote + execute
  - limit order create/cancel on spot
  - failure paths (timeouts, insufficient balance, policy rejection)

### 4) Regression Tests

- Mandatory for each bug fix from production/staging incidents.
- Must fail before fix and pass after fix.
- Include incident/ticket reference in test name or comment.

### 5) Non-Functional Tests

- Performance tests for hot endpoints (quote, order placement).
- Resilience tests for downstream degradation.
- Security tests for auth, authorization, and input hardening.

## CI/CD Quality Gates

Required checks before merge:

- lint + typecheck pass
- unit/integration/e2e pass
- coverage thresholds pass
- API schema diff reviewed
- migration scripts reviewed when schema changes exist
- changelog/release notes updated for contract-impacting changes

## Latency SLOs and Runtime Targets

- Endpoint latency targets:
  - p95 quote/read: <= 250ms
  - p95 mutating submit (withdraw/order/swap execute request): <= 500ms
- Prefer fast submit + async completion for multi-step financial operations.
- Define per-dependency timeout budget and circuit-breaker policy (`solver`, `spot`, chain/provider APIs).
- Add performance tests for hot paths and track SLO burn in dashboards.
- Treat sustained SLO burn as release blocker for impacted flow.

## Branching and Delivery

- Short-lived feature branches.
- Small PRs with one clear objective.
- PR template sections:
  - business context
  - risk analysis
  - testing evidence
  - migration/rollback notes
- No direct merges to protected branches without green CI.

## Security and Compliance Defaults

- Validate all external inputs; deny unknown fields.
- Centralize permission checks in guards + policy services.
- Redact sensitive fields in logs.
- Persist immutable audit events for financial actions.
- Rotate secrets and keep them outside the repository.
- Enforce idempotency keys for all fund-moving and order-mutating endpoints.
- Use TLS for all network links; apply mTLS for internal service-to-service where feasible.
- Enforce least-privilege IAM roles and short-lived credentials where possible.
- Keep API keys/secrets in secret manager only; no hardcoded credentials in repository.
- Place proprietary strategies/risk scoring/provider tuning in private services or private packages.

## Database Choice and Data Policy

- Production source of truth: **PostgreSQL**.
- Redis is approved for cache, rate limiting, and ephemeral coordination only.
- SQLite is local development/testing only.
- Near-term: single PostgreSQL cluster with service-owned schemas (`gateway`, `core_finance`, `i18n`).
- Long-term: evolve toward database-per-service for stricter isolation and independent scaling.
- Store monetary values with exact decimal types/value objects; never float math.
- Keep auditability by persisting immutable financial events and explicit status transition history.
- Partition/archive high-volume historical tables as traffic grows.

Schema ownership rules:

- Each service owns its schema migrations.
- Cross-service reads must happen via APIs/events, not direct table coupling.
- Shared reporting should use read models/materialized pipelines, not transactional schema sharing.

## Suggested Near-Term Implementation Backlog

1. Refactor current module layout into layered feature modules.
2. Introduce use-case classes for each financial endpoint.
3. Add idempotency middleware/interceptor for mutating endpoints.
4. Add outbox table + publisher worker for reliable events.
5. Build integration contract tests for `solver` and `spot`.
6. Introduce Temporal workers and ship `WithdrawWorkflow` behind feature flag.
7. Introduce Redis cache layer for quote/read hot paths with strict TTLs.
8. Harden security baseline (idempotency enforcement + mTLS + secret rotation checklist).
9. Create `core-finance` private service boundary and move sensitive logic behind contracts.
10. Integrate `cs_i18n_service` through typed client contract and resilience policies.
11. Execute NestJS latest-major migration plan with canary rollout.
