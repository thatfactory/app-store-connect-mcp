# Phase 11 - Readiness and separately authorized review submission

## Goal and dependencies

Allow deliberate submission of an existing uploaded build without making ordinary synchronization a release action. Depends on 00, 06, 08-09. Provisioning helpers are unnecessary when the build already exists.

## Implementation

Implement `check_release_readiness` with per-check evidence and statuses `verified`, `blocked`, `manualVerificationRequired`, and `notApplicable`. Inspect managed metadata, required localizations/screenshots, asset processing, selected build, editable state, review contact/demo access, price/availability, and active submission state. Distinguish local checks from facts verifiable remotely.

For privacy declarations, age ratings, export compliance, agreements, and regional obligations, report actual API evidence where available and unresolved manual requirements otherwise. A privacy-policy URL is not proof that privacy disclosures are complete. Never infer legal answers from source-code heuristics. Readiness does not guarantee Apple review acceptance.

Resolve an exact existing build ID, verify app/platform/version and processing eligibility, and show selection as an approved operation. Do not choose latest implicitly. No archive, binary upload, TestFlight tester management, or export-compliance authoring is added in this phase.

Implement `plan_submission` against the currently audited review-submission workflow. Handle an already-created compatible draft submission/item idempotently. Do not mutate unrelated submission items or cancel someone else's submission. Reject unsupported review states with actionable diagnostics.

`submit_for_review` requires `--allow-writes`, the independent `--allow-submission` flag, an exact fresh submission plan/digest, and explicit host/operator authorization. Ordinary `apply_plan` rejects submission actions. Include release behavior prominently: if an existing version is configured for automatic release, later approval may publish it. New-version templates default to manual release; changing an existing option requires approval.

On submission timeout, query state before any retry; `outcomeUnknown` is preferable to a duplicate or a false success. Provide the resulting state/submission ID. Public release of an approved version and cancellation/rejection workflows are outside v1.

## Tests

Test every readiness state, missing/processing build, wrong app/platform, unavailable screenshots, manual-only checks, existing submission, stale metadata after approval, ordinary-apply misuse, missing submission flag, automatic-release warning, submission conflict, and uncertain response. Confirm a sync can never reach the submission endpoint.

## Exit gate

Mocked end-to-end submission is fully covered. A live submission test is optional and only occurs when the owner genuinely intends to submit that version; it is not an automatic dogfood requirement. Report this evidence limit clearly at package release.
