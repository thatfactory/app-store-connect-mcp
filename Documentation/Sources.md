# Sources and evidence

Retrieved 2026-09-06. Apple documentation and the pinned 4.4.1 OpenAPI specification are primary sources. The initial attachments' S/R labels were not accompanied by their bibliography; the links below replace that missing bibliography, without claiming reconstruction of its numbering.

- [API and official schema download](https://developer.apple.com/documentation/appstoreconnectapi/): payload source; exact checksum in contracts/provenance.json.
- [Apps](https://developer.apple.com/documentation/appstoreconnectapi/apps): manual initial app creation.
- [App information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information): app-wide localized fields.
- [Version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information): text limits and review information.
- [Editable properties](https://developer.apple.com/help/app-store-connect/reference/app-information/required-localizable-and-editable-properties): field/state restrictions.
- [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications): display dimensions.
- [Asset transfer](https://developer.apple.com/documentation/appstoreconnectapi/uploading-assets-to-app-store-connect): byte ranges, MD5 and processing lifecycle.
- [Store localizations](https://developer.apple.com/help/app-store-connect/reference/app-information/app-store-localizations/): storefront coverage.
- [Locale shortcodes](https://developer.apple.com/documentation/appstoreconnectapi/betabuildlocalization/attributes-data.dictionary): identifier table; confirm newly added storefront codes before extending support.
- [Xcode regions](https://developer.apple.com/documentation/xcode/choosing-localization-regions-and-scripts): binary locale identifiers are separate from store identifiers.

Specification excerpts establish structural contracts only. Account role, editable state, upload destination policy and regional eligibility require their own evidence. No live API calls or writes occurred during Phase 00.

- [Availability collection](https://developer.apple.com/documentation/appstoreconnectapi/app-availability), [pre-order creation](https://developer.apple.com/documentation/appstoreconnectapi/post-v2-appavailabilities), [pre-order territories](https://developer.apple.com/documentation/appstoreconnectapi/patch-v1-territoryavailabilities-_id_): documented write scope is pre-orders; generic territory writes are not established.
