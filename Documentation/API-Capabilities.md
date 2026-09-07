# Capability and delivery status

Phases 00–09 are merged. Phase 06 provides selected localized metadata, version and review plans through the same approved engine. Phase 08 provides approved screenshot set reconciliation. Phase 09 adds exact base-price plans and read-only availability comparison. Phase 10 adds explicit certificate, device and profile inventory/lifecycle tools. Submission remains pending. Live acceptance is recorded separately from mock coverage.

| Phase | Capability | Status |
| --- | --- | --- |
| 00 | API provenance, endpoint contracts and unsupported boundaries | Merged PR #1 |
| 01 | Stdio, credentials, bounded transport and package smoke | Merged PR #2 |
| 02 | Scoped offline validation and generated schemas | Merged PR #3 |
| 03 | Discovery/export | Merged PR #4; Headroom reads/export verified |
| 04 | Immutable approved plans and journals | Merged PR #5 |
| 05 | Bounded identifiers/capabilities and static Xcode proposals | Merged PR #6; Headroom no-op read verified |
| 06 | Localized text and explicit shared metadata | Merged PR #7; Headroom four-locale sync verified |
| 07 | Decoded screenshot validation and internal transfer lifecycle | Merged PR #8; synthetic coverage only |
| 08 | Approved localized screenshot sets and order | Merged PR #9; live originals pending |
| 09 | Exact base price and availability comparison | Merged PR #10; Headroom reads verified |
| 10 | Explicit certificates, devices, profiles and downloads | Implemented candidate; mocked lifecycle only |
| 11 | Readiness and guarded submission | Pending |
| 12 | Headroom acceptance and release packaging | Pending |

Initial app creation is manual. Screenshot source assets and translations belong to the caller. Additional display families, private endpoints, binary uploads, IAPs and public release actions are outside the first implementation. See API-Contract.md for conditional write boundaries.

Generic territory mutation is conditional/disabled; Phase 09 supplies read-only comparison and manual-action reporting. The schema availability writes are pre-order-specific and outside v1.
