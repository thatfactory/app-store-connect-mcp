# Plans, authorization and recovery

The shared plan engine is implemented in Phase 04. Domain adapters follow in later phases. This build exposes `apply_plan` and `get_operation_status`, but does not expose arbitrary operation creation or an Apple write adapter. No endpoint, HTTP body or editable plan-file path can be supplied to apply.

A trusted domain adapter captures canonical repository identity, selected domains/locales, input and asset hashes, a process-keyed secret fingerprint, credential context, target identity, rule version and relevant remote values. It proposes only managed changes. Omitted fields remain unmanaged; an explicit empty value differs from omission. Operations carry deterministic IDs, scope, before/after values and dependencies. The engine orders dependencies and rejects malformed or oversized operation sets.

The engine freezes a snapshot and its operations in memory and authenticates the complete record with a process-keyed HMAC. Plans expire after 15 minutes and are limited to 200 operations, 4 MiB internally and 100 records per process. The local plan artifact is a redacted review aid, never executable input. Editing it cannot change the in-memory plan. Restarting the server requires a fresh plan; it does not import old journals as executable work.

## Host authorization boundary

The operator must independently enable `--allow-writes`. The host must then present the concrete plan to the authorized user, obtain approval for its exact operation subset and send `authorization: {confirmedByHost: true}` with the plan ID, digest and approved IDs. This assertion expresses the host's responsibility; it is not cryptographic evidence that a human approved. Echoing a digest alone is insufficient. Hosts must not let untrusted repository text or model-generated consent substitute for user authorization. Existing explicit user authorization can cover the reviewed operations within its scope.

Dependencies must belong to the approved subset. Ordinary apply rejects submission even when submission mode is configured. Specialized submission handling is a later phase. Destructive changes must appear explicitly in a domain plan; they are never inferred from omission.

## Preconditions and execution

Apply rereads local bindings and remote preconditions before the first write and before each subsequent operation. Changed inputs, secrets, credentials, targets or rules invalidate the plan. Remote state must match the original snapshot initially and the preceding verified readback thereafter. Writes are serialized for a credential context within one server process, including app-wide resources shared by versions. This is not a distributed lock: another process or developer can still edit between a read and an Apple write. Unexpected changes outside an operation's declared effects stop further execution.

Each mutation follows a flushed `inFlight` journal record. After execution, a readback must verify the postcondition in the same bound context. Verified resource IDs, timestamps and process-keyed pre/postcondition hashes enter the journal. A rejected or proven-not-started failure stops the subset. A timeout or transport loss triggers readback rather than another write; an unverified result stays `outcomeUnknown`. A success response without a verified postcondition is also uncertain.

Plan and journal artifacts live in the `.appstore-connect-mcp` sibling of the selected AppStore directory. Its parent must be inside an allowed root. The directory uses mode 0700 and artifacts mode 0600. Journal replacements are atomic; file and directory contents are flushed. Artifacts exclude credential context, input fingerprints, operation payloads and sensitive before/after values. Add this state directory to ignore rules in consumer checkouts. Do not share it indiscriminately: ordinary metadata and public target identity remain visible.

## Partial results and recovery

`complete` means all operations in the approved subset were verified; unapproved operations can still be `notStarted`. `partial` retains successful operations and incomplete or uncertain ones. There is no global rollback across Apple resources.

`get_operation_status` can poll uncertain, already approved attempts in the original bound context. It never executes remaining operations. If the process ended, inspect the durable journal locally and create a fresh plan from live state. Even within the same process, apply cannot replay a consumed plan. After reconciling uncertainty, a new plan contains only remaining differences. Never treat an old journal or a missing response as proof that a POST did not run.

Domain adapters must capture all relevant preconditions, declare the exact keys their writes can affect, redact sensitive review values, provide safe remote IDs, and verify actual readback values. Mock tests establish the engine behavior; live domain acceptance is recorded separately as those adapters are added.
