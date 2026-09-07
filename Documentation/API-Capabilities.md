# Capability and delivery status

Phases 00–11 are merged. Phase 11 provides exact-build readiness and separately gated review submission. Phase 12 packages the complete `1.0.0` release candidate and guarded trusted-publishing workflow. Live acceptance is recorded separately from mock coverage.

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
| 10 | Explicit certificates, devices, profiles and downloads | Merged PR #11; mocked lifecycle only |
| 11 | Readiness and guarded submission | Merged PR #12; live submission requires genuine release intent |
| 12 | Headroom acceptance and release packaging | Release candidate; genuine screenshots and owner publication pending |

Initial app creation is manual. Screenshot source assets and translations belong to the caller. Additional display families, private endpoints, binary uploads, IAPs and public release actions are outside the first implementation. See API-Contract.md for conditional write boundaries.

Generic territory mutation is conditional/disabled; Phase 09 supplies read-only comparison and manual-action reporting. The schema availability writes are pre-order-specific and outside v1.
