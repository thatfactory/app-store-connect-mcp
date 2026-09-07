# Implementation plan - combined reading copy

This file combines the execution index and all 13 phase documents for agent handoff. The canonical editable documents are under `Documentation/ExecutionPlan/`; update those and regenerate this copy when implementation changes the plan. Read the shared Product, Architecture, API-Capabilities, and AppStore-Format documents alongside it.


---

# First-release execution plan

Status: implementation specification, not a claim of shipped functionality. Target first stable npm release: `1.0.0`. Research baseline: 2026-09-06.

## Objective

Ship `@thatfactory/app-store-connect-mcp`, a local stdio MCP server that synchronizes a reviewed, version-controlled `AppStore/` directory with supported public App Store Connect API resources. Dogfood it on Headroom's existing macOS listing before adding broad future product domains.

Read [Product](Documentation/Product.md), [API capabilities](Documentation/API-Capabilities.md), [Architecture](Documentation/Architecture.md), and [AppStore format](Documentation/AppStore-Format.md) before implementation. The phase documents below are execution contracts, not independent competing specifications. Change a shared contract deliberately and update affected phases/tests together.

## Scope and priorities

The first usable milestone is localized metadata for Headroom. The first stable release additionally includes bundle IDs/capabilities, deterministic screenshot synchronization, base pricing/availability, bounded provisioning helpers, and separately authorized submission of an existing build. Initial app-record creation remains a documented manual bootstrap unless Phase 00 establishes a supported public operation. No private API or browser-session workaround is permitted.

Keep the platform model extensible. Headroom's macOS path and all five of its storefront locales are the required end-to-end acceptance target. Additional screenshot display families may ship only with verified rules and fixtures; accepting an enum is not evidence of platform support. Do not claim every Apple platform is live-tested.

## Delivery phases

| Phase | Deliverable | Depends on | Exit criterion |
| --- | --- | --- | --- |
| [00](Documentation/ExecutionPlan/Phase-00-API-Contract-Audit.md) | Verified API contract and capability boundaries | None | Endpoint/schema evidence, rules, and unsupported operations are recorded. |
| [01](Documentation/ExecutionPlan/Phase-01-Foundation.md) | Package, stdio server, auth, HTTP transport | 00 | Credential compatibility, protocol, and transport tests pass. |
| [02](Documentation/ExecutionPlan/Phase-02-Repository-Format.md) | Repository schemas, paths, local validation | 00-01 | Deterministic validation; no credentials/network needed for local checks. |
| [03](Documentation/ExecutionPlan/Phase-03-Discovery-and-Export.md) | Existing-app discovery, state reads, export | 01-02 | Headroom can be identified and exported without remote writes. |
| [04](Documentation/ExecutionPlan/Phase-04-Plan-and-Apply.md) | Pure diff planner, reviewed apply, recovery journal | 01-03 | No-op, stale-plan, partial failure, and unknown-outcome tests pass. |
| [05](Documentation/ExecutionPlan/Phase-05-Bundle-IDs-and-Capabilities.md) | Bundle registration, capability plans, Xcode inspection | 00, 02-04 | Inference has provenance; only approved portal changes execute. |
| [06](Documentation/ExecutionPlan/Phase-06-Localized-Metadata.md) | Version, localized metadata, categories, review details | 00, 03-04 | Four additional Headroom locales sync; existing English is unchanged. |
| [07](Documentation/ExecutionPlan/Phase-07-Screenshot-Transfer.md) | Image validation and multipart transfer pipeline | 00-03 | Byte-accurate upload lifecycle, polling, cancellation, secret isolation. |
| [08](Documentation/ExecutionPlan/Phase-08-Screenshot-Sync.md) | Version/locale sets, ordering, reuse, safe replacement | 04, 06-07 | Five localized macOS sets converge; second sync uploads nothing. |
| [09](Documentation/ExecutionPlan/Phase-09-Pricing-and-Availability.md) | Free/base price and territory reconciliation | 00, 03-04 | Catalog-driven prices; complete territory plan; existing defaults preserved. |
| [10](Documentation/ExecutionPlan/Phase-10-Provisioning-Helpers.md) | Explicit certificates, devices, profiles | 00, 04-05 | Safe typed operations, artifact downloads, sensitive-data tests. |
| [11](Documentation/ExecutionPlan/Phase-11-Readiness-and-Submission.md) | Readiness checks, build selection, guarded review submission | 00, 06, 08-09 | Submission cannot occur through ordinary sync or without separate authorization. |
| [12](Documentation/ExecutionPlan/Phase-12-Dogfood-and-Release.md) | Hardening, documentation, package/release validation | All | Acceptance evidence and clean npm tarball; owner-controlled publication. |

