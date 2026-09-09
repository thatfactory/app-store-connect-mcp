<p align="center">
  <a href="https://www.npmjs.com/package/@thatfactory/app-store-connect-mcp"><img alt="NPM" src="https://img.shields.io/npm/v/@thatfactory/app-store-connect-mcp?logo=npm&logoColor=white"></a>
  <a href="https://developers.openai.com/codex/mcp"><img alt="Codex MCP" src="https://img.shields.io/badge/Codex-MCP-1F70C1.svg?logo=icloud&logoColor=white"></a>
  <a href="https://docs.anthropic.com/en/docs/claude-code/mcp"><img alt="Claude MCP" src="https://img.shields.io/badge/Claude-MCP-D97757.svg?logo=claude&logoColor=white"></a>
  <a href="https://en.wikipedia.org/wiki/MIT_License"><img alt="License" src="https://img.shields.io/badge/License-MIT-67ac5b.svg?logo=googledocs&logoColor=white"></a>
  <a href="https://github.com/thatfactory/app-store-connect-mcp/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/thatfactory/app-store-connect-mcp/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/thatfactory/app-store-connect-mcp/actions/workflows/nightly.yml"><img alt="Nightly" src="https://github.com/thatfactory/app-store-connect-mcp/actions/workflows/nightly.yml/badge.svg"></a>
</p>

# app-store-connect-mcp

MCP server for managing Apple's App Store Connect from a version-controlled `AppStore/` directory. 🏪

It lets MCP-capable agents validate listing content, inspect App Store Connect, plan exact changes, and apply approved updates through Apple's documented APIs.

## Features

| Feature | Tool(s) |
| --- | --- |
| Validate an `AppStore/` directory | `validate_repository` |
| Discover apps and read exact version state | `list_apps`, `get_app_store_state` |
| Export existing App Store state | `export_app_store_state` |
| Prepare a missing app record for manual creation | `prepare_app_record` |
| Inspect bundle IDs, capabilities, and Xcode targets | `get_bundle_id_state`, `inspect_xcode_project` |
| Plan provisioning and localized metadata changes | `plan_provisioning_changes`, `plan_metadata_changes` |
| Plan screenshot and commerce changes | `plan_screenshot_changes`, `plan_commerce_changes` |
| Manage certificates, devices, and profiles | `get_provisioning_resources`, `plan_signing_changes`, `download_signing_artifact` |
| Apply an approved plan and inspect recovery state | `apply_plan`, `get_operation_status` |
| Check readiness and submit a prepared version | `check_release_readiness`, `plan_submission`, `submit_for_review` |

Changes are planned before they are applied. Omitted fields remain untouched, repeated synchronization converges to no changes, and ordinary synchronization cannot submit an app for review.

## Requirements

- Node.js 24 or later
- An MCP client
- A local app repository accessible to the server
- App Store Connect API credentials for remote operations
- macOS with an Apple Swift toolchain for screenshot validation and Xcode inspection

Offline repository validation does not require Apple credentials.

## Environment Variables

Primary names:

- `APPSTORE_CONNECT_API_KEY_ID`
- `APPSTORE_CONNECT_API_ISSUER_ID`
- `APPSTORE_CONNECT_API_KEY_CONTENT`

Compatibility aliases:

- `APP_STORE_KEY_ID`
- `APP_STORE_ISSUER_ID`
- `APP_STORE_PRIVATE_KEY`

The private key can be literal multiline PEM content or a string with escaped `\\n`. Supply credentials through the MCP host or process environment; the server does not load repository `.env` files.

## Claude Setup

```bash
claude mcp add app-store-connect \
  --env APPSTORE_CONNECT_API_KEY_ID="$APPSTORE_CONNECT_API_KEY_ID" \
  --env APPSTORE_CONNECT_API_ISSUER_ID="$APPSTORE_CONNECT_API_ISSUER_ID" \
  --env APPSTORE_CONNECT_API_KEY_CONTENT="$APPSTORE_CONNECT_API_KEY_CONTENT" \
  -- npx -y @thatfactory/app-store-connect-mcp \
  --allowed-root /absolute/path/to/app-repository
```

