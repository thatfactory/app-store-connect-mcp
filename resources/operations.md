# App Store Connect MCP

Foundation build: only offline get_capabilities is exposed. No Apple write adapter or submission action is available. Credentials are loaded only for remote operations. AppStore schema resources arrive with repository validation in Phase 02.

Configure explicit --allowed-root paths for local data access. --allow-writes and --allow-submission are independent operator gates; neither implies a reviewed operation. No repository .env is loaded. Omission means unmanaged. Never share API keys, signed URLs or review contacts through logs.
