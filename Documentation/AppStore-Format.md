# AppStore directory format

Status: proposed schema version 1. Implement this specification in Phase 02 and publish machine-readable JSON Schemas with the package.

## 1. Why this layout

Keep small structured records in JSON and editable prose in plain text. Distinguish information shared by the app from information attached to a platform version. Store screenshot originals once and reference them from any number of versions. Keep secrets and operational state outside the committed content.

One `AppStore/` root manages one App Store app record, potentially with multiple platform versions. A monorepo can supply several explicit roots; the server must never choose the first root or app target automatically.

```text
AppStore/
  app.json
  commerce.json                         # optional until managed
  provisioning.json                     # optional until managed
  info/
    en-US.json
    de-DE.json
    fr-FR.json
    ja.json
    pt-BR.json
  versions/
    macOS/
      1.0/
        version.json
        review.json                     # optional for text-only sync
        review-notes.txt
        localizations/
          en-US/
            metadata.json
            description.txt
            keywords.txt
            screenshots.json           # optional until managed
            promotional-text.txt        # optional
            whats-new.txt               # updates only; absent for initial release
          de-DE/
          fr-FR/
          ja/
          pt-BR/
      1.1/
        ...
    iOS/
      ...
  assets/
    screenshots/
      macOS/
        en-US/
          01-overview.png
          02-weekly-budget.png
        de-DE/
        fr-FR/
        ja/
        pt-BR/
```

`.appstore-connect-mcp/` is a sibling ignored state directory, never part of `AppStore/`. Signing private keys, `.p8`, `.p12`, `.env`, private contact exports, and upload URLs are not repository content.

## 2. app.json

Example for Headroom, with deliberately unresolved URL placeholders:

```json
{
  "schemaVersion": 1,
  "app": {
    "appStoreId": "6809208740",
    "bundleId": "com.thatfactory.headroom",
    "primaryLocale": "en-US"
  },
  "platforms": ["MAC_OS"],
  "localizations": ["en-US", "de-DE", "fr-FR", "ja", "pt-BR"],
  "categories": {
    "primary": "UTILITIES",
    "secondary": "DEVELOPER_TOOLS"
  },
  "defaults": {
    "privacyPolicyUrl": "https://example.invalid/headroom/privacy"
  }
}
```

`appStoreId` is optional during bootstrap, but when supplied it must agree with `bundleId`. Store Apple IDs as strings. `sku` is optional for an existing record; it is required in the manual-bootstrap payload for a new record and must be owner-supplied. Do not invent Headroom's existing SKU.

`platforms` uses app-store platform values verified against the pinned schema. Directory names map through an explicit registry, for example `macOS -> MAC_OS` and `iOS -> IOS`. Bundle-registration platform values are a separate type. Version folder names and `versionString` must agree exactly; never parse version strings as decimals.

`localizations` is the intended locale coverage. Validate canonical App Store identifiers. `ja` is correct, not `jp`; `en-US` is correct, not `us`. Store locale metadata does not prove that the binary supports that language.

Category strings are product-level symbolic identifiers resolved against the current Apple category catalog. Their translation into actual API IDs belongs in the adapter; do not assume a UI name, numeric genre ID, or Xcode category constant is interchangeable. An unresolvable or platform-incompatible category blocks the relevant plan.

`defaults.privacyPolicyUrl` is an explicitly configured shared value to populate each selected app-information localization unless overridden. No hidden fallback of translated prose is permitted.

An optional `project` object can name a repository-relative project/workspace path, scheme, target, and configuration. It is inspection input, not a command. Derive its real values from the project instead of assuming every repository uses the main app's name for all of them.

## 3. info/<locale>.json

```json
{
  "name": "Headroom: Weekly Usage",
  "subtitle": "See your pace. Make it last."
}
```

Supported v1 fields are `name`, `subtitle`, and `privacyPolicyUrl`, with any additional fields added only after schema verification. These map to the correct `AppInfoLocalization`, not to the selected version localization.

A privacy URL may be inherited from the explicitly declared shared default or overridden here. Repeated brand names across locales are allowed; missing translated fields must not be auto-filled with English and labeled translated. Optional fields may be omitted to leave remote values unchanged. A new localization must supply the fields required by the verified API and the selected operation's completeness policy.

## 4. versions/<platform>/<version>/version.json

```json
{
  "schemaVersion": 1,
  "platform": "MAC_OS",
  "versionString": "1.0",
  "copyright": "2026 ThatFactory",
  "releaseType": "MANUAL",
  "defaults": {
    "supportUrl": "https://example.invalid/headroom/support"
  }
}
```

