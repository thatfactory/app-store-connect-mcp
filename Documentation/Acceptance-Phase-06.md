# Headroom localized metadata acceptance

Completed 2026-09-06 at 21:54 UTC using the owner's existing authorization. Target: app 6809208740, com.thatfactory.headroom, MAC_OS version 1.0 in PREPARE_FOR_SUBMISSION.

The caller authored and validated German, French, Japanese and Brazilian Portuguese source files in an ignored working AppStore directory. All names/subtitles fit 30 UTF-16 units; description lengths were 2463, 2648, 1160 and 2351 units, respectively. Keyword lengths were 74, 78, 76 and 82 UTF-8 bytes. The server did not generate or truncate translations.

Before mutation, the exported English listing produced a zero-operation plan. The approved scope was only appInfo/versionMetadata for de-DE, fr-FR, ja and pt-BR. Categories, shared version/review fields, screenshots, pricing, territory settings, provisioning and submission were not selected.

The first AppInfo create succeeded. Apple also initialized an empty version-localization companion, which the initial conservative engine reported as an unexpected additional change and stopped. The confirmed write was not replayed. A fresh plan used the observed German resource, and the adapter gained explicit, tested dependent handling for empty companions. Unexpected nonempty companions still require a new plan. The remaining seven operations completed and were read back successfully.

Total write requests: four AppInfo localization POSTs and four version-localization PATCHes. No duplicate creation or blind retry occurred. Both metadata families now contain all five locales. Every selected field matched the caller's source on final readback. The existing version copyright and AFTER_APPROVAL release behavior were identical before and after.

English fingerprint before and after: `78e34848fae02242770285805fe4a31dbfee53732dbfb470e2c1b4d42a9de99f`.

A second full selected-scope plan had zero operations and sent no writes. Private source text, immutable plans, redacted journals and detailed resource receipts remain under ignored `.appstore-connect-mcp/headroom`, outside Git and the npm package.

Local validation: 122 tests passed, including independent locale families, all five locales, initial/update handling, shared-field selection, secret changes/redaction, structured redacted Apple errors, and both independent and Apple-initialized companion creation. Strict typecheck/build, schema drift and clean package installation/SDK handshake passed with 67 allowlisted package files.

This proves live metadata synchronization only. Screenshot acceptance still requires genuine owner-supplied originals; pricing, broader signing helpers, submission and publication are separate phases.
