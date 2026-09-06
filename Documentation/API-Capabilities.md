# Capability and delivery status

Phases 00–06 are merged. Phase 06 provides selected localized metadata, version and review plans through the same approved engine. High-level screenshot sync, commerce, broader signing helpers and submission remain pending. Live acceptance is recorded separately from mock coverage.

| Phase | Capability | Status |
| --- | --- | --- |
| 00 | API provenance, endpoint contracts and unsupported boundaries | Merged PR #1 |
| 01 | Stdio, credentials, bounded transport and package smoke | Merged PR #2 |
| 02 | Scoped offline validation and generated schemas | Merged PR #3 |
| 03 | Discovery/export | Merged PR #4; Headroom reads/export verified |
| 04 | Immutable approved plans and journals | Merged PR #5 |
| 05 | Bounded identifiers/capabilities and static Xcode proposals | Merged PR #6; Headroom no-op read verified |
| 06 | Localized text and explicit shared metadata | Merged PR #7; Headroom four-locale sync verified |
| 07 | Decoded screenshot validation and internal transfer lifecycle | Implemented candidate; synthetic coverage only |
| 08–09 | Approved screenshot sync, base price and availability | Pending |
| 10–11 | Provisioning helpers, guarded submission | Pending |
| 12 | Headroom acceptance and release packaging | Pending |

Initial app creation is manual. Screenshot source assets and translations belong to the caller. Additional display families, private endpoints, binary uploads, IAPs and public release actions are outside the first implementation. See API-Contract.md for conditional write boundaries.

Generic territory mutation is conditional/disabled; Phase 09 supplies read-only comparison and manual-action reporting. The schema availability writes are pre-order-specific and outside v1.