Copyright is one field on the platform version, not one per locale. Do not include the copyright symbol merely because it appears in App Store Connect's UI; Apple's interface adds it. The owner must verify the actual rights holder rather than assuming a trading name is the legal holder.

`releaseType` is a managed value when explicitly present. The initializer writes `MANUAL` for a new setup; the parser does not add it when importing an existing auto-release version. A change in release behavior must be visible in the plan. Date-based release options can be excluded from v1 or supported only with verified schema validation; do not invent date semantics.

The initializer can use `en-US` and free commerce for a new root. Those are initialization choices, not reconciliation defaults. Existing apps are preserved unless a selected scope explicitly manages a value.

## 5. Localized version files

`metadata.json` may contain `supportUrl` and `marketingUrl`. A support URL can inherit `version.json.defaults.supportUrl`. An empty JSON object is valid when the inherited URL is intentional. Long text lives in fixed filenames:

| File | API field | Behavior |
| --- | --- | --- |
| `description.txt` | `description` | Required to fully prepare a new listing; existing omitted field remains unmanaged. |
| `keywords.txt` | `keywords` | One comma-separated line; report characters and UTF-8 bytes. |
| `promotional-text.txt` | `promotionalText` | Optional. |
| `whats-new.txt` | `whatsNew` | For updates; absent on the initial version. |

Read UTF-8, reject malformed encoding, normalize CRLF to LF, and remove one conventional terminal file newline before measuring/uploading. Do not trim other whitespace, rewrite punctuation, remove accents, change keyword choices, or silently shorten copy. Show any normalization in the validation result.

The single-line keyword field permits ordinary keyword phrases where Apple supports them; spaces within a phrase are not automatically deleted. Whitespace around separators, repeated tokens, duplicated title terms, and short terms can be diagnostics. Hard limits and marketing suggestions are different classes of rule. Apply the documented byte/character budget from the versioned field registry, and verify Unicode edge cases during Phase 00.

Scope-aware validation matters: a text-only plan for `de-DE` must not fail because screenshots for `ja` have not been created yet. It must fail for a malformed German field that the plan would write. Full release-readiness validation considers every required locale/display combination and missing requirement.

## 6. Review information

`review.json` example:

```json
{
  "contactFirstName": {"env": "APPSTORE_REVIEW_FIRST_NAME"},
  "contactLastName": {"env": "APPSTORE_REVIEW_LAST_NAME"},
  "contactPhone": {"env": "APPSTORE_REVIEW_PHONE"},
  "contactEmail": {"env": "APPSTORE_REVIEW_EMAIL"},
  "demoAccountRequired": true,
  "demoAccountName": {"env": "APPSTORE_REVIEW_DEMO_USERNAME"},
  "demoAccountPassword": {"env": "APPSTORE_REVIEW_DEMO_PASSWORD"}
}
```

This is an example of a login-required app, not a statement that these are Headroom's reviewed settings. The owner decides how App Review can access Headroom and whether demo-account fields are appropriate for its Codex sign-in flow.

`review-notes.txt` contains non-secret reviewer instructions and prerequisites. It maps to the `notes` field, including anything described in conversation as "Requirements." Do not write a separate unsupported requirements field. Notes are not localized per storefront and have their own byte limit.

Only an explicitly allowed `APPSTORE_REVIEW_*` namespace can be dereferenced. Reject API keys or arbitrary environment-variable access masquerading as review data. Demo passwords must always be secret references. Public business contact strings may be literal by deliberate choice; templates default to references. Never place secrets into note-file interpolation: v1 has no generic templating engine.

Missing review secrets block only an operation that would write/use them, not unrelated metadata planning. Redact contacts and credentials from visible plans and journals. If importing review information, emit placeholder references by default rather than committing raw personal data.

## 7. Screenshot manifests and reuse

`localizations/en-US/screenshots.json`:

```json
{
  "mode": "merge",
  "sets": {
    "APP_DESKTOP": [
      "assets/screenshots/macOS/en-US/01-overview.png",
      "assets/screenshots/macOS/en-US/02-weekly-budget.png"
    ]
  }
}
```

Paths are relative to the `AppStore/` root, not to the nested screenshots.json file. They must resolve to regular local files inside that root. Reject remote URLs, absolute paths, path traversal, escaping symlinks, unresolved Git LFS pointer files, and duplicate references within a set. Explicit list order is display order; filenames do not silently determine order.

For the current Mac display type, accepted dimensions are 1280x800, 1440x900, 2560x1600, and 2880x1800. The default is not to resize or transcode anything. Validate according to the versioned Apple screenshot registry, including file format and any prescribed alpha/color constraints. Unknown display types block screenshot writes until supported; the same source layout can later cover more platforms.

