# Headroom live acceptance

Read/export and four-locale metadata synchronization have passed live acceptance; see Acceptance-Phase-03.md and Acceptance-Phase-06.md. Screenshot acceptance remains pending genuine originals. Use only owner-authorized credentials through the supported environment configuration. Do not collect browser credentials.

1. Read app 6809208740 and verify com.thatfactory.headroom. Enumerate the actual platform versions and select the intended editable macOS version explicitly.
2. Export existing text to a fresh approved directory. Preserve the en-US fingerprint and all translated values as the migration baseline.
3. Let the caller author and review de-DE, fr-FR, ja and pt-BR files. Do not overwrite owner translations with templates.
4. Validate and plan only appInfo/versionMetadata for those four locales. Review and approve exact operations, then apply and read back each field. Verify en-US unchanged and a second plan with zero writes.
5. Supply genuine localized screenshots for all five locales. Review explicit membership/order changes, process uploads, read back and verify an unchanged sync uploads nothing. Missing originals are a pending live gate, not permission to synthesize placeholders.
6. Verify commerce only when selected; preserve the existing free setup absent an approved difference. Do not modify signing resources or submit the app merely for testing.
7. Store sanitized counts, fingerprints and test dates outside the npm package. Record mock, schema and live coverage separately. Owner-controlled publication is a separate release step.
