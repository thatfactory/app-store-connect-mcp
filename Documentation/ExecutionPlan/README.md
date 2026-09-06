# Implementation plan - combined reading copy

This file combines the execution index and all 13 phase documents for agent handoff. The canonical editable documents are under ``; update those and regenerate this copy when implementation changes the plan. Read the shared Product, Architecture, API-Capabilities, and AppStore-Format documents alongside it.


---

# First-release execution plan

Status: implementation specification, not a claim of shipped functionality. Target first stable npm release: `1.0.0`. Research baseline: 2026-09-06.

## Objective

Ship `@thatfactory/app-store-connect-mcp`, a local stdio MCP server that synchronizes a reviewed, version-controlled `AppStore/` directory with supported public App Store Connect API resources. Dogfood it on Headroom's existing macOS listing before adding broad future product domains.

Read [Product](../Product.md), [API capabilities](../API-Capabilities.md), [Architecture](../Architecture.md), and [AppStore format](../AppStore-Format.md) before implementation. The phase documents below are execution contracts, not independent competing specifications. Change a shared contract deliberately and update affected phases/tests together.

## Scope and priorities

The first usable milestone is localized metadata for Headroom. The first stable release additionally includes bundle IDs/capabilities, deterministic screenshot synchronization, base pricing/availability, bounded provisioning helpers, and separately authorized submission of an existing build. Initial app-record creation remains a documented manual bootstrap unless Phase 00 establishes a supported public operation. No private API or browser-session workaround is permitted.

Keep the platform model extensible. Headroom's macOS path and all five of its storefront locales are the required end-to-end acceptance target. Additional screenshot display families may ship only with verified rules and fixtures; accepting an enum is not evidence of platform support. Do not claim every Apple platform is live-tested.

## Delivery phases

| Phase | Deliverable | Depends on | Exit criterion |
| --- | --- | --- | --- |
| [00](Phase-00-API-Contract-Audit.md) | Verified API contract and capability boundaries | None | Endpoint/schema evidence, rules, and unsupported operations are recorded. |
| [01](Phase-01-Foundation.md) | Package, stdio server, auth, HTTP transport | 00 | Credential compatibility, protocol, and transport tests pass. |
| [02](Phase-02-Repository-Format.md) | Repository schemas, paths, local validation | 00-01 | Deterministic validation; no credentials/network needed for local checks. |
| [03](Phase-03-Discovery-and-Export.md) | Existing-app discovery, state reads, export | 01-02 | Headroom can be identified and exported without remote writes. |
| [04](Phase-04-Plan-and-Apply.md) | Pure diff planner, reviewed apply, recovery journal | 01-03 | No-op, stale-plan, partial failure, and unknown-outcome tests pass. |
| [05](Phase-05-Bundle-IDs-and-Capabilities.md) | Bundle registration, capability plans, Xcode inspection | 00, 02-04 | Inference has provenance; only approved portal changes execute. |
| [06](Phase-06-Localized-Metadata.md) | Version, localized metadata, categories, review details | 00, 03-04 | Four additional Headroom locales sync; existing English is unchanged. |
| [07](Phase-07-Screenshot-Transfer.md) | Image validation and multipart transfer pipeline | 00-03 | Byte-accurate upload lifecycle, polling, cancellation, secret isolation. |
| [08](Phase-08-Screenshot-Sync.md) | Version/locale sets, ordering, reuse, safe replacement | 04, 06-07 | Five localized macOS sets converge; second sync uploads nothing. |
| [09](Phase-09-Pricing-and-Availability.md) | Free/base price and territory reconciliation | 00, 03-04 | Catalog-driven prices; complete territory plan; existing defaults preserved. |
| [10](Phase-10-Provisioning-Helpers.md) | Explicit certificates, devices, profiles | 00, 04-05 | Safe typed operations, artifact downloads, sensitive-data tests. |
| [11](Phase-11-Readiness-and-Submission.md) | Readiness checks, build selection, guarded review submission | 00, 06, 08-09 | Submission cannot occur through ordinary sync or without separate authorization. |
| [12](Phase-12-Dogfood-and-Release.md) | Hardening, documentation, package/release validation | All | Acceptance evidence and clean npm tarball; owner-controlled publication. |

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

The final release checklist is in Phase 12. [Dogfooding-Headroom.md](../Dogfooding-Headroom.md) is the live acceptance procedure; [Sources.md](../Sources.md) documents the research baseline and its limitations.


---
