# Bring-your-own agent portfolio integration

The public gateway exposes a read-only MCP resource at `/mcp`. Users authorize an external agent through OAuth 2.1 authorization-code + PKCE or the device authorization grant. The external host owns model-provider login and usage; CraftScript never requests or stores those credentials.

## Deployment

1. Apply `20260819000100-create-agent-portfolio-tables.js`.
2. Deploy with `AGENT_INTEGRATIONS_ENABLED=false`.
3. Set `AGENT_PUBLIC_BASE_URL` to the public API origin and `APP_PUBLIC_BASE_URL` to the Angular origin.
4. Verify OAuth discovery, authorization, token exchange, `/mcp`, and revocation in staging.
5. Redeploy with `AGENT_INTEGRATIONS_ENABLED=true`.

Rollback by setting the capability flag to `false` and redeploying. The migration is additive; retain its tables during rollback so existing grants can be audited and revoked.

## Data boundary

Agent tokens carry only connection identity through opaque, hashed-at-rest credentials. MCP tools derive the user from the grant and accept no user or wallet identifier. Responses omit email, provider subjects, session metadata, and full wallet addresses. There are no write or transaction tools.

Access tokens expire after ten minutes. Refresh tokens rotate on every use, revoke their family on reuse, and cannot outlive the 30-day connection grant.

Authorization codes, device codes, and refresh tokens are consumed inside database transactions with row-level locking. Consent decisions and investment-profile changes require an explicit Privy bearer token; the cookie fallback remains available only to read-only endpoints. Grant lifecycle and MCP access events are appended to `auth_audit_events` without recording token values.

Portfolio snapshots exclude expired balance-cache rows. The top-level `asOf` is the oldest balance or price timestamp used by the snapshot, and is `null` when no current balance data exists.
