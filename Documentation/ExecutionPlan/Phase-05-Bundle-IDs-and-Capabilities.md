# Phase 05 - Bundle identifiers and Xcode capability proposals

## Goal and dependencies

Register identifiers and configure explicitly approved capabilities without changing the Xcode project. Depends on 00, 02-04. Existing-app metadata dogfooding does not depend on this phase.

## Implementation

Add bundle-ID discovery/creation and capability read/create/update operations from the audited schema. Match existing identifiers exactly. Preserve existing capabilities not managed by the request; an empty capability list does not disable everything. Detect unsupported combinations and extra setup such as identifiers/groups that a boolean toggle cannot satisfy.

Implement local read-only Xcode inspection with an explicit project/workspace, app target, configuration, and platform selection. Parse project/build-setting/entitlement sources safely; report unresolved substitutions and provenance rather than guessing. Main apps, extensions, tests, and frameworks must not be conflated. A bundle-ID change is a proposal, not an automatic rewrite of project files.

Static inspection is the default. Any optional `xcodebuild -showBuildSettings` execution requires a separate explicit opt-in for an approved checkout, no shell interpolation, bounded execution, and a documented warning about project/toolchain evaluation. It must never build, archive, run project scripts intentionally, resolve unrequested dependencies, or upload binaries. Missing Xcode on non-macOS hosts is a supported limitation, not a server startup failure.

Use a versioned capability mapping with confidence/provenance. macOS sandbox permissions do not automatically correspond to portal capabilities. Unknown entitlement keys remain unresolved. Issuer ID and Xcode team ID are separate concepts. Primary/extension identifiers require explicit inclusion, not indiscriminate registration of every target.

Route explicit user operations and repository provisioning configuration through `plan_provisioning_changes`. Review any capability removal/update with impacts; never revoke/recreate signing assets automatically to make the change appear successful.

## Tests

Cover existing/absent identifiers, duplicate/conflicting creation, correct platform enum conversion, target selection, variable substitution, extension targets, unknown entitlements, sandbox-only keys, capability dependencies, permission failures, and no project mutation. Simulate a capability write timing out and verify reconciliation before retry.

## Exit gate

The tool can propose and apply one reviewed bundle registration/capability change using public API contracts, while a repeated run is a no-op. Headroom's existing identifier is preserved. App-record preparation still reports the distinct manual bootstrap when the listing does not exist.
