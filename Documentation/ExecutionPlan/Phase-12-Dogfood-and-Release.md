# Phase 12 - Acceptance, documentation, and npm publication

## Goal and dependencies

Publish a reproducible first stable package only after its advertised scope and safety guarantees are demonstrated. Depends on all implementation phases. Suggested PR slices: acceptance/hardening; then release packaging/documentation.

## Implementation

Run the cross-cutting matrix, audit all tool schemas/annotations, test cancellation and bounded output, inspect redaction under failures, and verify that client-visible content cannot inject new tool operations. Fuzz repository paths, JSON validation, Apple error bodies, and transfer URL handling. Review dependencies and license obligations; no unreviewed blanket upgrades at release time.

Complete the Headroom procedure: baseline export, scoped four-locale text sync, supplied localized screenshots, explicitly selected commerce verification, read-back checks, and a final zero-write plan. Preserve owner approvals and sanitized evidence outside the npm tarball. Do not alter working certificates or submit the app for the sake of claiming all tools have live coverage.

Update README from future tense to actual supported behavior. Include requirements, exact credentials/aliases, write/submission flags, client setup, tool table, `AppStore/` format, manual initial-app bootstrap, Media Manager semantics, limits, troubleshooting, and evidence levels. Keep Product as vision/scope and Architecture as engineering contract. Unsupported roadmap features must not appear as released functionality.

Produce an npm tarball with only runtime files, needed schemas/resources, README, and license. Verify shebang/executable handling, ESM resolution, declared Node engine, production dependency installation, `--help`, `--version`, stdio handshake, tools/resources discovery, and one read-only/mock workflow from a clean external directory. Inspect `npm pack --dry-run` for source secrets, local plans, Headroom IDs/contacts, fixtures, and bulky originals; intentionally exclude examples containing app-specific identifiers from the published tarball.

Add CI with clean install, lint/type-check, unit/contract/security/integration tests, build, and packed-package smoke test. Keep live account tests owner-triggered, protected, and read-only by default. Publishing uses a protected GitHub workflow and npm trusted publishing where configured. A brand-new package may require owner-controlled initial npm setup before the publisher trust can be established; document the current verified steps rather than assuming it already exists.

Follow the sibling's release convention deliberately: package version `1.0.0` and matching release tag `1.0.0`, unless a reviewed policy change chooses a `v` prefix. Validate the checked-out release ref, run tests again, and avoid concurrent duplicate publishes. Never put a long-lived npm token or ASC key into tracked files. Document initial setup separately from routine releases.

## Final release gate

All required automated tests pass from a clean checkout; scope/evidence labels are accurate; critical security and data-loss findings are resolved; the final Headroom text/asset sync is verified or an explicit supplied-assets blocker prevents claiming that live gate; and the package smoke test succeeds. Owner authorization is still required to create/publish the npm package and GitHub release.

Deliver the exact version/tag, tarball inventory, test results, known limitations, and manual bootstrap notes. Do not state that this planning packet, an unexecuted test suite, or mocked Apple responses constitute a shipped working MCP.
