# October 16, 2026: settled swaps excluded from account history

## Findings and scope

Investigation on October 17 used Docker logs for October 16 00:00–24:00 UTC
and SELECT-only database transactions. No runtime credentials, customer IDs,
wallet addresses, transaction hashes or executable payloads were exported.
No production or staging data was changed.

The production backend containers retained 0 and 66 log lines for that day;
the latter were Axios entries, with no swap/history/database-error evidence.
Both production Angular containers and both wallet MFE containers were checked.
Their swap/history text matches were unrelated static-path requests, not swap
API calls. Production `cs_main_db` has no `swap_preparations` or
`swap_executions` tables, no swap migrations, and no matching swap/wallet/auth
product events on October 16. This environment cannot corroborate the report.

Staging has all three swap migrations and the history routes. It contains:

| October 16 preparations | Count | History attempt marker |
| --- | ---: | --- |
| Successfully settled wallet deposits | 6 | 4 present, 2 absent |
| Other prepared deposits | 10 | 1 present, 9 absent |

The hidden preparations were created at 12:25:09.660 and 12:28:50.515 UTC;
their corresponding `swap.settlement` events were persisted at 12:26:17.850
and 12:29:28.214. Both have `SUCCESS`, a preparing account and history display
metadata, but NULL `attempt_started_at` and no submission-state metadata.
Both have matching active wallet links and no other active owner for their
wallet addresses. They belong to one account with no visible successful swaps.
This matches the symptom, but the customer and environment have not been
confirmed by the reporter; do not identify this account as that customer.

The staging backend logs in 12:23–12:31 UTC show 34 successful quote responses
(201) and 59 successful status responses (200). These are aggregate supporting
evidence, not a per-customer attribution. Preparation IDs correlated the two
rows to their settlement events inside SQL without exporting identifiers.
There are no duplicate settlement-event groups or duplicate successful deposit
address/memo groups. All six October 16 wallet-deposit settlement events have
NULL audit `user_id`, despite their preparations retaining the owner. No receipt
transaction references were persisted for these six swaps.

## Root cause and flow

1. Authentication resolves a verified provider subject to the application user.
   Wallet binding checks ownership; external proof challenges are user-bound,
   single-use and committed with the wallet link in a transaction. Preparation
   verifies active wallet ownership and persists `actor.id` and display facts
   before returning an executable package.
2. The wallet MFE optionally calls `startSwapAttempt` before signing/sending.
   The current Angular mount supplies that callback. Its successful write sets
   `attempt_started_at`; the current MFE blocks wallet I/O on callback failure.
   Legacy integrations can omit this optional capability. Submission outcome
   notifications are best effort. Retained evidence does not establish why the
   two observed preparations never received an attempt marker (client version,
   omitted callback or another client path); no database insert failure is proven.
3. Wallet deposits execute through the wallet, not backend intent submission;
   therefore they do not create `swap_executions` rows. Browser status polling
   calls `GetSwapStatusUseCase`, which queries 1Click and transactionally stores
   terminal settlement plus a `swap.settlement` event. No swap background worker,
   outbox consumer or Temporal workflow currently performs this reconciliation.
4. `SwapHistoryRepository.list` previously required `attempt_started_at IS NOT
   NULL` even when authoritative settlement was already stored. Settlement did
   not set that browser marker, and late attempt writes short-circuited for
   settled preparations. Thus persisted successful swaps were permanently
   filtered out. This is reproduced against the repository's real ORM adapter.
5. Angular fetches account history every 15 seconds, scopes state to the session,
   and reconciles up to five returned pending entries per cycle. It cannot
   recover a row excluded by the backend query. History itself does not filter
   by connected wallet. Status checks previously required an active wallet even
   when the preparing account was known, preventing reconciliation after unlink.
6. Settlement auditing selected the user only from `swap_executions`; this
   explains NULL audit ownership for wallet deposits. It did not remove the
   correct account binding from the preparation.

## Fix and recovery

History now selects the authenticated user's attempted **or terminally settled**
preparations, retaining the existing display-data requirement and cursor order.
Cursor predicates remain ANDed with visibility; no other account becomes visible.
No fake attempt timestamps are written. The two existing October 16 rows become
visible on the next history read after deployment without any data backfill.

Status access uses the immutable preparing account for new preparations; legacy
rows without an account still require verified active wallet ownership. This is
read/status authority only and does not relax prepare/execute authorization.
Future settlement audit events use the preparation owner, with the execution
owner retained as the legacy fallback. Settlement and its audit remain one
transaction with row locking and first-terminal-outcome replay semantics.

Preparation, attempt and settlement write failures emit an operation-specific
`swap.persistence_failed` event without exception text, SQL, signatures, wallet
addresses or payloads, and return a generic retryable 503 to the caller without retaining the raw error
as a cause. This prevents Nest from logging raw Sequelize SQL/parameters. Settlement failures
roll back and can be retried by another status request without resubmitting funds
or duplicating an audit/history row. No automatic transfer retries are introduced.

Across retained staging data there are four settled rows without attempt markers:
the two recoverable October 16 successes, plus two legacy settlements lacking
both preparing-user and history metadata. Those legacy rows must not be assigned
from today's wallet links. Recovery requires independent historical ownership
and asset/amount evidence, a reviewed reconstruction plan, and explicit approval.
Unsettled preparations are not proof of executed swaps and must not be backfilled
as successes. Existing audit events are left untouched.

This change fixes confirmed, persisted settlements. It does not add autonomous
provider reconciliation for swaps whose clients never poll, nor prove the
outcome of unobserved chain transfers. Such reliability work needs a separately
scoped durable workflow/provider reconciliation design. The absent attempt
notification's browser-level trigger and the reported customer's environment
remain unconfirmed.

## Verification and rollout

Regression tests cover the observed NULL-marker state for all terminal outcomes,
account isolation, cursor filtering, late notifications, unattempted quote
exclusion, wallet unlinking, atomic rollback on audit failure, retry, deduplication,
and sanitized preparation/attempt/settlement failure logs. Tests use an isolated
SQLite database with the real Sequelize repositories; PostgreSQL locking under
concurrent load is not claimed as tested by these fixtures.

No schema migration is needed beyond the existing history migration. Deploy via
the normal CI/orchestrator process, then verify authenticated history/status for
an authorized test account. Production lacks the prerequisites, so this patch
alone is not a production release plan: the established coordinated backend,
MFE and host release and migration gates still apply. Reverting the app restores
the old visibility bug but does not delete settlement or history data.

Local validation: build and lint pass. All 324 unit tests across 53 suites pass,
including 11 history repository tests; the four matching history/attempt/status
API tests pass. The complete API suite has 38 passing and two failing tests:
the asset response fixture omits additive `sourceNetwork`/`stale` fields, and
the invalid-recipient fixture expects a missing `details.destinationBlockchain`.
Both failures were reproduced with all three changed implementation files
restored to unchanged `b5e7e0a` baseline, then the fix files were restored.
They are existing release-gate failures, not claimed as passing or fixed here.
Local independent diff review found no remaining material issues after the
sanitized exception handling and status-authorization documentation corrections.
