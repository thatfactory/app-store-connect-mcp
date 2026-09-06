# Fixture evidence

Phase 00 fixtures are synthetic minimal structural payloads derived from required OpenAPI properties. They validate payload shape, not usable business values or Apple acceptance. Later adapter tests must add realistic synthetic semantics, invalid relationships, all transport errors and reconciliation scenarios.

For owner-authorized live capture, select a single operation, retain only fields needed for its assertion, replace resource IDs consistently with synthetic IDs, and strip tokens, contacts, device identifiers, certificate/profile contents, CSR metadata and all signed URLs/headers. Do not save raw HTTP traffic to tracked paths. Review the sanitized fixture before committing. A missing permission is a permission result, not an empty inventory. Record retrieval date, schema version, method/path and evidence level separately.
