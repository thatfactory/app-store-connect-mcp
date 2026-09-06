# Phase 01 - Package, MCP transport, and credentials

## Goal and dependencies

Create a small working stdio package with tested authentication and HTTP behavior. Depends on Phase 00. Suggested PR slices: package/stdio; then auth/HTTP.

## Implementation

Initialize TypeScript ESM, strict compiler settings, Node.js 24 LTS baseline, an executable entry point, and the official TypeScript MCP SDK with compatible Zod. Pin resolved dependencies in `package-lock.json`; verify currently compatible stable versions during implementation rather than copying a stale lockfile. Follow the sibling's `src/api`, `src/tools`, tests, clean build, and npm packaging conventions.

Implement help/version and explicit root/write/submission flags. Register a minimal `get_capabilities` tool and schema/documentation resources. Reserve stdout for protocol traffic. Add compact structured results, central errors, redacted stderr, and cancellation support. Do not add an HTTP service or hosted account system.

Implement the six credential names exactly as specified, primary precedence, PEM normalization, validation, and in-memory team-key JWT caching. Lazy credential resolution allows offline local tools. Do not load the target repository's `.env`, log configuration values, or silently change to an individual-key flow.

Build an injected-fetch JSON:API client with an exact API-origin allowlist; bounded same-origin pagination with loop detection; timeouts; abort signals; 204 support; structured and non-JSON error handling; and request IDs. Reads may use bounded backoff. Classify writes by safe retry/reconciliation policy: never automatically replay an uncertain create. Respect rate-limit guidance and retry hints only within a bounded budget.

Create a separate interface for presigned asset transfers without ASC authorization. Do not reuse the sibling's authenticated artifact-download helper for screenshot transfer URLs.

## Tests

Test SDK initialization, tools/list, malformed input, clean shutdown, stdout purity, missing credentials, primary/alias combinations, empty primary values, quote/newline normalization, invalid EC keys, token refresh margin, and redaction. Transport fixtures cover pagination loops and cross-origin next links, 204, 401/403/409/429/5xx, request cancellation, and non-JSON failures.

## Exit gate

`npm ci`, type checking, tests, and build work on a clean checkout. A locally packed executable completes an MCP handshake and exposes diagnostics without contacting Apple until a remote tool is invoked. No write adapter is publicly reachable yet. CI uses no production credentials.
