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
