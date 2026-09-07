<p align="center">
  <a href="https://www.npmjs.com/package/@thatfactory/app-store-connect-mcp"><img alt="NPM" src="https://img.shields.io/badge/NPM-ready-CB3837.svg?logo=npm&logoColor=white"></a>
  <a href="https://developers.openai.com/codex/mcp"><img alt="Codex MCP" src="https://img.shields.io/badge/Codex-MCP-1F70C1.svg?logo=icloud&logoColor=white"></a>
  <a href="https://docs.anthropic.com/en/docs/claude-code/mcp"><img alt="Claude MCP" src="https://img.shields.io/badge/Claude-MCP-D97757.svg?logo=claude&logoColor=white"></a>
  <a href="https://en.wikipedia.org/wiki/MIT_License"><img alt="License" src="https://img.shields.io/badge/License-MIT-67ac5b.svg?logo=googledocs&logoColor=white"></a>
  <a href="https://github.com/thatfactory/app-store-connect-mcp/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/thatfactory/app-store-connect-mcp/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/thatfactory/app-store-connect-mcp/actions/workflows/nightly.yml"><img alt="Nightly" src="https://github.com/thatfactory/app-store-connect-mcp/actions/workflows/nightly.yml/badge.svg"></a>
</p>

# app-store-connect-mcp

MCP server for managing Apple's App Store Connect. 📦

**Status: first-release implementation complete through guarded review submission; not published.** A source build exposes offline validation, app discovery, exact-version state reads, safe local export, manual app-record preparation, approved synchronization, release readiness, separately gated submission, documentation and eight JSON Schemas. Headroom discovery/export, four-locale metadata synchronization, free pricing and configured territory availability have been verified. Screenshot acceptance still requires genuine localized originals, and no live review submission was attempted without genuine release intent.

Keep App Store metadata and localized screenshot sources beside your application code. Let an MCP-capable agent inspect the account, validate the repository, show a concrete change plan, and apply the approved changes through Apple's documented APIs.

## Supported scope

- Register bundle IDs and reconcile explicitly requested capabilities. Inspect an Xcode project to propose the identifiers and capabilities it needs.
- Discover existing App Store app records, prepare the manual bootstrap for a missing record, and create editable platform versions.
- Synchronize localized names, subtitles, descriptions, keywords, support URLs, privacy-policy URLs, and other supported listing fields.
- Manage version-wide copyright and App Review contact information and notes.
- Upload, verify, order, and reconcile localized screenshots for a selected version and display type, using reusable source files in `AppStore/assets/`.
- Configure an explicitly managed base price and storefront availability. New configuration templates start free and request all current territories.
- Provide explicit certificate, device, and provisioning-profile workflows without automatic certificate revocation or private-key custody.
- Check submission readiness, select an already uploaded build, and submit a selected version only through a separate approved submission operation.

An unchanged second sync must produce no writes. Omitted fields remain untouched. A regular metadata sync must never submit or release an app.

## Boundaries

The initial App Store app record requires a manual bootstrap unless a documented public creation endpoint is verified during implementation. This is distinct from registering a bundle ID or creating a version. See [API capabilities](Documentation/API-Capabilities.md).

Media Manager is not treated as a separate cloud library. Files are assigned to version-localization screenshot sets. Reuse between versions means reusing repository paths and reconciling each destination, not assuming a screenshot ID can have several parents.

Uploading a privacy-policy URL does not complete Apple's privacy questionnaire. Builds, age ratings, export-compliance declarations, agreements, and regional requirements can still block submission. The server must report those blockers rather than invent answers.

## Requirements and setup

Runtime target: Node.js 24 LTS. Xcode inspection is macOS-only; ordinary API and manifest operations should also work on Linux. A local checkout of the app repository must be accessible to the server process.

Requirements: macOS for screenshot decoding and signing CSR validation, Node.js 24 or later, an MCP client, an accessible local app checkout, and App Store Connect API credentials for remote tools. Offline validation needs no credentials.

The packaged MCP launch is:

```sh
npx -y @thatfactory/app-store-connect-mcp --allowed-root /absolute/path/to/app-repository
```

This is read-only with respect to Apple. To permit approved write plans, start it with `--allow-writes`. Add `--allow-submission` separately only when review submission is intended. Neither flag removes plan validation or the host's responsibility to obtain user approval.

Use the same credentials as `xcode-cloud-mcp`:

| Primary environment variable | Compatibility alias |
| --- | --- |
| `APPSTORE_CONNECT_API_KEY_ID` | `APP_STORE_KEY_ID` |
| `APPSTORE_CONNECT_API_ISSUER_ID` | `APP_STORE_ISSUER_ID` |
| `APPSTORE_CONNECT_API_KEY_CONTENT` | `APP_STORE_PRIVATE_KEY` |

The private key accepts literal multiline PEM or escaped `\n`. A present primary variable wins over its alias; malformed or blank primary values fail clearly rather than silently selecting a different identity. The server does not read a repository `.env` automatically. Supply credentials through the MCP host or the process environment.

