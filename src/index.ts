#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { configuration } from './config.js';
import { createServer, VERSION } from './server.js';
import { publicError } from './errors.js';
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write('app-store-connect-mcp [--allowed-root /absolute/path] [--allow-writes] [--allow-submission]\nLocal stdio MCP. Offline capabilities and repository validation; no Apple writes implemented.\n');
    return;
  }
  if (args.length === 1 && args[0] === '--version') { process.stdout.write(`${VERSION}\n`); return; }
  const server = createServer(await configuration(args));
  const transport = new StdioServerTransport();
  let closing = false;
  const close = (): void => { if (closing) return; closing = true; void server.close().finally(() => process.stdin.destroy()); };
  process.once('SIGINT', close); process.once('SIGTERM', close); process.stdin.once('end', close);
  await server.connect(transport);
}
main().catch((error: unknown) => { process.stderr.write(`${JSON.stringify(publicError(error))}\n`); process.exitCode = 1; });