Each numbered phase is a focused change set. When a phase exceeds a reviewable PR, split it into its listed internal slices without changing its exit criteria. Do not combine unrelated domains into one giant PR. Phases 05 and 06 can proceed independently after the foundation because Headroom already has a bundle ID and app record. The low-level upload work can proceed before the high-level screenshot planner is ready.

## Milestones

**A - Inspect safely:** phases 00-03. Use real credentials only for owner-authorized read-only discovery. Export the current English listing and preserve it as the reference.

**B - Finish Headroom text:** phase 04 plus 06. An agent authors reviewed `de-DE`, `fr-FR`, `ja`, and `pt-BR` files, commits them using its repository tools, plans only `appInfo` and `versionMetadata` for those locales, and applies approved operations. Missing screenshots must not block this text-only milestone. This is the earliest useful dogfood build; it need not wait for every stable-release feature.

**C - Finish store assets/configuration:** phases 05, 07-09. Supply genuine localized screenshots, register only missing identifiers/capabilities, and explicitly reconcile pricing/territories when requested. Re-running a successful sync must perform zero writes.

**D - Complete first stable release:** phases 10-12. Sign-off on safety, review submission workflow, documentation, and packaging. Headroom itself is not submitted or published merely to test the MCP release.

## Engineering rules for every phase

Use strict TypeScript and explicit domain models. Follow the sibling's ESM/stdin-stdout/npm conventions, not every implementation shortcut. Keep Apple transport, resource adapters, business rules, and MCP handlers separate. No unused framework for future modules; add narrow interfaces only where v1 already has multiple implementations or test seams.

All changes include unit tests and focused integration/contract fixtures. Test names describe user-visible guarantees. No real private keys, reviewer credentials, upload URLs, or identifiable account fixtures may enter the repository. No live write tests in ordinary pull-request or nightly CI.

Use the current pinned official schema as the source of payload contracts. A documentation title, generated SDK symbol, or guessed endpoint is not proof that Apple accepts a write. Record whether each feature is documented, schema-verified, fixture-tested, and live-verified; these are separate claims.

Do not auto-correct owner-authored translations, keywords, capability choices, category choices, or review declarations. Validation produces actionable diagnostics. Translation and content generation belong to the calling agent and remain reviewable Git changes.

## Cross-cutting acceptance matrix

| Area | Required cases |
| --- | --- |
| Identity | App ID/bundle mismatch; wrong team; ambiguous version; released versus editable AppInfo. |
| Authentication | Primary/alias precedence; escaped PEM; missing issuer; invalid EC key; no secret leakage. |
| Transport | Multi-page and cyclic pagination; 204; 401/403/409/429/5xx; timeout after write; non-JSON error. |
| Repository | Traversal, symlink escape, untrusted URLs, duplicate JSON keys, unknown fields, Git LFS pointer instead of image. |
| Locales | All five Headroom locales; invalid `jp`; Unicode field counts; omitted versus explicit clearing. |
| Planning | No-op; missing unrelated locale; stale local input; remote edit; partial locale failure; approved subset dependencies. |
| Screenshots | Unsupported format/dimensions; wrong byte range; failed processing; ten-image replacement; reorder-only; lost cache. |
| Commerce | Free lookup; unsupported price; all-territory pagination; no accidental paid-to-free reset; app-wide blast radius. |
| Provisioning | Unknown entitlement; extension identifier; existing resource; unsupported capability; destructive lifecycle request. |
| Submission | Missing build; privacy unknown; stale plan; existing submission; ordinary apply rejected; automatic-release warning. |
| Packaging | Clean install; built executable; stdout purity; MCP initialization/tool discovery; no secrets/examples in tarball. |

## Completion and reporting

A phase report includes changed files, tests actually executed, unresolved blockers, API-contract evidence level, and any manual action needed. Never substitute an unexecuted test list for test results. An implementation agent stops at genuinely unsupported Apple operations with a precise actionable result, not with invented success.

The final release checklist is in Phase 12. [Dogfooding-Headroom.md](Documentation/Dogfooding-Headroom.md) is the live acceptance procedure; [Sources.md](Documentation/Sources.md) documents the research baseline and its limitations.