Credential compatibility does not imply permission compatibility. A key that can read Xcode Cloud might lack permission for provisioning or app metadata. The server reports authorization failures with the affected resource and operation.

Codex setup:

```sh
codex mcp add app-store-connect \
  --env APPSTORE_CONNECT_API_KEY_ID="$APPSTORE_CONNECT_API_KEY_ID" \
  --env APPSTORE_CONNECT_API_ISSUER_ID="$APPSTORE_CONNECT_API_ISSUER_ID" \
  --env APPSTORE_CONNECT_API_KEY_CONTENT="$APPSTORE_CONNECT_API_KEY_CONTENT" \
  -- npx -y @thatfactory/app-store-connect-mcp \
  --allowed-root /absolute/path/to/app-repository
```

Claude setup:

```sh
claude mcp add app-store-connect \
  --env APPSTORE_CONNECT_API_KEY_ID="$APPSTORE_CONNECT_API_KEY_ID" \
  --env APPSTORE_CONNECT_API_ISSUER_ID="$APPSTORE_CONNECT_API_ISSUER_ID" \
  --env APPSTORE_CONNECT_API_KEY_CONTENT="$APPSTORE_CONNECT_API_KEY_CONTENT" \
  -- npx -y @thatfactory/app-store-connect-mcp \
  --allowed-root /absolute/path/to/app-repository
```

Add `--allow-writes` only for reviewed synchronization plans. Add `--allow-submission` together with `--allow-writes` only when review submission is genuinely intended.

## Available tools

| Area | Tools |
| --- | --- |
| Capabilities and local format | `get_capabilities`, `validate_repository` |
| Discovery and export | `list_apps`, `get_app_store_state`, `export_app_store_state`, `prepare_app_record` |
| Plan execution | `apply_plan`, `get_operation_status` |
| Identifiers and metadata | `get_bundle_id_state`, `inspect_xcode_project`, `plan_provisioning_changes`, `plan_metadata_changes` |
| Screenshots and commerce | `plan_screenshot_changes`, `plan_commerce_changes` |
| Signing resources | `get_provisioning_resources`, `plan_signing_changes`, `download_signing_artifact` |
| Release | `check_release_readiness`, `plan_submission`, `submit_for_review` |

Every remote mutation starts from a fresh immutable plan. The host must approve the exact digest and operation IDs. `submit_for_review` additionally requires every operation in a submission-only plan; ordinary `apply_plan` rejects submission actions.

## Repository layout

```text
AppStore/
  app.json
  commerce.json
  provisioning.json                 # optional
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
        review.json
        review-notes.txt
        localizations/
          en-US/
            metadata.json
            description.txt
            keywords.txt
            screenshots.json
          ...
  assets/
    screenshots/
      macOS/
        en-US/
          01-overview.png
          02-weekly-budget.png
        ...
```

See [the format specification](Documentation/AppStore-Format.md) for defaults, optional files, localization rules, screenshot ordering, and safe secret references. The server reads the local checkout; it neither clones repositories nor commits or pushes changes by itself.

## Example agent requests

> Import Headroom's existing App Store information into a new local export directory. Do not overwrite my repository files.

> Validate `AppStore`, then plan the German, French, Japanese, and Brazilian Portuguese metadata for macOS version 1.0. Leave English, pricing, screenshots, and submission unchanged.

> Plan the screenshots listed for version 1.0 in every configured locale. Show missing files, ordering changes, and any removals before applying.

> Inspect the app target and propose any missing bundle IDs or portal capabilities. Do not change the Xcode project or register anything yet.

## Troubleshooting and evidence

- `authenticationRequired` means the three primary credential variables are missing or unusable. Compatibility aliases are accepted, but a present malformed primary value fails instead of falling back.
- `permissionDenied` means the authenticated key cannot access the selected resource or operation. It is not treated as an absent app or empty collection.
- `stalePlan` means local inputs, secrets, account identity, target, rules, or relevant live state changed. Create and review a fresh plan; never edit a saved plan artifact.
- `outcomeUnknown` means a write may have reached Apple but its exact postcondition was not proven. Poll `get_operation_status`; do not replay the write or continue unattempted operations.
- Screenshot validation requires macOS, Swift, and ImageIO. Supply original RGB PNG/JPEG bytes with supported App Store dimensions; Git LFS pointers, alpha, transforms, and placeholders fail closed.
- Signing never accepts private keys. Developer ID certificate creation remains in Xcode or the Apple Developer website. Artifact downloads require a new path under an approved root.

The [release-candidate evidence](Documentation/Acceptance-Phase-12.md) separates live, synthetic, and pending acceptance. In particular, genuine localized Headroom screenshots were not supplied, signing mutations remain mocked, and no review submission was made without genuine release intent.

## Development and documentation

Run `npm ci` and `npm run check` for strict type checking, tests, build, and a clean packed-package MCP smoke test. Run `node dist/index.js --help` for local launch options. CI and nightly execute the same checks on Node 24 without Apple credentials.

