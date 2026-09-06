# Execution status

Phase 00 candidate: official OpenAPI 4.4.1 pinned, 131 operation contracts inventoried, domain conditions documented, 22 contract/documentation checks passing. Full-schema reproducibility check passed. No live Apple calls, runtime MCP, or publication yet. Phase 01 and later remain pending.

The attached combined implementation plan is preserved at the root. Canonical phase documents are split under this directory. Missing Architecture, API-Capabilities, Sources and Headroom procedure documents were created from the supplied product/format/plan contracts with fresh official API evidence. The original numbered S/R bibliography was not supplied; Sources documents that limitation.

CI and nightly match the sibling workflow layout and macOS runner, with Node 24 and contract tests for this pre-package phase. Phase 01 adds npm clean install/build and Phase 12 adds guarded publishing. README badges use the sibling design with this repository's URLs; NPM remains labelled planned until publication.

Initial PR review required a correction to availability semantics: generic territory writes are now explicitly disabled/conditional with a manual fallback; pre-order writes are outside v1. Local documentation links are checked automatically.
