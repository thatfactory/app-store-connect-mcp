# Public API contract

Audit baseline: 2026-09-06, official OpenAPI **4.4.1**. [Provenance](../contracts/provenance.json) pins the archive, full JSON and focused excerpt independently. [Endpoint inventory](API-Endpoints.md) maps every selected method/path to its request schema and response codes. The [schema](../contracts/apple-openapi.json) is Apple's payload contract, not this package's tool surface. Apple retains ownership of these specification excerpts; the repository MIT license applies to original implementation code.

Reproduce by downloading the source URL in provenance, extracting `openapi.oas (2).json`, and running `node scripts/extract-contract.mjs /path/to/extracted.json`. A changed hash requires a deliberate contract audit. No live credentials or account data were used in this audit.

## Decisions and conditions

| Domain | Established contract | Runtime condition / fallback |
| --- | --- | --- |
| Initial app | No POST /v1/apps; bundle registration is separate | Manual App Store Connect bootstrap with owner SKU, bundle ID, name, locale and platform |
| Identity | App reads expose bundle ID; version has app/platform/version relationships | Exact app/bundle agreement and unique explicit version; issuer is not Xcode team ID |
| App information | AppInfo and AppInfoLocalization are distinct from version localizations | Select unique editable AppInfo; never first record; ambiguous or unknown state blocks |
| Text | Create/update request schemas enumerate writable attributes and required parent relationships | Patch only selected fields; creation requires schema-required fields; omitted remains unmanaged |
| Bundle IDs | BundleIdPlatform is distinct from Platform | Explicit enum conversion; unsupported capability settings/dependencies block |
| Screenshots | Version localization → screenshot set → screenshot; ordered relationship PATCH exists | Only APP_DESKTOP initially; no independent cloud media library or cross-parent ID reuse |
| Transfer | Reserve fileName/fileSize, upload returned offset/length ranges, commit uploaded and sourceFileChecksum | Whole-file MD5 for Apple, SHA-256 for local identity; require complete processing before success |
| Pricing | POST /v1/appPriceSchedules requires app, baseTerritory, manualPrices and inline price resources | Resolve exact catalog price point, including zero; existing future schedules require explicit handling |
| Availability reads | GET availability v2 and territory resources | Enumerate full catalogs; requested coverage differs from effective eligibility |
| Availability writes | POST /v2/appAvailabilities and PATCH /v1/territoryAvailabilities/{id} are documented for pre-orders | Generic post-release territory mutation is conditional and disabled; manualActionRequired fallback. Pre-order management is outside v1 |
| Provisioning | Certificate CSR creation, device operations, profile relationships are schema-defined | Exact explicit resources; unknown compatibility and destructive effects block; no private-key input |
| Submission | Create reviewSubmission, create item referencing version, update submitted | Separate authorization/flag; compatible existing draft only; no ordinary apply; release behavior warning |

## State, permissions and failures

Schema enums list possible states; they do not grant edit permission. Initial conservative metadata write allowlist is PREPARE_FOR_SUBMISSION, DEVELOPER_REJECTED, REJECTED and METADATA_REJECTED, subject to resource-specific Apple restrictions. No writes to released/processing/in-review versions. AppInfo selection must examine its state independently. An operation outside a verified resource/state combination is conditional and must fail closed until its phase adds evidence.

Team API key roles and app access constrain each operation. Reads and writes must surface 403 as permission failure, not absent resources. No automatic role changes. Apple is authoritative on managed capabilities, certificate quotas, pricing agreements and review eligibility; a schema-valid body is insufficient evidence of permission.

All list adapters must enumerate bounded same-origin next links, detect cycles and reject incomplete snapshots. Handle JSON:API errors and non-JSON failures without reflecting secrets. 401 is authentication, 403 permission, 409 conflict, 429 rate limit; 5xx/network failure after a write can mean outcomeUnknown. No automatic POST replay. 204 is successful empty content. Preserve safe request IDs, never authorization or signed URLs.

## Asset security

Apple's asset guide defines offsets and lengths in bytes and permits retrying failed transfer parts. Verify exact coverage and unchanged source bytes. Storage requests never contain ASC authorization. HTTPS, no userinfo, public destination, bounded headers and no redirects are required. The official example uses a blobstore.apple.com host; this is evidence for that suffix, not all storage providers. Other host families remain conditional until separately audited. Never infer safety from an Apple-looking substring.

## Evidence levels

All inventory entries are schemaVerified. Resource behavior linked in Sources is documented. Phase 00 tests check reproducibility, references and representative payload shape; these are not adapter integration tests. Every adapter must add valid/invalid contract fixtures and behavior tests before fixtureTested is promoted. All domains are liveVerified=false. Conditional writes cannot be exposed before the corresponding phase resolves and tests its conditions.

## Availability semantic boundary

Apple documents [creation](https://developer.apple.com/documentation/appstoreconnectapi/post-v2-appavailabilities) and [territory modification](https://developer.apple.com/documentation/appstoreconnectapi/patch-v1-territoryavailabilities-_id_) specifically for pre-orders. The broader payload attribute `available` does not establish generic post-release inclusion/exclusion. No separate supported generic mutation was established from the current public contract. `contracts/operation-policy.json` therefore allows no ordinary availability writes. Phase 09 may compare desired/live territory sets and report a manual action, but must never substitute a pre-order operation. Any future pre-order implementation requires explicit intent, an eligible pre-order state, verified expected-release-date semantics and its own reviewed scope. Schema-valid data alone is insufficient.
