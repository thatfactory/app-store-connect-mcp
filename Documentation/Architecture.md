# Architecture

Implementation contract; no runtime has shipped yet.

Use strict TypeScript, Node 24+, ESM, the official MCP SDK and stdio. Keep stdout exclusively for protocol messages. API credentials are resolved lazily from the six documented environment names; never load a target checkout's environment file.

`src/api` owns team-key JWT authentication, bounded JSON:API transport and typed resource adapters. A separate unauthenticated transfer client owns screenshot bytes. `src/repository` owns schemas, secure root resolution and normalized desired state. `src/planning` owns pure diffs, immutable plans, precondition checks and redacted recovery journals. `src/tools` binds intent-oriented handlers to these services.

Approved roots are startup configuration. Repository files are untrusted data, never commands. Resolve real paths and reject escapes, duplicate JSON keys, unknown writable fields and remote includes. Offline validation must need neither credentials nor network.

A plan binds exact app/bundle/platform/version identity, selected domains/locales, content hashes, credential context, rule versions and relevant remote state. Omitted fields are unmanaged. Explicit clearing requires a verified field contract. Applying a stored plan requires writes enabled and a digest plus approved operation IDs, including dependencies. This is a host authorization boundary: repeating a digest alone does not prove human consent.

Revalidate before writes, serialize resource mutations and read back results. A timeout after dispatch is an unknown outcome until reconciled; do not replay creates. Record confirmed IDs and redacted hashes in a private state directory outside AppStore. Local locking does not prevent another client changing Apple state; no global rollback is promised.

Submission uses its own flag and fresh plan and is unreachable from ordinary apply. No private Apple API, binary build/upload, automatic signing repair, translation or screenshot generation belongs in this server.
