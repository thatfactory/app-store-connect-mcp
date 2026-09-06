# Read-only Headroom discovery evidence

Executed 2026-09-06 with owner-authorized existing process credentials. No production credentials, private contacts, review notes, signed URLs or raw account fixtures are included here.

- Confirmed the plan's Headroom app ID and bundle ID agree in the authenticated account.
- Enumerated versions before selecting: current MAC_OS version 1.0 is PREPARE_FOR_SUBMISSION.
- Resolved the unique PREPARE_FOR_SUBMISSION AppInfo independently.
- Both metadata families currently contain only en-US; there are no screenshot sets.
- Observed existing releaseType AFTER_APPROVAL and preserved it in export. No submission or release request was made.
- Exported eight files to a new ignored local baseline directory. Text-only validation passed (six selected inputs, two conventional terminal-newline advisories).
- English content fingerprint: `78e34848fae02242770285805fe4a31dbfee53732dbfb470e2c1b4d42a9de99f`.
- Review contacts were exported as field-specific env references. Review notes were intentionally omitted pending owner review, because existing freeform notes can contain private information.

Coverage is live read/export only. No remote mutation, translation sync, screenshot upload, commerce, provisioning or submission is live-verified by this evidence. The baseline itself stays in `.appstore-connect-mcp/exports/headroom-baseline-20260906`, excluded from Git and npm.

Automated evidence: `npm run check` passed strict typecheck, schema drift validation, 64 tests, build and a clean 45-file production-package smoke. Discovery fixtures assert GET-only behavior, correct editable/released AppInfo selection, explicit version selection, multi-page reads, mismatched identities, permission failures, independent locale families, manual bootstrap, export containment/non-overwrite, redaction and normalized text round-trip.
