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