---

# Phase 00 - Establish the public API contract

## Goal and prerequisites

Convert this research-backed proposal into a pinned, testable API contract before coding mutations. No prerequisites. This phase is required even though the sibling already authenticates against the same API.

## Implementation

Retrieve Apple's current official App Store Connect OpenAPI specification, record its source URL, retrieval date, version when provided, and SHA-256 checksum. Store the full schema or a reproducible retrieval instruction plus checked-in focused excerpts according to its distribution terms. Generate only types/endpoints needed by v1; do not expose thousands of generic MCP tools.

Build `Documentation/API-Contract.md` with each supported operation's HTTP method/path, resource version, required attributes/relationships, nullable semantics, permissions, editable states, pagination, and expected error behavior. Cover bundle IDs/capabilities, certificates/devices/profiles, apps reads, app information/localizations/categories, versions/localizations/review details/build association, screenshots, prices/territories, and review submissions.

Resolve these explicit uncertainties: initial app creation; bundle platform enum versus version platform; correct editable AppInfo selection; screenshot checksum algorithm and ordered relationships; upload-operation byte semantics; price-schedule and availability v2 payloads; legal zero-price configuration; current review submission workflow. Do not infer availability from a request type name alone.

For initial app records, retain the manual bootstrap baseline unless a public documented create operation is established. The developer forum report is corroborating firsthand evidence, not a substitute for the official contract. For Media Manager, demonstrate the version-localization-set relationship and reject the proposed independent cloud-library abstraction unless an actual API supports it.

Version field limits and screenshot display specifications with citations. Distinguish bytes, Unicode code points, and user-perceived characters. Verify the macOS display type and all four supported sizes. Document exact ASC locale identifiers and supported mappings from Xcode localization identifiers.

## Tests and evidence

Add small representative valid/invalid fixtures for every resource family. Contract-test request builders against the pinned schema as they are added in later phases. Establish sanitized fixture capture instructions. With explicit owner permission, perform read-only Headroom discovery; do not create sacrificial apps, profiles, or review submissions without approval.

Mark operations `documented`, `schemaVerified`, `fixtureTested`, and `liveVerified` independently. A missing permission is not proof an endpoint is unsupported; an undocumented private endpoint is not a supported workaround.

## Exit gate

The capability matrix has no ambiguous write contract: each operation is confirmed, explicitly conditional, or unavailable with a fallback. The schema provenance and risk decisions are reviewable. Later phases must not implement conditional writes until resolved. Update shared documents for any discrepancy rather than scattering exceptions through handlers.

## Phase 00 audit resolution (2026-09-06)

Generic territory inclusion/exclusion writes remain conditional and disabled: the selected availability writes are publicly documented for pre-orders. Phase 09 implements read/catalog comparison and an exact manualActionRequired report until a generic public mutation contract is established. It must not use POST /v2/appAvailabilities or PATCH /v1/territoryAvailabilities/{id} for ordinary all-territory/add-remove synchronization. Pre-order lifecycle is outside v1. This resolution supersedes unconditional availability-write wording above; pricing remains independently in scope. See API-Contract.md and contracts/operation-policy.json.

---

# Phase 01 - Package, MCP transport, and credentials

## Goal and dependencies

Create a small working stdio package with tested authentication and HTTP behavior. Depends on Phase 00. Suggested PR slices: package/stdio; then auth/HTTP.

## Implementation

Initialize TypeScript ESM, strict compiler settings, Node.js 24 LTS baseline, an executable entry point, and the official TypeScript MCP SDK with compatible Zod. Pin resolved dependencies in `package-lock.json`; verify currently compatible stable versions during implementation rather than copying a stale lockfile. Follow the sibling's `src/api`, `src/tools`, tests, clean build, and npm packaging conventions.

Implement help/version and explicit root/write/submission flags. Register a minimal `get_capabilities` tool and schema/documentation resources. Reserve stdout for protocol traffic. Add compact structured results, central errors, redacted stderr, and cancellation support. Do not add an HTTP service or hosted account system.

Implement the six credential names exactly as specified, primary precedence, PEM normalization, validation, and in-memory team-key JWT caching. Lazy credential resolution allows offline local tools. Do not load the target repository's `.env`, log configuration values, or silently change to an individual-key flow.

