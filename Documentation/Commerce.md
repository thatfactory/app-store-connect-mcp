# App price and availability

`plan_commerce_changes` reads current app-wide pricing, the paginated territory catalog, and current territory availability. The caller selects `price`, `availability`, or both. A missing field is unmanaged. Locale and version plans cannot change commerce.

Price intent uses an exact three-letter territory ID and either `free` or a two-decimal customer price. The server never interprets locale codes as territories, converts through binary floating point, guesses tier IDs, or chooses a nearby price. It reads the app's current price-point catalog for the requested base territory, verifies each point belongs to the exact app and territory, and requires exactly one normalized decimal match. A zero amount is represented by `free`.

An approved price operation is app-wide and immediate. Its plan shows the old schedule, exact new base customer price, base currency, affected current territory catalog, and schedule impact. The v1 writer only replaces a simple current schedule: one open-ended base manual price with no overrides or future-dated entries. Complex or ambiguous schedules stop for manual preservation. The request uses Apple's documented inline `${newprice-0}` relationship identity and the selected app price-point ID. An uncertain POST is reconciled through a fresh complete read and is never replayed.

Availability is read and compared only. `all` expands to the complete current paginated territory catalog at plan time; no country count is hard-coded. The summary separately lists additions, removals, future-territory behavior, missing live entries, and Apple's content-status codes. A difference sets `manualActionRequired`. Generic availability mutation is disabled because the audited public write routes are pre-order-specific. The server does not use those routes for ordinary distribution, and it does not infer legal or agreement decisions.

Configured territories do not prove that an app is effectively for sale. Apple's content statuses remain visible so readiness can report restrictions independently from requested distribution.

Read-only verification covered a simple free schedule, automatically equalized prices, configured territories, and future-territory behavior without making writes. Configured distribution does not prove effective availability; Apple can simultaneously report blocking availability states.
