# Phase 07 - Validate and transfer screenshot bytes

## Goal and dependencies

Implement a correct low-level screenshot upload lifecycle. Depends on 00-03. High-level set reconciliation is Phase 08.

## Implementation

Validate genuine PNG/JPEG bytes, decoded dimensions, file size, display-family compatibility, and API limits. Detect corrupt/truncated files, mismatched extensions, unsupported HEIC/WebP/PDF, and Git LFS pointers. Fail rather than automatically cropping or changing owner-approved marketing images. For macOS, implement the audited display type and 16:10 sizes from Apple.

Reserve a screenshot under an exact existing set using the audited filename/file-size attributes. Execute each returned upload operation with exactly its method, allowed URL, headers, byte offset, and length. Reject negative/out-of-bounds/overlapping or incomplete byte specifications according to the verified protocol. Stream bounded file segments; do not read arbitrarily large batches into memory.

Use the unauthenticated asset transfer client. Never forward the App Store Connect bearer token to an upload URL. Treat upload URLs/header values as sensitive, validate HTTPS/host policy and redirects, block local/private destinations, and redact signed query parameters. Support legitimate Apple-selected storage hosts using the audited allow policy rather than a guessed one-host rule.

Compute local SHA-256 for repository identity and the separately specified Apple checksum for commit; do not interchange the algorithms. Commit only after required byte transfers finish. Poll Apple's processing state with a deadline and cancellation. Return `processing` when still pending, not success; surface asset diagnostics on failure.

Retain reservation IDs for recovery. An uncertain reserve/commit must be reconciled. Retry byte ranges only when protocol-safe and within bounds. Cancelling stops future local work and reports already-created resources; it does not falsely claim remote rollback.

## Tests

Use a local mocked HTTP transfer server with synthetic signed URLs and multi-part responses. Verify precise bytes for nonzero offsets, headers/methods, checksums, no JWT at storage, forbidden redirects, size changes mid-upload, rate limits, corrupted parts, expired URLs, incomplete processing, terminal failure, commit timeout, and cancellation.

## Exit gate

A synthetic image traverses reserve/upload/commit/process successfully and every failure stage is distinguishable. An owner-authorized live image probe is desirable but must be recorded separately from mocked coverage and must not delete current production screenshots.
