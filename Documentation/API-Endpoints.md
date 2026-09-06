# Pinned endpoint inventory

Generated from Apple OpenAPI 4.4.1. Payload definitions, required fields, relationships, nullable semantics, filters and pagination parameters are in [the focused schema](../contracts/apple-openapi.json). Schema presence establishes payload shape, not account permission or editable state. Every write remains conditional on the domain guards in API-Contract.md and its phase tests. No operation is live-verified.

| Method | Path | Request schema | Responses |
| --- | --- | --- | --- |
| POST | `/v2/appAvailabilities` | AppAvailabilityV2CreateRequest | 201, 400, 401, 403, 409, 422, 429 |
| GET | `/v2/appAvailabilities/{id}` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/appCategories` | None | 200, 400, 401, 403, 429 |
| GET | `/v1/appCategories/{id}` | None | 200, 400, 401, 403, 404, 429 |
| POST | `/v1/appInfoLocalizations` | AppInfoLocalizationCreateRequest | 201, 400, 401, 403, 409, 422, 429 |
| GET | `/v1/appInfoLocalizations/{id}` | None | 200, 400, 401, 403, 404, 429 |
| PATCH | `/v1/appInfoLocalizations/{id}` | AppInfoLocalizationUpdateRequest | 200, 400, 401, 403, 404, 409, 422, 429 |
| DELETE | `/v1/appInfoLocalizations/{id}` | None | 204, 400, 401, 403, 404, 429 |
| GET | `/v1/appInfos/{id}` | None | 200, 400, 401, 403, 404, 429 |
| PATCH | `/v1/appInfos/{id}` | AppInfoUpdateRequest | 200, 400, 401, 403, 404, 409, 422, 429 |
| GET | `/v3/appPricePoints/{id}` | None | 200, 400, 401, 403, 404, 429 |
| POST | `/v1/appPriceSchedules` | AppPriceScheduleCreateRequest | 201, 400, 401, 403, 409, 422, 429 |
| GET | `/v1/appPriceSchedules/{id}` | None | 200, 400, 401, 403, 404, 429 |
| POST | `/v1/appScreenshotSets` | AppScreenshotSetCreateRequest | 201, 400, 401, 403, 409, 422, 429 |
| GET | `/v1/appScreenshotSets/{id}` | None | 200, 400, 401, 403, 404, 429 |
| DELETE | `/v1/appScreenshotSets/{id}` | None | 204, 400, 401, 403, 404, 429 |
| POST | `/v1/appScreenshots` | AppScreenshotCreateRequest | 201, 400, 401, 403, 409, 422, 429 |
| GET | `/v1/appScreenshots/{id}` | None | 200, 400, 401, 403, 404, 429 |
| PATCH | `/v1/appScreenshots/{id}` | AppScreenshotUpdateRequest | 200, 400, 401, 403, 404, 409, 422, 429 |
| DELETE | `/v1/appScreenshots/{id}` | None | 204, 400, 401, 403, 404, 429 |
| POST | `/v1/appStoreReviewDetails` | AppStoreReviewDetailCreateRequest | 201, 400, 401, 403, 409, 422, 429 |
| GET | `/v1/appStoreReviewDetails/{id}` | None | 200, 400, 401, 403, 404, 429 |
| PATCH | `/v1/appStoreReviewDetails/{id}` | AppStoreReviewDetailUpdateRequest | 200, 400, 401, 403, 404, 409, 422, 429 |
| POST | `/v1/appStoreVersionLocalizations` | AppStoreVersionLocalizationCreateRequest | 201, 400, 401, 403, 409, 422, 429 |
| GET | `/v1/appStoreVersionLocalizations/{id}` | None | 200, 400, 401, 403, 404, 429 |
| PATCH | `/v1/appStoreVersionLocalizations/{id}` | AppStoreVersionLocalizationUpdateRequest | 200, 400, 401, 403, 404, 409, 422, 429 |
| DELETE | `/v1/appStoreVersionLocalizations/{id}` | None | 204, 400, 401, 403, 404, 429 |
| POST | `/v1/appStoreVersions` | AppStoreVersionCreateRequest | 201, 400, 401, 403, 409, 422, 429 |
| GET | `/v1/appStoreVersions/{id}` | None | 200, 400, 401, 403, 404, 429 |
| PATCH | `/v1/appStoreVersions/{id}` | AppStoreVersionUpdateRequest | 200, 400, 401, 403, 404, 409, 422, 429 |
| DELETE | `/v1/appStoreVersions/{id}` | None | 204, 400, 401, 403, 404, 429 |
| GET | `/v1/apps` | None | 200, 400, 401, 403, 429 |
| GET | `/v1/apps/{id}` | None | 200, 400, 401, 403, 404, 429 |
| PATCH | `/v1/apps/{id}` | AppUpdateRequest | 200, 400, 401, 403, 404, 409, 422, 429 |
| GET | `/v1/builds` | None | 200, 400, 401, 403, 429 |
| GET | `/v1/builds/{id}` | None | 200, 400, 401, 403, 404, 429 |
| PATCH | `/v1/builds/{id}` | BuildUpdateRequest | 200, 400, 401, 403, 404, 409, 422, 429 |
| POST | `/v1/bundleIdCapabilities` | BundleIdCapabilityCreateRequest | 201, 400, 401, 403, 409, 422, 429 |
| PATCH | `/v1/bundleIdCapabilities/{id}` | BundleIdCapabilityUpdateRequest | 200, 400, 401, 403, 404, 409, 422, 429 |
| DELETE | `/v1/bundleIdCapabilities/{id}` | None | 204, 400, 401, 403, 404, 429 |
| GET | `/v1/bundleIds` | None | 200, 400, 401, 403, 429 |
| POST | `/v1/bundleIds` | BundleIdCreateRequest | 201, 400, 401, 403, 409, 422, 429 |
| GET | `/v1/bundleIds/{id}` | None | 200, 400, 401, 403, 404, 429 |
| PATCH | `/v1/bundleIds/{id}` | BundleIdUpdateRequest | 200, 400, 401, 403, 404, 409, 422, 429 |
| DELETE | `/v1/bundleIds/{id}` | None | 204, 400, 401, 403, 404, 429 |
| GET | `/v1/certificates` | None | 200, 400, 401, 403, 429 |
| POST | `/v1/certificates` | CertificateCreateRequest | 201, 400, 401, 403, 409, 422, 429 |
| GET | `/v1/certificates/{id}` | None | 200, 400, 401, 403, 404, 429 |
| PATCH | `/v1/certificates/{id}` | CertificateUpdateRequest | 200, 400, 401, 403, 404, 409, 422, 429 |
| DELETE | `/v1/certificates/{id}` | None | 204, 400, 401, 403, 404, 429 |
| GET | `/v1/devices` | None | 200, 400, 401, 403, 429 |
| POST | `/v1/devices` | DeviceCreateRequest | 201, 400, 401, 403, 409, 422, 429 |
| GET | `/v1/devices/{id}` | None | 200, 400, 401, 403, 404, 429 |
| PATCH | `/v1/devices/{id}` | DeviceUpdateRequest | 200, 400, 401, 403, 404, 409, 422, 429 |
| GET | `/v1/preReleaseVersions` | None | 200, 400, 401, 403, 429 |
| GET | `/v1/preReleaseVersions/{id}` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/profiles` | None | 200, 400, 401, 403, 429 |
| POST | `/v1/profiles` | ProfileCreateRequest | 201, 400, 401, 403, 409, 422, 429 |
| GET | `/v1/profiles/{id}` | None | 200, 400, 401, 403, 404, 429 |
| DELETE | `/v1/profiles/{id}` | None | 204, 400, 401, 403, 404, 429 |
| POST | `/v1/reviewSubmissionItems` | ReviewSubmissionItemCreateRequest | 201, 400, 401, 403, 409, 422, 429 |
| PATCH | `/v1/reviewSubmissionItems/{id}` | ReviewSubmissionItemUpdateRequest | 200, 400, 401, 403, 404, 409, 422, 429 |
| DELETE | `/v1/reviewSubmissionItems/{id}` | None | 204, 400, 401, 403, 404, 429 |
| GET | `/v1/reviewSubmissions` | None | 200, 400, 401, 403, 429 |
| POST | `/v1/reviewSubmissions` | ReviewSubmissionCreateRequest | 201, 400, 401, 403, 409, 422, 429 |
| GET | `/v1/reviewSubmissions/{id}` | None | 200, 400, 401, 403, 404, 429 |
| PATCH | `/v1/reviewSubmissions/{id}` | ReviewSubmissionUpdateRequest | 200, 400, 401, 403, 404, 409, 422, 429 |
| GET | `/v1/territories` | None | 200, 400, 401, 403, 429 |
| PATCH | `/v1/territoryAvailabilities/{id}` | TerritoryAvailabilityUpdateRequest | 200, 400, 401, 403, 404, 409, 422, 429 |
| GET | `/v2/appAvailabilities/{id}/relationships/territoryAvailabilities` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v2/appAvailabilities/{id}/territoryAvailabilities` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/appInfos/{id}/relationships/appInfoLocalizations` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/appInfos/{id}/appInfoLocalizations` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/appPriceSchedules/{id}/relationships/automaticPrices` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/appPriceSchedules/{id}/automaticPrices` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/appPriceSchedules/{id}/relationships/baseTerritory` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/appPriceSchedules/{id}/baseTerritory` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/appPriceSchedules/{id}/relationships/manualPrices` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/appPriceSchedules/{id}/manualPrices` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/appScreenshotSets/{id}/relationships/appScreenshots` | None | 200, 400, 401, 403, 404, 429 |
| PATCH | `/v1/appScreenshotSets/{id}/relationships/appScreenshots` | AppScreenshotSetAppScreenshotsLinkagesRequest | 204, 400, 401, 403, 404, 409, 422, 429 |
| GET | `/v1/appScreenshotSets/{id}/appScreenshots` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/appStoreVersionLocalizations/{id}/relationships/appScreenshotSets` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/appStoreVersionLocalizations/{id}/appScreenshotSets` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/appStoreVersions/{id}/relationships/appStoreReviewDetail` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/appStoreVersions/{id}/appStoreReviewDetail` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/appStoreVersions/{id}/relationships/appStoreVersionLocalizations` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/appStoreVersions/{id}/appStoreVersionLocalizations` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/appStoreVersions/{id}/relationships/build` | None | 200, 400, 401, 403, 404, 429 |
| PATCH | `/v1/appStoreVersions/{id}/relationships/build` | AppStoreVersionBuildLinkageRequest | 204, 400, 401, 403, 404, 409, 422, 429 |
| GET | `/v1/appStoreVersions/{id}/build` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/apps/{id}/relationships/appAvailabilityV2` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/apps/{id}/appAvailabilityV2` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/apps/{id}/relationships/appInfos` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/apps/{id}/appInfos` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/apps/{id}/relationships/appPricePoints` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/apps/{id}/appPricePoints` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/apps/{id}/relationships/appPriceSchedule` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/apps/{id}/appPriceSchedule` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/apps/{id}/relationships/appStoreVersions` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/apps/{id}/appStoreVersions` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/apps/{id}/relationships/builds` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/apps/{id}/builds` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/apps/{id}/relationships/preReleaseVersions` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/apps/{id}/preReleaseVersions` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/apps/{id}/relationships/reviewSubmissions` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/apps/{id}/reviewSubmissions` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/builds/{id}/relationships/app` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/builds/{id}/app` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/builds/{id}/relationships/appStoreVersion` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/builds/{id}/appStoreVersion` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/builds/{id}/relationships/preReleaseVersion` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/builds/{id}/preReleaseVersion` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/bundleIds/{id}/relationships/app` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/bundleIds/{id}/app` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/bundleIds/{id}/relationships/bundleIdCapabilities` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/bundleIds/{id}/bundleIdCapabilities` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/bundleIds/{id}/relationships/profiles` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/bundleIds/{id}/profiles` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/preReleaseVersions/{id}/relationships/app` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/preReleaseVersions/{id}/app` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/preReleaseVersions/{id}/relationships/builds` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/preReleaseVersions/{id}/builds` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/profiles/{id}/relationships/bundleId` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/profiles/{id}/bundleId` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/profiles/{id}/relationships/certificates` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/profiles/{id}/certificates` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/profiles/{id}/relationships/devices` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/profiles/{id}/devices` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/reviewSubmissions/{id}/relationships/items` | None | 200, 400, 401, 403, 404, 429 |
| GET | `/v1/reviewSubmissions/{id}/items` | None | 200, 400, 401, 403, 404, 429 |
