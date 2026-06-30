# Backend Security and Architecture Audit

Last reviewed: 2026-06-24

## Scope

This audit compares the documented backend architecture with the current NestJS runtime surface. It is intentionally limited to repository-visible code and docs; orchestrator host policy, cloud firewall rules, and provider consoles must be reviewed in their owning systems.

## Current Runtime Shape

- Public API base: `/api/v1`.
- Public health check: `/health`.
- Swagger UI/OpenAPI JSON: mounted at `/swagger` and `/swagger-json` in every environment.
- Auth: Privy access token accepted from `Authorization: Bearer ...`; cookie fallback uses `privy-token`.
- CORS: restricted by `ALLOWED_ORIGIN` only when `NODE_ENV=production`; non-production allows all origins.
- Websocket chart endpoint: `/api/v1/markets/chart/ws`.
- Validation: global `ValidationPipe` uses `whitelist: true` and `transform: true`.
- Production config: injected by the orchestrator at container creation time.

## Findings

### High: Target Architecture Reads Like Implemented Architecture

`AGENT_GUIDE.md` and `DEVELOPMENT_GUIDE.md` describe financial-grade controls such as idempotency keys, centralized authorization, rate limiting, audit events, outbox, readiness checks, and policy gates. Those are correct target requirements, but they are not all implemented across the current endpoint surface.

Risk: future work can incorrectly assume these controls already exist and build fund-moving flows on top of incomplete safeguards.

Fix direction:

- Treat the guides as target policy unless a control is explicitly listed as implemented.
- Do not add fund-moving or order-mutating execution endpoints until idempotency, authorization policy, audit events, and failure-state modeling are implemented and tested.

### High: Cookie Auth Requires CSRF/Origin Policy Before Sensitive Mutations

The API accepts a Privy access token from the `privy-token` cookie. Cookie-based auth is convenient for clients, but any state-changing cookie-auth endpoint needs a deliberate CSRF stance.

Current mitigating factors:

- Production CORS is origin-restricted when `NODE_ENV=production`.
- Auth also supports bearer tokens.

Gaps:

- No explicit CSRF token or double-submit policy is documented.
- No documented rule that cookie-auth mutations must validate `Origin`/`Referer` and same-site cookie settings at the client boundary.

Fix direction:

- Prefer bearer-token auth for API mutations where possible.
- If cookie auth remains supported for mutations, require a CSRF token or explicit origin validation middleware before expanding sensitive write endpoints.
- Document expected cookie attributes in the frontend/auth integration docs: `Secure`, `HttpOnly` where possible, and a deliberate `SameSite` value.

### Medium: Swagger Is Public In Production

Swagger is mounted unconditionally. This is useful during integration but should be an explicit production decision, not an accidental default.

Risk: the public schema makes endpoint discovery easier, including partially implemented flows and operational details.

Fix direction:

- Gate Swagger behind a production env flag such as `SWAGGER_ENABLED=false` by default, or protect it at the edge.
- If kept public, document it as an intentional public API contract and monitor it like any other public route.

### Medium: Websocket CORS Is More Permissive Than HTTP CORS

The chart websocket gateway allows `origin: true`, while HTTP CORS is restricted in production.

Risk: browser-based websocket consumers from untrusted origins can connect unless blocked elsewhere.

Fix direction:

- Reuse the same `ALLOWED_ORIGIN` policy for websocket upgrades.
- Add e2e coverage for allowed and rejected origins before changing this in production.

### Medium: Missing App-Level Request Hardening

The current app bootstrap does not configure common HTTP hardening controls in repository-visible code.

Recommended baseline:

- security headers, for example via Helmet;
- body size limits appropriate for API payloads;
- global or route-level rate limiting for public endpoints;
- request id/correlation id propagation;
- structured logging with redaction policy.

Some controls may already exist at Nginx/WAF/orchestrator level. If so, document which layer owns them and add app-level tests only where the app owns the control.

### Medium: Required Env Contract Is Not Enforced at Startup

The app reads required values such as `CS_I18N_SERVICE_URL`, `DEFAULT_LANGUAGE`, `COOKIES_DOMAIN`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, and `PRIVY_VERIFICATION_KEY` at feature execution time. `DATABASE_URL` is strongly expected for production, but the database module can fall back to discrete local-style DB settings.

Risk: a container can boot successfully and then fail only when a specific endpoint or auth path is exercised.

Fix direction:

- Add startup validation for production-required env values.
- Keep `.env.example`, orchestrator catalog, and `docs/ORCHESTRATOR_INTEGRATION.md` in sync.
- Mark reserved env names separately from values consumed by current code.

### Medium: Runtime Config Changes Need Redeploy

Docker container environment variables are immutable after container creation. Updating orchestrator catalog values does not change already-running backend containers.

Fix direction:

- Treat production runtime env changes as deploy events.
- Use the normal orchestrator deployment path, or a documented config-only redeploy mechanism once it exists.
- Do not use manual `docker restart` as a way to apply new env values.

### Low: README Was Still Generic NestJS Starter Content

The previous README did not reflect the service mission, branch flow, deployment authority, or security posture.

Fix direction:

- Keep README short and project-specific.
- Use `AGENT_GUIDE.md` and this audit as the operational entry points.

## Required Before Fund-Moving Endpoints

Before implementing withdrawal execution, swap execution, spot order placement, or any similar value-moving endpoint, the PR must include:

- authenticated actor and authorization policy;
- idempotency key contract and replay behavior;
- immutable audit event or equivalent append-only state transition;
- exact decimal handling for monetary values;
- timeout, retry, and circuit-breaker policy for every provider call;
- tests for auth failure, authorization failure, duplicate request replay, provider timeout, and partial failure;
- migration/rollback notes if schema changes are present.

## Recommended Fix Order

1. Add startup env validation for required production settings.
2. Gate or explicitly publish Swagger in production.
3. Align websocket origin checks with HTTP CORS.
4. Add request size limits and security headers.
5. Add public endpoint rate limiting.
6. Implement idempotency and audit-event primitives before fund-moving mutations.
7. Add architecture tests for `presentation -> application -> domain` dependency rules.