Build an injected-fetch JSON:API client with an exact API-origin allowlist; bounded same-origin pagination with loop detection; timeouts; abort signals; 204 support; structured and non-JSON error handling; and request IDs. Reads may use bounded backoff. Classify writes by safe retry/reconciliation policy: never automatically replay an uncertain create. Respect rate-limit guidance and retry hints only within a bounded budget.

Create a separate interface for presigned asset transfers without ASC authorization. Do not reuse the sibling's authenticated artifact-download helper for screenshot transfer URLs.

## Tests

Test SDK initialization, tools/list, malformed input, clean shutdown, stdout purity, missing credentials, primary/alias combinations, empty primary values, quote/newline normalization, invalid EC keys, token refresh margin, and redaction. Transport fixtures cover pagination loops and cross-origin next links, 204, 401/403/409/429/5xx, request cancellation, and non-JSON failures.

## Exit gate

`npm ci`, type checking, tests, and build work on a clean checkout. A locally packed executable completes an MCP handshake and exposes diagnostics without contacting Apple until a remote tool is invoked. No write adapter is publicly reachable yet. CI uses no production credentials.

---

# Phase 02 - Repository contract and offline validation

## Goal and dependencies

Implement the `AppStore/` format as the deterministic source of desired state. Depends on 00-01. Keep this phase free of remote writes.

## Implementation

Implement schema version 1 and generate publishable JSON Schema from the runtime validators. Use JSON for structure and plain UTF-8 files for prose/keywords; reject duplicate keys, unknown writable properties, unsupported schema versions, and unrecognized platform/locale values. Separate app information, platform/version information, review details, commerce, provisioning, and assets.

Discover `AppStore/` only beneath an explicitly approved local root. Resolve real paths, reject traversal and symlink escapes, cap file counts/lengths/total bytes, and reject remote includes and executable configuration. Treat repository content as data, never instructions. Detect Git LFS pointer files when an image is expected.

Implement exact newline normalization, scope-aware required fields, placeholder checks, URL checks without automatically fetching arbitrary links, Unicode length diagnostics, and keyword-byte reporting. Omission is unmanaged, not deletion. Preserve the distinction among omitted, null, empty, and explicitly ordered values. Hard validation and advisory wording/ASO guidance must be separate.

Implement narrowly allowlisted review environment references under `APPSTORE_REVIEW_*`; allow only specified review fields to use them. Return presence/missing diagnostics, not values. Keep resolved secrets out of plan files and logs. Changing a relevant secret between plan and apply invalidates the operation using a non-reversible, process-scoped comparison mechanism.

The validator accepts selected domains/locales so screenshots or missing translations outside a requested text sync do not block it. Full validation and full release readiness remain separate commands. Validate transitive defaults needed by the selected domains.

## Tests

Cover five storefront locales, Japanese and emoji length edges, CRLF/EOF behavior, duplicate keys, missing files, unrecognized fields, invalid paths, symlink escape, overly large files, malformed secret references, placeholders, and scoped validation. Ensure inspecting a repository cannot execute shell or Xcode commands.

## Exit gate

`validate_repository` runs without credentials or network, returns stable path/locale/field diagnostics, and does not mutate source files. Example manifests either validate or fail for explicitly documented placeholders. Schema resources match the runtime validators, avoiding two divergent definitions.

---

# Phase 03 - Discover and export the existing listing

## Goal and dependencies

Read and accurately model App Store Connect before attempting synchronization. Depends on 01-02 and Phase 00 resource contracts.

## Implementation

Add `list_apps`, `get_app_store_state`, `export_app_store_state`, and the baseline `prepare_app_record`. Prefer an exact numeric App Store ID plus matching bundle ID; names are discovery aids, not identity keys. Validate account scope, selected platform, and explicit version. Enumerate every needed page before diffing; an incomplete snapshot is a blocker, not an empty resource set.

Normalize only needed attributes and relationships into typed remote state. Preserve Apple IDs and states. Resolve the correct editable AppInfo rather than taking the first returned record. Model app information and version localizations independently, including cases where only one exists. Include screenshot inventory and processing state without placing expiring URLs in durable logs.

Export to a new directory beneath an approved root, refusing overwrite by default. Preserve metadata content and output a separate redacted identity/inventory mapping. Secret values are not exported into versioned files; review details use env-reference placeholders. Do not claim CDN preview images are original source screenshots.

