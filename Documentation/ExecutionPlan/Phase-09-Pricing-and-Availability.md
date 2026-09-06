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
