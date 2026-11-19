# External TestFlight

Start with an existing App Store Connect app whose ID and bundle ID are in `AppStore/app.json`. Set `--allowed-root` to the containing checkout. Use the exact build ID and the platform reported by its App Store Connect prerelease version. App Store Connect MCP checks both again before any write. You can use a verified build ID from Xcode Cloud MCP when its lookup supports the target.

| App or build | MCP platform | Build notes directory |
| --- | --- | --- |
| iPhone, iPad and Apple Watch | `IOS` | `iOS` |
| Native Mac | `MAC_OS` | `macOS` |
| Apple TV | `TV_OS` | `tvOS` |
| Native Apple Vision Pro | `VISION_OS` | `visionOS` |

These are the four [App Store Connect platform values](https://developer.apple.com/documentation/appstoreconnectapi/platform). Apple includes [watch-only apps under iOS](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/). An iOS build that Apple makes available on another device still uses `IOS`. App Store Connect and TestFlight determine device compatibility, group availability and installation.

## Repository inputs

```text
AppStore/
  app.json
  testflight/
    groups.json
    localizations/en-US.json
    localizations/pt-BR.json
    review.json
    review-notes.txt
    build-notes/iOS/1.0/en-US.txt
    build-notes/iOS/1.0/pt-BR.txt
    build-notes/tvOS/1.0/en-US.txt
    build-notes/tvOS/1.0/pt-BR.txt
    build-notes/macOS/1.0/en-US.txt
    build-notes/visionOS/1.0/en-US.txt
```

Each optional file is managed only when its scope is selected for planning. The stable group key identifies your policy. The exact name identifies the group in App Store Connect. Add the returned `groupId` once a group has been created or adopted to guard against name and identity drift.

```json
{
  "schemaVersion": 1,
  "groups": {
    "external-release-candidates": {
      "name": "External Release Candidates",
      "publicLink": {
        "enabled": true,
        "testerLimit": 10
      }
    }
  }
}
```

Names are compared exactly inside the verified app. Duplicate matches, internal-group collisions and pinned ID/name mismatches stop planning. The configuration plan always creates new groups with enrollment disabled. Rename groups in App Store Connect before updating their repository declarations. Omit `publicLink` to leave it unmanaged. An explicit policy sets `enabled`, with an optional tester limit between 1 and 10,000. Omit the limit to preserve Apple's current limit settings.

Each selected `localizations/<locale>.json` must contain at least one field. It can manage Apple's `description`, `feedbackEmail`, `marketingUrl`, `privacyPolicyUrl` and `tvOsPrivacyPolicy`. A public feedback address can be written as a string. To keep an address private, use `{"env":"APPSTORE_TESTFLIGHT_FEEDBACK_EMAIL"}` and supply the value in the server environment.

In `review.json`, use the existing narrow environment references for reviewer contacts and demo credentials. For example, set `"contactEmail": {"env":"APPSTORE_REVIEW_EMAIL"}`. `demoAccountRequired` takes a boolean. Put non-secret instructions in `review-notes.txt`. The review scope patches the app's existing TestFlight review record. Missing contacts, required test information and demo credentials can still block Apple review. See [Apple's test information requirements](https://developer.apple.com/help/app-store-connect/test-a-beta-version/provide-test-information/).

Build notes use the exact marketing version and platform of the Apple build. Every selected locale requires its own non-empty UTF-8 file. `validate_repository` supports `testflightGroups`, `testflightLocalizations`, `testflightReview` and `testflightBuildNotes`. For an explicit build notes validation, provide the `platform` directory name from the table, `version`, and optionally the selected `locales`. Unmanaged locales, attributes, groups and build memberships are preserved.

## Plan and execute

1. Use `get_testflight_state({root, groupKey?, builds?})` to verify the app, internal group prerequisite, exact external group and any selected builds. Pass each build as `{buildId, platform}`. Apple exposes the build's processing state, audience, external state and beta review record separately.
2. Use `plan_testflight_configuration({root, groups?, locales?, review?})` and approve the desired operations through `apply_plan` with `--allow-writes`. Pass an explicit array of group keys to create or adopt groups, an array of locales to manage beta app information or `review: true` to manage beta review details. Apple's external group creation requires an existing internal group.
3. For distribution, start the server with both `--allow-writes` and `--allow-beta-distribution`. Call `plan_testflight_distribution` with `root`, one `groupKey` and one action from the table. Approve the intended operation IDs and call `apply_testflight_distribution` with the current plan ID, exact digest, approved operation IDs and `authorization: {confirmedByHost: true}`. The plan shows the selected group, build IDs, platform, version, audience and notification scope. The apply response includes the latest verified TestFlight observations when available.

| Action | Additional arguments | Effect |
| --- | --- | --- |
| `attach` | `builds: [{buildId, platform, autoNotifyEnabled?}]`, optional `locales` | Apply selected What to Test notes and optional build-wide auto-notify before adding each missing membership. Attachment itself can advance review or testing. |
| `submit` | `build: {buildId, platform}` | Submit a previously attached build only when Apple reports `READY_FOR_BETA_SUBMISSION` and the exact build has no review record. Read after attachment and plan submission separately. |
| `notify` | `build: {buildId, platform}` | Request manual notification for the exact attached build when Apple reports approval and a waiting-to-test state with auto-notify off. This applies to all assigned testers of the build. |
| `publicLink` | | Reconcile the declared policy independently of build attachment and review. Enabling enrollment can expose any installable builds in the group. Disabling can be planned with no builds selected. |

An eligible build must belong to the verified app and selected platform, have `VALID` processing and `APP_STORE_ELIGIBLE` audience, be unexpired, and have explicit evidence of resolved export compliance. When Apple reports non-exempt encryption, the connector requires an approved declaration linked to the build. Missing identity, eligibility fields and unrecognized states stop writes. Apple controls review and applies its version and submission-rate limits. A rejected Apple write stops the approved subset. For a conflict or rate limit, check Apple's status and retry guidance and plan again after the condition clears.

`waitingForReview` reflects a pending beta state or review record. `readyForTesters` requires verified membership and Apple's `IN_BETA_TESTING` state for an eligible build. Approval alone does not establish external availability. A request to notify testers verifies the resulting external state when Apple exposes it. Device compatibility, actual installation and receipt of push notifications are separate observations.

Use `get_testflight_join_link({root, groupKey})` when you explicitly need the link. Apple may return a link before any compatible build is installable. A disabled group returns a null link. The URL is kept out of ordinary status, plan artifacts, exports and journals. See [Apple's external testing workflow](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/) and [TestFlight installation instructions](https://testflight.apple.com/#installation).

## Recovery

The engine rereads the exact resources before and after each operation. An unexpected remote or local change can stop an approved subset. If a write is uncertain, poll `get_operation_status` with the original plan ID and confirm the exact resource state before approving further work. A consumed plan cannot execute again. In particular, absence immediately after a timeout does not prove Apple ignored the POST. Wait for readback or establish the outcome with Apple before planning another POST for the same effect. See [plans, approval and recovery](Plan-and-Apply.md).
