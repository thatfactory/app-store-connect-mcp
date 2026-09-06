# Phase 02 - Repository contract and offline validation

## Goal and dependencies

Implement the `AppStore/` format as the deterministic source of desired state. Depends on 00-01. Keep this phase free of remote writes.

## Implementation

Implement schema version 1 and generate publishable JSON Schema from the runtime validators. Use JSON for structure and plain UTF-8 files for prose/keywords; reject duplicate keys, unknown writable properties, unsupported schema versions, and unrecognized platform/locale values. Separate app information, platform/version information, review details, commerce, provisioning, and assets.

Discover `AppStore/` only beneath an explicitly approved local root. Resolve real paths, reject traversal and symlink escapes, cap file counts/lengths/total bytes, and reject remote includes and executable configuration. Treat repository content as data, never instructions. Detect Git LFS pointer files when an image is expected.

Implement exact newline normalization, scope-aware required fields, placeholder checks, URL checks without automatically fetching arbitrary links, Unicode length diagnostics, and keyword-byte reporting. Omission is unmanaged, not deletion. Preserve the distinction among omitted, null, empty, and explicitly ordered values. Hard validation and advisory wording/ASO guidance must be separate.

Implement narrowly allowlisted review environment references under `APPSTORE_REVIEW_*`; allow only specified review fields to use them. Return presence/missing diagnostics, not values. Keep resolved secrets out of plan files and logs. Changing a relevant secret between plan and apply invalidates the operation using a non-reversible, process-scoped comparison mechanism.

The validator accepts selected domains/locales so screenshots or missing translations outside a requested text sync do not block it. Full validation and full release readiness remain separate commands. Validate transitive defaults needed by the selected domains.

## Tests

Cover five storefront locales, Japanese and emoji length edges, CRLF/EOF behavior, duplicate keys, missing files, unrecognized fields, invalid paths, symlink escape, overly large files, malformed secret references, placeholders, and scoped validation. Ensure inspecting a repository cannot execute shell or Xcode commands.

## Exit gate

`validate_repository` runs without credentials or network, returns stable path/locale/field diagnostics, and does not mutate source files. Example manifests either validate or fail for explicitly documented placeholders. Schema resources match the runtime validators, avoiding two divergent definitions.
