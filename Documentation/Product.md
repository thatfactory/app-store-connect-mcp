# Product: app-store-connect-mcp

Status: first-release specification. Prepared 2026-09-06.

## 1. Purpose

`app-store-connect-mcp` makes App Store preparation a repeatable, repository-driven workflow accessible to an agent through Model Context Protocol. Instead of copying descriptions, keywords, contact details, and screenshots into many App Store Connect screens, the developer reviews these inputs in Git and asks the agent to synchronize a precise selection.

The product is an independent sibling of `xcode-cloud-mcp`, not a replacement. The sibling focuses on Xcode Cloud workflows and build diagnostics. This server focuses first on provisioning and the App Store listing/release lifecycle. Both accept the same App Store Connect team-key environment variables.

**Core promise:** given reviewed repository inputs and an identified Apple app/version, explain the changes, apply only the approved changes, verify the results, and make repeating the operation safe.

## 2. Users

The primary user is an Apple-platform developer working with an MCP-capable coding agent and a local repository checkout. The product supports adopting an existing listing without rebuilding it from scratch or overwriting manually entered metadata.

A secondary user is a small team reviewing metadata changes in pull requests. Their concerns include accountability, accidental pricing changes, credentials, and a release pipeline that can resume after an interrupted screenshot upload.

## 3. What the first release does

### Repository-owned listing content

Read a conventional `AppStore/` directory. Structured values use JSON; long descriptions, keywords, and review notes use UTF-8 plain-text files. App-wide information is separate from platform/version-specific content. Screenshot originals are reusable assets, referenced by ordered lists in each version localization.

Provide a schema, validation, remote-state inspection, and a non-overwriting import/export path. Report missing translations and missing assets by exact file and field. An agent may author translations in a separate repository-editing step; the MCP server itself does not call a translation model or silently generate text.

### Provisioning

Register explicit bundle IDs, inspect existing registrations, and enable or update explicitly declared supported capabilities. Inspect selected Xcode targets to propose bundle IDs and capability requirements, with provenance and unresolved settings shown to the user.

Provide bounded, explicit workflows for certificates, devices, and profiles: inspect/list, register or create when requested, download public certificates/profiles, and perform supported destructive actions only as specifically approved high-impact operations. Do not become an automatic signing system or a private-key vault. Never revoke a certificate simply to free a slot.

### App records and versions

Resolve an existing app using its App Store ID and bundle ID and verify that both refer to the same app. When an app record is missing, prepare the exact bootstrap values for the owner. Initial app-record creation is a documented limitation of the baseline, not a fake success. Registering its bundle ID can still be automated.

Create or select an editable version for an explicit platform and version string. English (US), `en-US`, is the initialization default, not an instruction to reset an existing app's primary language. New version templates default to manual release.

### Metadata and App Review information

Manage localized app names, subtitles, privacy-policy URLs, descriptions, keywords, support and marketing URLs, promotional text, and update release notes where applicable. Manage categories, version-wide copyright, and version-wide review contacts, demo-account references, and testing notes. Store "requirements for the reviewer" in review notes; there is no invented separate requirements endpoint.

Correctly distinguish the two localization resource families: app-information localizations and App Store version localizations. Updating one must not be reported as having updated both. Copyright and review details are not duplicated per locale.

### Screenshots

Upload existing local PNG/JPEG sources to the right app, platform version, locale, and display-type set. Validate sources before reserving remote assets. Perform the documented reserve/upload/commit/status lifecycle; wait or return a truthful pending state until Apple reports processing complete.

Set screenshot order explicitly, preserve unrelated remote screenshots by default, and support an explicitly approved exact replacement. Reuse sources across versions without requiring file duplication. An unchanged destination/source combination must not be uploaded again.

Media Manager is the App Store Connect UI for these version-scoped assets. The first release does not promise a standalone Apple media library, a remote tag system, or cross-parent screenshot-ID reuse. The local `AppStore/assets/` directory supplies the reusable library abstraction.

### Pricing and availability

Initialize templates as free and request all current App Store territories. Reconcile only when the commerce scope is selected and explicitly configured. Resolve actual price-point and territory resources instead of hard-coding price-tier IDs or a country count.

Preserve an existing paid price when no price is managed. Adding a default to a schema must never turn an existing paid app free. Selecting all territories expresses the desired storefront set, not a claim that every region is immediately distributable. Read back requested versus effective availability and report blocking requirements.

### Submission

Provide a readiness report and bind an explicitly identified already uploaded build. A separate, narrowly approved submission action can submit the selected version using the currently supported review-submission workflow.

Normal synchronization never submits or publishes. First-release scope includes submission for review, not automatic public release. Existing automatic-release settings must be surfaced before submission because approval could then publish the app.

## 4. Non-goals and honest boundaries

The server does not build, archive, sign binaries, upload app binaries, generate screenshots, render marketing artwork, write translations, select a business model, or change application code. Those can be performed by an agent using other tools and then checked into the repository.