When the app is absent, `prepare_app_record` emits exact bootstrap fields and `manualActionRequired`. It never invents POST /apps or concludes that bundle registration created an app. When present, confirm ID/bundle agreement and return existing state. The caller re-runs discovery after manual creation.

## Tests

Use multi-page responses with multiple editable/released AppInfos, missing locales, same-name apps, app-ID/bundle mismatches, missing permissions, missing versions, and states that are not editable. Verify no remote mutations from any discovery/export path and no accidental secret logging. Test export overwrite/path protection and lossless normalized text round trips.

## Headroom acceptance

With owner-authorized read access, resolve app `6809208740` and confirm `com.thatfactory.headroom`; do not assume the draft version is still `1.0`. Export current en-US and any existing translated metadata before preparing changes. Capture a content fingerprint for English fields. Treat manually entered remote values as the migration baseline, not the starter sample.

## Exit gate

A redacted current-state report and repository-format export can be reviewed locally. Missing/unavailable fields are explicit. Initial app creation is honestly reported as a one-time manual action in the baseline. No remote state has changed.

---

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

---

# Phase 05 - Bundle identifiers and Xcode capability proposals

## Goal and dependencies

Register identifiers and configure explicitly approved capabilities without changing the Xcode project. Depends on 00, 02-04. Existing-app metadata dogfooding does not depend on this phase.

## Implementation

Add bundle-ID discovery/creation and capability read/create/update operations from the audited schema. Match existing identifiers exactly. Preserve existing capabilities not managed by the request; an empty capability list does not disable everything. Detect unsupported combinations and extra setup such as identifiers/groups that a boolean toggle cannot satisfy.

Implement local read-only Xcode inspection with an explicit project/workspace, app target, configuration, and platform selection. Parse project/build-setting/entitlement sources safely; report unresolved substitutions and provenance rather than guessing. Main apps, extensions, tests, and frameworks must not be conflated. A bundle-ID change is a proposal, not an automatic rewrite of project files.

Static inspection is the default. Any optional `xcodebuild -showBuildSettings` execution requires a separate explicit opt-in for an approved checkout, no shell interpolation, bounded execution, and a documented warning about project/toolchain evaluation. It must never build, archive, run project scripts intentionally, resolve unrequested dependencies, or upload binaries. Missing Xcode on non-macOS hosts is a supported limitation, not a server startup failure.

Use a versioned capability mapping with confidence/provenance. macOS sandbox permissions do not automatically correspond to portal capabilities. Unknown entitlement keys remain unresolved. Issuer ID and Xcode team ID are separate concepts. Primary/extension identifiers require explicit inclusion, not indiscriminate registration of every target.

Route explicit user operations and repository provisioning configuration through `plan_provisioning_changes`. Review any capability removal/update with impacts; never revoke/recreate signing assets automatically to make the change appear successful.

## Tests

Cover existing/absent identifiers, duplicate/conflicting creation, correct platform enum conversion, target selection, variable substitution, extension targets, unknown entitlements, sandbox-only keys, capability dependencies, permission failures, and no project mutation. Simulate a capability write timing out and verify reconciliation before retry.

## Exit gate

The tool can propose and apply one reviewed bundle registration/capability change using public API contracts, while a repeated run is a no-op. Headroom's existing identifier is preserved. App-record preparation still reports the distinct manual bootstrap when the listing does not exist.

---

# Phase 06 - Versions, localized text, and app information

## Goal and dependencies

Deliver the first useful Headroom dogfood milestone: synchronize four additional storefront languages without damaging English. Depends on 00 and 03-04; Phase 05 is not required for an existing app.

## Implementation

Add idempotent creation of an absent eligible platform version; existing versions must match explicit app/platform/version selection. Respect current editable-state rules. Initial app creation remains separate. Create missing app-information localizations and version localizations independently, with deterministic dependency order and exact ASC locale identifiers.

Map name, subtitle, and privacy URL to app-information localizations; description, keywords, support/marketing URLs and optional text to version localizations; copyright and release behavior to the version; contacts/demo login/requirements to review details. Resolve categories using Apple's catalog. Do not send a whole remote object back with defaults overwriting unmanaged fields.

Preserve omitted values, unrelated locales, and unrelated platforms. Category changes, copyright, release behavior, and review details are not per-locale operations; show their broader scope and require their own approved operations. Locale-filtered synchronization does not authorize these shared changes automatically. Only explicitly selected fields/domains can write.