A second version can reference those same paths. When an older version manifest must remain reproducible, add a new versioned or content-addressed filename instead of overwriting a source path shared by multiple versions. Validation should report which manifests reference a changed source, but apply still targets only the explicitly selected version. A locale may explicitly reference another locale's language-neutral image, but the validator should flag this for review; it must never substitute another language's image automatically. The source file being shared does not make the remote screenshot object global.

`merge` preserves unrelated remote items. `replace` makes a selected set exact and exposes all removals in the plan. An empty array is an explicit requested empty set and is destructive; omission of the display key or of screenshots.json is unmanaged. Do not submit a release with required screenshot coverage missing.

There is no separate `uploadToMediaManager` boolean: it would falsely imply a second independent Apple destination. The target is the version localization's display set, visible in Media Manager.

## 8. Commerce

`commerce.json` for a deliberately free, broadly available app:

```json
{
  "schemaVersion": 1,
  "price": {
    "mode": "free",
    "baseTerritory": "DEU"
  },
  "availability": {
    "territories": "all",
    "availableInNewTerritories": true
  }
}
```

Use Apple's territory identifiers from its catalog, not UI language tags. `all` means enumerate all current territories during planning, recording the exact set; changes to that catalog between plan and apply require revalidation. The new-territories flag is distinct from selecting every territory that exists today.

A paid-app configuration may instead supply an exact decimal string for a customer price and an explicit base territory, for example `{"mode":"paid","baseTerritory":"USA","customerPrice":"2.99"}`. Select a real matching price point from Apple; never round to a nearby amount silently. Price changes for an existing app are high-impact. Complex future schedules, introductory prices, subscriptions, and IAP prices are outside this initial simple commerce contract.

For restricted distribution, support an explicit territory list, with exclusions if implemented as a clearly defined alternative. Mutually contradictory forms are validation errors. Requested availability does not assert regional eligibility or accept legal declarations.

If commerce.json is absent or `commerce` is not selected, make no commerce changes. The default Headroom translation dogfood deliberately excludes this scope.

## 9. Provisioning

Optional `provisioning.json`:

```json
{
  "schemaVersion": 1,
  "primaryBundleId": {
    "name": "Headroom",
    "platform": "MAC_OS",
    "capabilities": []
  },
  "additionalBundleIds": []
}
```

The primary identifier comes from `app.json.app.bundleId`. Additional targets supply their own identifiers. Validate registration-platform values against the provisioning schema, not the App Store version schema.

Capabilities describe requested additions/updates, not an exact desired list to prune. A capability declaration can include a verified `capabilityType` and supported settings. Complex dependency resources or Apple-approved managed capabilities require their own verified workflow or an explicit blocker. Empty capabilities does not disable existing capabilities.

Do not infer every `.entitlements` key as a Developer Portal capability. For example, a macOS sandbox/network entitlement is not automatically an instruction to enable a same-named bundle-ID capability. Certificate, profile, device, and destructive operations use explicit typed planning inputs; do not hide lifecycle operations inside an everyday metadata file.

## 10. Parsing and management rules

Reject unknown JSON keys at the writable boundary; typos must not silently disappear. Reject duplicate JSON keys during parsing or with a pre-parse duplicate-key check. Reject unsupported schema versions and report a migration path. Allow no executable JSON/YAML, comments-as-instructions, remote includes, or arbitrary environment substitution.

Omission means unmanaged. Explicit `null` means clear only on fields documented as nullable/clearable. Empty strings do not automatically mean clear. Field lists, capability lists, territory lists, and screenshot arrays each have named semantics; do not generalize them into one destructive merge routine.

The planner validates the exact transitive inputs needed for selected domains/locales. A new app/version/localization may have stronger creation prerequisites than an update to an existing resource. Full readiness validates additional submission requirements. Errors include repository-relative path, locale, resource scope, field, rule, and remediation.

## 11. Importing an existing listing

Export to a fresh approved directory and refuse overwrites by default. Preserve text exactly after documented newline normalization. Export existing locale sets and known resource IDs as a separate mapping, not secrets embedded in content. Screenshot export in v1 provides inventory and mappings; downloading a CDN rendition does not prove recovery of the original upload bytes, so original sources remain owner-supplied.

The agent reviews/moves approved exported files into `AppStore/` using its normal repository tools. It can then author translations, commit, and push. The MCP server does not make commits or push branches. Include repository commit and dirty-input fingerprints in a plan when available, but local exact file hashes remain authoritative for the approved operation.

Sources: [Sources.md](Sources.md). The file format itself is a product proposal, not an Apple schema.

Current API audit: generic availability writes are conditional and disabled; pre-order writes cannot implement ordinary territory changes. See [API contract](API-Contract.md).
