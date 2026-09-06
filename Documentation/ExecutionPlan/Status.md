# Execution status

Phase 00 candidate: official OpenAPI 4.4.1 pinned, 131 operation contracts inventoried, domain conditions documented, 22 contract/documentation checks passing. Full-schema reproducibility check passed. No live Apple calls, runtime MCP, or publication yet. Phase 01 and later remain pending.

The attached combined implementation plan is preserved at the root. Canonical phase documents are split under this directory. Missing Architecture, API-Capabilities, Sources and Headroom procedure documents were created from the supplied product/format/plan contracts with fresh official API evidence. The original numbered S/R bibliography was not supplied; Sources documents that limitation.

CI and nightly match the sibling workflow layout and macOS runner, with Node 24 and contract tests for this pre-package phase. Phase 01 adds npm clean install/build and Phase 12 adds guarded publishing. README badges use the sibling design with this repository's URLs; NPM remains labelled planned until publication.

Initial PR review required a correction to availability semantics: generic territory writes are now explicitly disabled/conditional with a manual fallback; pre-order writes are outside v1. Local documentation links are checked automatically.

Phase 00 merged via PR #1 at 9fb8183 after exact-head Relay approval and green CI. Phase 01 candidate implements strict ESM package, lazy team-key JWT, safe bounded transport, offline stdio capabilities and package validation. 40 checks plus clean production tarball install/handshake passed locally; no live Apple calls. Publication workflow remains Phase 12.

Phase 01 merged through PR #2 after exact-head Relay approval and green Node24 CI. Phase 02 candidate adds strict schemas, secure file reading, scoped offline validation and process-keyed secret comparison. Generated schema drift checks, 54 tests and clean package validation pass; decoded image validation and creation/readiness checks remain later phases.

Phase 02 merged PR #3 after exact-head Relay approval and green CI. Phase 03 candidate adds GET-only discovery, verified identity/version selection, redacted state and fresh-directory export. 64 tests and package validation pass. Headroom live reads confirmed only en-US, no screenshots, version1.0 in PREPARE_FOR_SUBMISSION and existing AFTER_APPROVAL release behavior. Eight-file baseline exported privately; no Apple writes. See Acceptance-Phase-03.md.

Phase 03 merged through PR #4 after exact-head Relay approval and green CI (69 tests). Phase 04 candidate implements the shared immutable plan engine and status/apply tools with mock adapters. No remote domain writes are enabled yet. Safety tests cover changed bindings, approved subsets, partial failure, unknown outcomes, durable intent, redaction and account serialization.