Treat a first-release description differently from update notes. Preserve owner-authored text and keyword spelling. Validate URLs/lengths locally, then propagate structured Apple validation errors with field/locale context. Never truncate or translate content on the server. Review account secrets are injected at execution from allowed environment references and not persisted.

## Tests

Exercise all five Headroom locales, one missing AppInfo localization, one missing version localization, initial version versus update, app-name conflict, noneditable state, stale plan, repeated no-op, shared-field changes during locale-only sync, and existing en-US preservation. Verify price, territory, screenshot, review, and submission endpoints are not called in a text-only operation.

## Live dogfood gate

Follow `Documentation/Dogfooding-Headroom.md`: export the English baseline, let the agent author/review repository translations, and plan only app-information/version-text changes for `de-DE`, `fr-FR`, `ja`, and `pt-BR`. Apply with owner authorization; read back every changed field; confirm English fingerprint unchanged; replan and verify zero writes. Save sanitized evidence.

## Exit gate

Metadata-only automation is usable locally or through a pre-release package. Screenshots, pricing, broad provisioning, and submission may still be unimplemented without blocking this milestone. README/capabilities must describe that intermediate status accurately.

---

# Phase 07 - Validate and transfer screenshot bytes

## Goal and dependencies

Implement a correct low-level screenshot upload lifecycle. Depends on 00-03. High-level set reconciliation is Phase 08.

## Implementation

Validate genuine PNG/JPEG bytes, decoded dimensions, file size, display-family compatibility, and API limits. Detect corrupt/truncated files, mismatched extensions, unsupported HEIC/WebP/PDF, and Git LFS pointers. Fail rather than automatically cropping or changing owner-approved marketing images. For macOS, implement the audited display type and 16:10 sizes from Apple.

Reserve a screenshot under an exact existing set using the audited filename/file-size attributes. Execute each returned upload operation with exactly its method, allowed URL, headers, byte offset, and length. Reject negative/out-of-bounds/overlapping or incomplete byte specifications according to the verified protocol. Stream bounded file segments; do not read arbitrarily large batches into memory.

Use the unauthenticated asset transfer client. Never forward the App Store Connect bearer token to an upload URL. Treat upload URLs/header values as sensitive, validate HTTPS/host policy and redirects, block local/private destinations, and redact signed query parameters. Support legitimate Apple-selected storage hosts using the audited allow policy rather than a guessed one-host rule.

Compute local SHA-256 for repository identity and the separately specified Apple checksum for commit; do not interchange the algorithms. Commit only after required byte transfers finish. Poll Apple's processing state with a deadline and cancellation. Return `processing` when still pending, not success; surface asset diagnostics on failure.

Retain reservation IDs for recovery. An uncertain reserve/commit must be reconciled. Retry byte ranges only when protocol-safe and within bounds. Cancelling stops future local work and reports already-created resources; it does not falsely claim remote rollback.

## Tests

Use a local mocked HTTP transfer server with synthetic signed URLs and multi-part responses. Verify precise bytes for nonzero offsets, headers/methods, checksums, no JWT at storage, forbidden redirects, size changes mid-upload, rate limits, corrupted parts, expired URLs, incomplete processing, terminal failure, commit timeout, and cancellation.

## Exit gate

A synthetic image traverses reserve/upload/commit/process successfully and every failure stage is distinguishable. An owner-authorized live image probe is desirable but must be recorded separately from mocked coverage and must not delete current production screenshots.

---

# Phase 08 - Reconcile localized screenshot sets and order

## Goal and dependencies

Make repository screenshots appear in the correct version, locale, and Media Manager display set. Depends on 04, 06-07. Suggested PR slices: planner/order; then recovery/replacement/live dogfood.

## Implementation

Resolve an ordered screenshot manifest to `AppStoreVersionLocalization -> AppScreenshotSet -> AppScreenshot`. Create only absent sets. A local original can be referenced by multiple versions/locales, but each destination has its own resources. Do not create a fictional global Media Manager library or reuse a screenshot ID across parents.

Compare desired file hashes, reliable remote checksum/metadata, and recorded provenance. Never use filename alone as proof of identical bytes. A successful upload records source hash and remote resource ID; caches aid lookup but must not authorize deletion or reuse when live state contradicts them. When equivalence is unknown, report it and require an explicit replacement/adoption decision rather than guessing or accumulating duplicates.

