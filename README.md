<p align="center">
  <a href="https://www.npmjs.com/package/@thatfactory/app-store-connect-mcp"><img alt="NPM" src="https://img.shields.io/badge/NPM-planned-CB3837.svg?logo=npm&logoColor=white"></a>
  <a href="https://developers.openai.com/codex/mcp"><img alt="Codex MCP" src="https://img.shields.io/badge/Codex-MCP-1F70C1.svg?logo=icloud&logoColor=white"></a>
  <a href="https://docs.anthropic.com/en/docs/claude-code/mcp"><img alt="Claude MCP" src="https://img.shields.io/badge/Claude-MCP-D97757.svg?logo=claude&logoColor=white"></a>
  <a href="https://en.wikipedia.org/wiki/MIT_License"><img alt="License" src="https://img.shields.io/badge/License-MIT-67ac5b.svg?logo=googledocs&logoColor=white"></a>
  <a href="https://github.com/thatfactory/app-store-connect-mcp/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/thatfactory/app-store-connect-mcp/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/thatfactory/app-store-connect-mcp/actions/workflows/nightly.yml"><img alt="Nightly" src="https://github.com/thatfactory/app-store-connect-mcp/actions/workflows/nightly.yml/badge.svg"></a>
</p>

# app-store-connect-mcp

MCP server for managing Apple's App Store Connect. 📦

**Status: discovery/export implemented; not published.** A source build exposes offline validation, app discovery, exact-version state reads, safe local export, manual app-record preparation, documentation and eight JSON Schemas. Headroom read-only discovery/export has been verified; all remote mutations remain pending. The intended first-release features below are not yet available.

Keep App Store metadata and localized screenshot sources beside your application code. Let an MCP-capable agent inspect the account, validate the repository, show a concrete change plan, and apply the approved changes through Apple's documented APIs.

## Intended first release

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

## Intended setup

Runtime target: Node.js 24 LTS. Xcode inspection is macOS-only; ordinary API and manifest operations should also work on Linux. A local checkout of the app repository must be accessible to the server process.

After publication, the intended MCP launch is:

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

## Development and documentation

Run `npm ci` and `npm run check` for strict type checking, tests, build, and a clean packed-package MCP smoke test. Run `node dist/index.js --help` for local launch options. CI and nightly execute the same checks on Node 24 without Apple credentials.

[Product](Documentation/Product.md) explains the longer-term vision. [Architecture](Documentation/Architecture.md) defines internal boundaries. [Execution plan](Documentation/ExecutionPlan/README.md) breaks implementation into reviewable changes. [Sources](Documentation/Sources.md) records the research baseline.

Planned distribution: public scoped npm package, MIT license, GitHub release publishing with trusted publishing where configured. Keep all customer repositories, credentials, exported review information, and signing artifacts out of the package tarball.

This is an independent project and is not affiliated with or endorsed by Apple.

## Offline validation

Start with `--allowed-root /absolute/path/to/checkout`, then call `validate_repository` with the absolute AppStore directory as `root`. Optional `domains`, `locales`, `platform` (directory spelling, such as `macOS`) and `version` limit the check. Domains: `appInfo`, `versionMetadata`, `version`, `review`, `screenshots`, `commerce`, `provisioning`. With no selector, validation considers declared platforms and discovered versions.

The initial locale registry covers en-US, de-DE, fr-FR, ja and pt-BR. Other Apple-supported locales require registry expansion. Validation preserves omission/null/empty values; it does not determine creation completeness or release readiness. JSON schema checks, paths, text budgets and screenshot manifests are implemented; decoded image validation remains Phase 07. Review environment references are field-allowlisted and resolved values never appear in results. Character checks use conservative UTF-16 units and report code points/graphemes/UTF-8 bytes for prose. No URLs are fetched.

The validator bounds each text/JSON file to 1 MiB, each referenced asset to 32 MiB, total read bytes to 64 MiB and files to 2000 per request. Results include up to 200 diagnostics and explicitly report truncation. Use narrower selectors for larger roots. The [synthetic example](examples/minimal/README.md) validates structurally but is not a ready-to-submit listing. Run `npm run schemas:check` to verify published schemas match the runtime validators.

## Read and export tools

| Tool | Behavior |
| --- | --- |
| `list_apps` | List apps, optionally filtered by exact bundle ID; bounded displayed results. |
| `get_app_store_state` | Require appStoreId/bundleId/platform; omit version to see candidates, then select an exact version. |
| `export_app_store_state` | Same target plus an absolute fresh `destination` beneath an approved existing parent. Never overwrites; writes local files only. |
| `prepare_app_record` | Confirm ID/bundle agreement or return manual bootstrap fields and missing owner values. Never POST /apps. |

Exports include metadata and a separate inventory/English fingerprint. Review contacts/logins become environment references; freeform review notes are withheld for owner inspection. No signed upload URLs or CDN downloads are exported. Null prose fields are recorded as unmanaged in inventory because plain text has no null representation. Unsupported locale/release configuration stops export instead of substituting defaults. Partial local exports remain visible for inspection after failure. See [read-only acceptance evidence](Documentation/Acceptance-Phase-03.md).
