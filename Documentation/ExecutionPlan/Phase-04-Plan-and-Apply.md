# Phase 04 - Deterministic plans and controlled execution

## Goal and dependencies

Build one safe reconciliation mechanism used by all later domains. Depends on 01-03. Suggested PR slices: pure planner/model; then executor/journal/safety tests.

## Implementation

Implement a pure desired-versus-remote planner with typed operations, dependencies, selected domains/locales, exact target identity, affected resource scope, before/after values, and no-op detection. Plans are immutable stored records; bind their digest to source hashes, relevant asset hashes, rule/schema versions, resolved credential context, and remote preconditions. Store no raw secrets. Explicit clearing/removal is distinct from omission.

`apply_plan` accepts a plan ID, matching digest, and approved operation IDs. Require write mode, approved roots/target, valid dependencies, and meaningful host/operator authorization. A caller echoing a digest is not independent proof of human approval; document the trust boundary. Do not accept arbitrary endpoints or arbitrary plan-file paths.

Re-read relevant inputs and remote state before writes and before high-impact steps. Reject stale plans. Serialize writes to one resource and bound independent-locale concurrency. A local lock reduces duplicate local execution but is not distributed locking; do not promise atomic protection from another developer's simultaneous changes.

Persist a redacted operation journal with confirmed remote IDs, timestamps, pre/postcondition hashes, and status. Read back successful operations. On timeout after a write, reconcile live state; classify `outcomeUnknown` until resolved instead of blindly repeating POST. Resume confirmed incomplete work from a new checked plan. Never advertise global rollback across independent Apple resources.

Use bounded result envelopes and paged/local detail artifacts. Add `get_operation_status` for ongoing processing and reporting; it may poll approved operations but must not execute unapproved remaining writes. Ordinary apply explicitly rejects submission operations.

## Tests

Cover a second no-op plan; changed file after approval; account/target change; concurrent remote edit; valid approved subset and missing dependency; locale A success/locale B failure; crash after server success; unknown POST outcome; stale journal; failed postcondition; read-only mode; unsafe injected operation; and redacted secret changes. Verify exact HTTP call counts where duplicate writes would be dangerous.

## Exit gate

Mock end-to-end plans produce auditable results without accidental writes, broad clearing, duplicate creates, or false success. Later phases add adapters/operations to this mechanism instead of bespoke write shortcuts.
