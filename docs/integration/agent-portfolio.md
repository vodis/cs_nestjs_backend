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

## OAuth client metadata and consent identity

Browser and CLI authorization-code clients must publish a Client ID Metadata
Document at their canonical HTTPS `client_id` URL (default port, a non-root path,
no credentials or fragment, maximum 255 characters). The document must name that
exact URL, permit public-client (`none`) token authentication and register the
requested redirect. HTTPS redirects match exactly; registered HTTP loopback
redirects may vary only their port. `localhost`, `127.0.0.1` and `[::1]` are
separate hosts. Token exchange still binds the exact redirect used to authorize.
Dynamic client registration is not supported.

Metadata fetching permits only public addresses, validates every DNS answer in
the socket lookup, refuses redirects, and has a three-second deadline and 5 KB
body limit. Successful documents are cached for five minutes by default, with
`max-age` bounded to one minute–24 hours; `no-store`/`no-cache` disable caching.
Failures are cached for 30 seconds. Concurrent requests for the same URL share
one fetch. Each process permits at most 16 active fetches, including at most four
per origin. Excess distinct URLs are rejected immediately with `invalid_client`,
without queuing or caching the rejection; cache hits remain available. Capacity
rejection never activates the pinned ChatGPT fallback.

`GET /oauth/authorize` additionally admits at most 120 requests in any rolling
60-second window per process, before metadata or database work. Excess requests
receive HTTP 429 with `error: temporarily_unavailable` and `Retry-After` seconds.
This aggregate cap does not trust forwarded IP headers and bounds its own state.
It is shared by all callers, so a busy client can temporarily consume admission
capacity. These limits are per process, not fleet-wide quotas; multi-replica
traffic controls remain an edge responsibility. Token exchange, completion and
revocation are outside this authorization-start cap.

The authorization lookup and device-code lookup return these additive fields:

| Field | Meaning |
| --- | --- |
| `clientName` | Browser metadata clients retain the `client_id` hostname for compatibility with older consent screens. A document's self-declared name never replaces that host. The pinned ChatGPT fallback retains its fixed server-owned name. |
| `clientHost` | Host parsed from `client_id`; in device flow it is self-declared, not verified. |
| `clientUri`, `logoUri` | Optional HTTPS presentation URLs from the document; these do not prove branding or endorsement. |
| `clientVerification` | `metadata_document` means the document was fetched and validated; `first_party` means the pinned ChatGPT redirect fallback; `unverified` covers device flow and legacy rows. |
| `redirectHost`, `loopbackRedirect` | Destination host (including port) and whether it is a local HTTP loopback redirect; device flow has no redirect. |

The pinned ChatGPT fallback is allowed only when its document cannot be fetched,
not when it is invalid or metadata admission is exhausted. Clients should show
client and redirect hosts prominently, warn on unverified requests, and explain
loopback redirects. Missing/null identity fields must degrade to unverified.
A fetched document establishes control of its origin, not ownership of a name
or logo such as ChatGPT.

Apply `20261116000200-add-agent-authorization-client-metadata.js` before deploying
this backend. Its nullable columns preserve old-image compatibility; existing
rows default to unverified on read. Roll out and verify the host consent identity
UI before any future change that uses a document-supplied name in `clientName`.
The hostname compatibility behavior remains safe before that host rollout and
when the host is rolled back. For backend rollback, retain the additive columns
and disable integrations if required; do not remove grant/audit data.