`merge` preserves unowned remote screenshots; present the resulting complete order in the plan. `replace` establishes the exact requested array and makes deletions explicit. A missing manifest is unmanaged; an empty array is not a casual default. Localized screenshots do not silently fall back to English unless the manifest expressly requests a shared source or owner accepts Apple fallback behavior.

Honor the set count limit. When a set already contains ten images, replacement may require approved removals before uploading new images. Show the temporary gap and partial-failure risk. Upload-before-delete is preferable only when capacity permits; do not promise atomic replacement. Preserve existing originals and never claim an old remote image can be restored without its original bytes or verified copy support.

Apply final order via the audited relationship operation and read back membership, order, processing state, and parent identities. Reorder-only plans send no image bytes. Failed locale/set operations preserve the journal so a replan can resume without replaying completed uploads.

## Tests

Cover five localized Mac sets, reuse of one source across versions, duplicate filenames with different bytes, identical hash/no-op, reorder-only, unowned remote images, lost cache, stale remote list, full ten-image replacement, explicit empty set, partial upload failure, terminal processing failure, and wrong-parent screenshot IDs.

## Exit gate

Owner-supplied Headroom screenshots appear under the intended draft version and all five locales with verified order. A second unchanged sync performs zero uploads/writes. Until genuine assets are supplied, report this live acceptance as pending rather than generating placeholders and calling the phase live-verified.

---

# Phase 09 - Base price and territory availability

## Goal and dependencies

Reconcile explicitly managed app pricing and country/region availability. Depends on 00 and 03-04. This is not IAP/subscription pricing.

## Implementation

Implement read/catalog adapters for current price schedules, price points, base territories, and availability/territory resources. Use the audited endpoint versions rather than assuming all paths are v1. Enumerate complete live catalogs and map API territory IDs separately from locale codes.

For a new manifest, initialize the desired app price to free and availability to all territories. For an existing listing, omitted commerce configuration means unmanaged; never apply template defaults by inference. Discover the correct zero-price configuration/point using the documented contract, not a guessed numeric price-tier ID. Preserve existing schedules unless the approved plan explicitly replaces them.

Represent money with exact strings/decimal handling, never binary floating point. A first-release free configuration is required; a documented paid base-price selection may be supported if tested. Reject ambiguous/unsupported prices rather than choosing the nearest value silently. Exclude complex future scheduling, special offers, and IAP pricing from v1.

Expand `all` to the complete current territory catalog. Model future-territory behavior separately when the API exposes it. Read back requested versus actual availability and report country restrictions, agreements, or other blockers without inventing legal/compliance answers. Do not hard-code a country count or assume a successful update makes the app available immediately.

Treat pricing/availability as app-wide, high-impact changes even from a macOS-version request. Plans show old/new base price, affected territories, additions/removals, schedule impacts, and requested start semantics. Require explicit approval; no updates during locale-only metadata sync.

## Tests

Test an already-free no-op, missing commerce config, existing paid app with defaults omitted, zero-price catalog lookup, invalid price/territory, paginated catalogs, stale schedules, partial territory failure, new-territory option, and read-back restrictions. Verify a missing optional field never unpublishes territories or overwrites future scheduled prices.

## Exit gate

Headroom's already configured free price remains unchanged unless an approved difference exists. An all-territory plan is transparent and idempotent. Readiness distinguishes configured distribution from effective availability and owner obligations.

## Phase 00 audit resolution (2026-09-06)

Generic territory inclusion/exclusion writes remain conditional and disabled: the selected availability writes are publicly documented for pre-orders. Phase 09 implements read/catalog comparison and an exact manualActionRequired report until a generic public mutation contract is established. It must not use POST /v2/appAvailabilities or PATCH /v1/territoryAvailabilities/{id} for ordinary all-territory/add-remove synchronization. Pre-order lifecycle is outside v1. This resolution supersedes unconditional availability-write wording above; pricing remains independently in scope. See API-Contract.md and contracts/operation-policy.json.

---

# Phase 10 - Explicit certificate, device, and profile operations

## Goal and dependencies

Complete the bounded provisioning portion of the first stable release without becoming a signing-key management system. Depends on 00 and 04-05. These helpers are not prerequisites for updating Headroom metadata.

## Implementation

Extend `get_provisioning_resources` and the typed provisioning planner for certificate inventory/CSR-based creation/revocation, device inventory/registration/allowed updates, and profile inventory/creation/deletion/download as documented. Model only operations Apple actually supports for the selected resource/type/platform.