## Codex Setup

```bash
codex mcp add app-store-connect \
  --env APPSTORE_CONNECT_API_KEY_ID="$APPSTORE_CONNECT_API_KEY_ID" \
  --env APPSTORE_CONNECT_API_ISSUER_ID="$APPSTORE_CONNECT_API_ISSUER_ID" \
  --env APPSTORE_CONNECT_API_KEY_CONTENT="$APPSTORE_CONNECT_API_KEY_CONTENT" \
  -- npx -y @thatfactory/app-store-connect-mcp \
  --allowed-root /absolute/path/to/app-repository
```

The server starts without remote write access. Add `--allow-writes` to permit approved plans. Add `--allow-submission` together with `--allow-writes` only when review submission is intended.

## Available Tools

- `get_capabilities()`
- `validate_repository()`
- `list_apps()`
- `get_app_store_state()`
- `export_app_store_state()`
- `prepare_app_record()`
- `apply_plan()`
- `get_operation_status()`
- `get_bundle_id_state()`
- `inspect_xcode_project()`
- `plan_provisioning_changes()`
- `plan_metadata_changes()`
- `plan_screenshot_changes()`
- `plan_commerce_changes()`
- `get_provisioning_resources()`
- `plan_signing_changes()`
- `download_signing_artifact()`
- `check_release_readiness()`
- `plan_submission()`
- `submit_for_review()`

Use `get_capabilities` for the packaged implementation contract and each tool's MCP schema for its complete input shape.

## Example Prompts

```text
Export the current App Store information for bundle ID com.example.app into a new AppStore directory. Do not overwrite existing files.
```

```text
Validate AppStore, then plan the German and French metadata for macOS version 2.0. Leave English, pricing, screenshots, and submission unchanged.
```

```text
Plan the screenshots listed for version 2.0 in every configured locale. Show missing files, ordering changes, and removals before applying anything.
```

```text
Inspect the Release configuration of my app target and propose missing bundle IDs or capabilities. Do not register anything yet.
```

```text
Check whether macOS version 2.0 is ready for review and list every manual requirement that remains.
```

## Using the AppStore Directory

The server reads listing content, review information, commerce choices, provisioning declarations, and reusable screenshot sources from `AppStore/`. See the [format specification](Documentation/AppStore-Format.md) for the directory layout, supported locales, fields, defaults, secret references, and screenshot ordering.

The initial app record must be created in App Store Connect when one does not exist. The server can prepare the required values, but registering a bundle ID does not create the app record. App privacy, age ratings, export compliance, agreements, and regional obligations also remain explicit owner tasks.

Plans are bound to local inputs and relevant remote state. Review the digest and operation IDs returned by a planning tool before calling `apply_plan`. If an operation reports `outcomeUnknown`, inspect it with `get_operation_status` instead of replaying the write.

More detail is available in [metadata synchronization](Documentation/Metadata-Sync.md), [screenshot synchronization](Documentation/Screenshot-Sync.md), [commerce](Documentation/Commerce.md), [provisioning and Xcode inspection](Documentation/Provisioning-and-Xcode.md), [signing](Documentation/Signing.md), [submission](Documentation/Submission.md), and [plan recovery](Documentation/Plan-and-Apply.md).

## Local Development

```bash
npm ci
npm run check
```

Run the built server locally with:

```bash
npm run build
node dist/index.js --allowed-root /absolute/path/to/app-repository
```

The package is available on [npm](https://www.npmjs.com/package/@thatfactory/app-store-connect-mcp). Publishing a GitHub release automatically starts npm publication through trusted publishing. See [Release](Documentation/Release.md) for maintainer instructions.

This is an independent project and is not affiliated with or endorsed by Apple.
