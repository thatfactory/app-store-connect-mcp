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
