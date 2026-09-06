# Phase 10 - Explicit certificate, device, and profile operations

## Goal and dependencies

Complete the bounded provisioning portion of the first stable release without becoming a signing-key management system. Depends on 00 and 04-05. These helpers are not prerequisites for updating Headroom metadata.

## Implementation

Extend `get_provisioning_resources` and the typed provisioning planner for certificate inventory/CSR-based creation/revocation, device inventory/registration/allowed updates, and profile inventory/creation/deletion/download as documented. Model only operations Apple actually supports for the selected resource/type/platform.

Accept an owner-supplied CSR file under an approved root; validate its encoding and key properties. Do not generate or accept private signing keys, export Keychain identities, run automatic certificate renewal, or revoke a certificate to work around an account limit. The API signing key is distinct from an app's signing identity.

Validate profile relationships to exact bundle ID, allowed certificate IDs/types, devices when required, and platform/distribution type. Do not attach every visible device or choose an arbitrary certificate. Report certificate expiration, disabled devices, and incompatible relationships before writing.

Destructive requests are separate typed operations with affected profile/resource inventory and high-impact approval. Indirect effects such as revocation affecting other apps must be visible. Capability changes do not trigger silent profile recreation.

`download_signing_artifact` writes only the requested certificate/profile to an approved non-overwriting path with restrictive permissions, returning its path/type/fingerprint. Treat device identifiers, profile contents, certificates, and CSR metadata as sensitive in logs even when not private-key secrets. Never commit them automatically or expose raw contents in MCP responses.

## Tests

Cover CSR parsing and private-key rejection, exact certificate/profile selection, duplicates, account limits, expiration, incompatible profile relationships, device platform rules, denied roles, explicit revocation/deletion approval, interrupted creates, and secure download paths. No destructive live test runs automatically in CI.

## Exit gate

Every advertised operation has contract and mocked integration coverage. Live verification uses only separately approved development resources; record untested lifecycle operations honestly. Headroom's working signing setup is not modified just to satisfy test coverage.