Accept an owner-supplied CSR file under an approved root; validate its encoding and key properties. Do not generate or accept private signing keys, export Keychain identities, run automatic certificate renewal, or revoke a certificate to work around an account limit. The API signing key is distinct from an app's signing identity.

Validate profile relationships to exact bundle ID, allowed certificate IDs/types, devices when required, and platform/distribution type. Do not attach every visible device or choose an arbitrary certificate. Report certificate expiration, disabled devices, and incompatible relationships before writing.

Destructive requests are separate typed operations with affected profile/resource inventory and high-impact approval. Indirect effects such as revocation affecting other apps must be visible. Capability changes do not trigger silent profile recreation.

`download_signing_artifact` writes only the requested certificate/profile to an approved non-overwriting path with restrictive permissions, returning its path/type/fingerprint. Treat device identifiers, profile contents, certificates, and CSR metadata as sensitive in logs even when not private-key secrets. Never commit them automatically or expose raw contents in MCP responses.

## Tests

Cover CSR parsing and private-key rejection, exact certificate/profile selection, duplicates, account limits, expiration, incompatible profile relationships, device platform rules, denied roles, explicit revocation/deletion approval, interrupted creates, and secure download paths. No destructive live test runs automatically in CI.

## Exit gate

Every advertised operation has contract and mocked integration coverage. Live verification uses only separately approved development resources; record untested lifecycle operations honestly. Headroom's working signing setup is not modified just to satisfy test coverage.

---

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

---

# Phase 12 - Acceptance, documentation, and npm publication

## Goal and dependencies

Publish a reproducible first stable package only after its advertised scope and safety guarantees are demonstrated. Depends on all implementation phases. Suggested PR slices: acceptance/hardening; then release packaging/documentation.

## Implementation

Run the cross-cutting matrix, audit all tool schemas/annotations, test cancellation and bounded output, inspect redaction under failures, and verify that client-visible content cannot inject new tool operations. Fuzz repository paths, JSON validation, Apple error bodies, and transfer URL handling. Review dependencies and license obligations; no unreviewed blanket upgrades at release time.

Complete the Headroom procedure: baseline export, scoped four-locale text sync, supplied localized screenshots, explicitly selected commerce verification, read-back checks, and a final zero-write plan. Preserve owner approvals and sanitized evidence outside the npm tarball. Do not alter working certificates or submit the app for the sake of claiming all tools have live coverage.

Update README from future tense to actual supported behavior. Include requirements, exact credentials/aliases, write/submission flags, client setup, tool table, `AppStore/` format, manual initial-app bootstrap, Media Manager semantics, limits, troubleshooting, and evidence levels. Keep Product as vision/scope and Architecture as engineering contract. Unsupported roadmap features must not appear as released functionality.

Produce an npm tarball with only runtime files, needed schemas/resources, README, and license. Verify shebang/executable handling, ESM resolution, declared Node engine, production dependency installation, `--help`, `--version`, stdio handshake, tools/resources discovery, and one read-only/mock workflow from a clean external directory. Inspect `npm pack --dry-run` for source secrets, local plans, Headroom IDs/contacts, fixtures, and bulky originals; intentionally exclude examples containing app-specific identifiers from the published tarball.

Add CI with clean install, lint/type-check, unit/contract/security/integration tests, build, and packed-package smoke test. Keep live account tests owner-triggered, protected, and read-only by default. Publishing uses a protected GitHub workflow and npm trusted publishing where configured. A brand-new package may require owner-controlled initial npm setup before the publisher trust can be established; document the current verified steps rather than assuming it already exists.

Follow the sibling's release convention deliberately: package version `1.0.0` and matching release tag `1.0.0`, unless a reviewed policy change chooses a `v` prefix. Validate the checked-out release ref, run tests again, and avoid concurrent duplicate publishes. Never put a long-lived npm token or ASC key into tracked files. Document initial setup separately from routine releases.

## Final release gate

All required automated tests pass from a clean checkout; scope/evidence labels are accurate; critical security and data-loss findings are resolved; the final Headroom text/asset sync is verified or an explicit supplied-assets blocker prevents claiming that live gate; and the package smoke test succeeds. Owner authorization is still required to create/publish the npm package and GitHub release.

Deliver the exact version/tag, tarball inventory, test results, known limitations, and manual bootstrap notes. Do not state that this planning packet, an unexecuted test suite, or mocked Apple responses constitute a shipped working MCP.