[Product](Documentation/Product.md) explains the longer-term vision. [Architecture](Documentation/Architecture.md) defines internal boundaries. [Execution plan](Documentation/ExecutionPlan/README.md) breaks implementation into reviewable changes. [Sources](Documentation/Sources.md) records the research baseline.

Distribution target: public scoped npm package, MIT license, and GitHub release publishing through npm trusted publishing. See [release and initial publisher setup](Documentation/Release.md). Keep all customer repositories, credentials, exported review information, and signing artifacts out of the package tarball.

This is an independent project and is not affiliated with or endorsed by Apple.

## Offline validation

Start with `--allowed-root /absolute/path/to/checkout`, then call `validate_repository` with the absolute AppStore directory as `root`. Optional `domains`, `locales`, `platform` (directory spelling, such as `macOS`) and `version` limit the check. Domains: `appInfo`, `versionMetadata`, `version`, `review`, `screenshots`, `commerce`, `provisioning`. With no selector, validation considers declared platforms and discovered versions.

The initial locale registry covers en-US, de-DE, fr-FR, ja and pt-BR. Other Apple-supported locales require registry expansion. Validation preserves omission/null/empty values; release readiness is a separate remote check. JSON schema checks, paths, text budgets, screenshot manifests, and native decoded-image validation are implemented. Review environment references are field-allowlisted and resolved values never appear in results. Character checks use conservative UTF-16 units and report code points/graphemes/UTF-8 bytes for prose. Metadata URLs are not fetched.

The validator bounds each text/JSON file to 1 MiB, each referenced asset to 32 MiB, total read bytes to 64 MiB and files to 2000 per request. Results include up to 200 diagnostics and explicitly report truncation. API pagination, account inventories, plans, transfer instructions, output bodies, and operation counts also have fixed limits and fail closed when completeness cannot be established. Use narrower selectors for larger roots. The [synthetic example](examples/minimal/README.md) validates structurally but is not a ready-to-submit listing. Run `npm run schemas:check` to verify published schemas match the runtime validators.

## Read and export tools

| Tool | Behavior |
| --- | --- |
| `list_apps` | List apps, optionally filtered by exact bundle ID; bounded displayed results. |
| `get_app_store_state` | Require appStoreId/bundleId/platform; omit version to see candidates, then select an exact version. |
| `export_app_store_state` | Same target plus an absolute fresh `destination` beneath an approved existing parent. Never overwrites; writes local files only. |
| `prepare_app_record` | Confirm ID/bundle agreement or return manual bootstrap fields and missing owner values. Never POST /apps. |

Exports include metadata and a separate inventory/English fingerprint. Review contacts/logins become environment references; freeform review notes are withheld for owner inspection. No signed upload URLs or CDN downloads are exported. Null prose fields are recorded as unmanaged in inventory because plain text has no null representation. Unsupported locale/release configuration stops export instead of substituting defaults. Partial local exports remain visible for inspection after failure. See [read-only acceptance evidence](Documentation/Acceptance-Phase-03.md).

The shared plan engine is implemented, with immutable process-bound plans, exact-subset host approval, flushed redacted journals, stale-state checks and readback reconciliation. Adapters cover selected localized/shared metadata, screenshot sets, bundle IDs, a bounded capability subset, explicit signing resources and simple app-wide base prices. Availability comparison is read-only and reports manual actions because generic public writes are not established. Release submission uses a separate submission-only plan and runtime gate. See [plan and recovery semantics](Documentation/Plan-and-Apply.md), [signing boundaries](Documentation/Signing.md), [commerce boundaries](Documentation/Commerce.md), and [submission boundaries](Documentation/Submission.md).

[Provisioning and static Xcode inspection](Documentation/Provisioning-and-Xcode.md) describes supported capabilities, unresolved settings and signing impacts.

[Metadata synchronization](Documentation/Metadata-Sync.md) explains independent locale families, explicit shared domains and secret-safe review details.

[Headroom metadata acceptance](Documentation/Acceptance-Phase-06.md) records verified readback, unchanged English and a repeated no-op plan.

Screenshot validation currently requires macOS with an installed Apple Swift toolchain and ImageIO. Other MCP features remain available on supported Node platforms. It decodes original RGB PNG/JPEG bytes without modifying them and rejects alpha, orientation transforms, corruption and unsupported dimensions. Approved screenshot plans are implemented with explicit removals and complete ordering. See [screenshot transfer boundaries](Documentation/Screenshot-Transfer.md).

Use `plan_screenshot_changes` with `root`, `platform: "macOS"`, `version` and selected `locales`, then inspect the complete order and deletion risks before approving `apply_plan`. Pending uploads require recovery before a fresh merge. See [screenshot sync and recovery](Documentation/Screenshot-Sync.md). Headroom screenshot acceptance is pending genuine localized originals; the automated coverage uses synthetic fixtures.
