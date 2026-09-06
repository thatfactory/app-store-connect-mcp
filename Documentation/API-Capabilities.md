# Capability and delivery status

Phase 00 is merged. Phase 01 implements the stdio foundation and offline get_capabilities. The underlying authentication/transport is tested but no remote adapter is exposed. API inventory operations remain unavailable as tools and none is live-verified.

| Phase | Capability | Status |
| --- | --- | --- |
| 00 | API provenance, endpoint contracts and unsupported boundaries | Merged PR #1 |
| 01 | Stdio, credentials, bounded transport and package smoke | Implemented, PR validation |
| 02–03 | Offline repository validation, discovery/export | Pending |
| 04–06 | Reviewed plans, identifiers/capabilities, localized text | Pending |
| 07–09 | Screenshot upload/sync, base price and availability | Pending |
| 10–11 | Provisioning helpers, guarded submission | Pending |
| 12 | Headroom acceptance and release packaging | Pending |

Initial app creation is manual. Screenshot source assets and translations belong to the caller. Additional display families, private endpoints, binary uploads, IAPs and public release actions are outside the first implementation. See API-Contract.md for conditional write boundaries.

Generic territory mutation is conditional/disabled; Phase 09 supplies read-only comparison and manual-action reporting. The schema availability writes are pre-order-specific and outside v1.
