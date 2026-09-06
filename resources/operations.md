# App Store Connect MCP

Discovery build: offline validation plus list_apps, get_app_store_state, export_app_store_state and prepare_app_record are exposed. Remote operations are GET-only; export writes only a fresh approved local directory. No Apple write adapter or submission action is available. Credentials are loaded only for remote operations. Eight generated AppStore JSON Schemas are exposed as resources and verified against runtime validators. Screenshot manifests and paths are checked; decoded image validation arrives in Phase 07.

Configure explicit --allowed-root paths for local data access. --allow-writes and --allow-submission are independent operator gates; neither implies a reviewed operation. No repository .env is loaded. Omission means unmanaged. Never share API keys, signed URLs or review contacts through logs.