It does not use Apple ID passwords, cookies, undocumented private endpoints, or browser automation as a hidden fallback. It does not accept agreements, guess privacy declarations, fabricate age ratings or export-compliance answers, or claim that setting a privacy URL completes App Privacy.

App previews/video, custom product pages, product-page optimization, IAPs/subscriptions, analytics/reporting, reviews, TestFlight management, and user administration are roadmap domains, not first-release features. Selecting a build for App Review is in scope; becoming a TestFlight management tool is not.

## 5. Product principles

**Explicit authority.** An app ID, bundle ID, platform, version, locale set, and operation scope are resolved before any write. Discovery ambiguity is a blocker, not an invitation to choose the first match.

**Reviewable changes.** Planning is separate from applying. A plan lists intended creates, updates, removals, unchanged fields, unsupported actions, and prerequisites. A plan is bound to input content and relevant remote state.

**Convergence without collateral changes.** Running a successful synchronization again produces no writes. Missing optional values mean "not managed," not "delete." No hidden locale deletion, screenshot pruning, price reset, or capability removal.

**Local and private.** The server stores no Apple private keys. It never sends credentials to image-upload destinations, includes secrets in errors, or emits telemetry. Review contacts and demo-account secrets are redacted from logs and plans.

**Honest completeness.** Distinguish accepted requests from completed asset processing, metadata synchronization from review submission, and requested territory selection from actual distribution eligibility.

**Small surface.** Offer a small set of intent-oriented tools backed by typed adapters. Do not expose an unrestricted generic REST-request tool or hundreds of raw endpoints.

## 6. Key user journeys

### Existing app: add four languages

Read the current app/version and export a baseline. The agent creates reviewed locale files. Validate only the chosen locale scope, produce a text-only plan, apply it, and verify all written fields. English, screenshots, commerce, and submission stay unchanged. Repeat the same plan request and observe a no-op.

### New app: prepare a listing

Inspect the selected target, propose/register its bundle ID and capabilities, and prepare a manual app-record bootstrap when required. Re-discover the created record, verify identity, and continue with version information, locale content, screenshots, review information, and explicitly selected commerce settings.

### New version: reuse or change screenshots

Create a version directory with ordered references to existing assets. Change references or originals only where necessary. Plan destination-specific actions; unchanged screenshots are kept, new ones are uploaded and processed, and order changes are applied. Never alter an already released version's screenshots.

### Submit an already prepared release

Run readiness checks and resolve the exact build. Complete any owner-only requirements. Generate a new submission plan that includes release behavior. Obtain explicit authorization and submit; return the submission ID and observed state. Do not label a pending review "released."

## 7. Success criteria for 1.0.0

Configured locale listings can be applied from Git-owned content without overwriting unmanaged locales. Each configured locale has the intended ordered screenshots in the selected draft version. A second full synchronization makes zero remote mutations. Interruption recovery does not duplicate assets or versions.

Bundle IDs and supported capabilities can be created from an explicit manifest or a reviewed inspection result. Certificate, device, and profile workflows have targeted tests and a guarded live validation path. Price and availability changes show their account-wide/storefront impact before application.

The packed npm artifact runs as a stdio MCP server in supported hosts. Ordinary CI needs no Apple credentials. No credential, demo login, private contact, or signed upload URL is present in logs, test fixtures, exports, or the published tarball.

Successful metadata verification is not evidence of successful submission. Record live-verification coverage separately for each domain and require evidence for every tested-operation claim.

## 8. Roadmap and vision

| Stage | Domain | Direction |
| --- | --- | --- |
| 1.0 | Provisioning and listing preparation | Safe, repository-driven metadata, screenshots, commerce setup, and explicit review submission. |
| Next | Media and release refinements | App previews, richer asset reuse, custom product pages, fuller readiness signals, release controls, and additional platform-specific validation. |
| Future | IAPs and subscriptions | Products, localized purchase metadata, pricing, availability, review assets, and submission. |
| Future | Customer reviews | Read/filter reviews and draft or publish owner-approved responses; treat review text as untrusted input. |
| Future | Reporting | Sales, financial, and analytics exports with explicit date ranges and sensitive-output controls. |
| Future | Performance | Aggregate metrics and diagnostics for shipped versions. |
| Future | TestFlight | Groups, testers, invitations, build assignment, and beta submission. |
| Future | Users and access | Explicit invitations, role changes, and removals with stronger authorization and audit controls. |

The long-term vision is a trustworthy App Store operations interface for agents. Expansion should reuse the same authentication, planning, transport, and audit boundaries, not grow a second ad hoc implementation for every API family.

Sources: see [Sources.md](Sources.md). Product design decisions in this document are proposals, not claims that Apple provides identical abstractions.

Current API audit: generic availability writes are conditional and disabled; pre-order writes cannot implement ordinary territory changes. See [API contract](API-Contract.md).
