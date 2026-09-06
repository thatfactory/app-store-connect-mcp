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
