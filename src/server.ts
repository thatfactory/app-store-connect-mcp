import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCapabilities } from './tools/capabilities.js';
import type { Configuration } from './config.js';
export const VERSION = '1.0.0';
export function createServer(config: Configuration): McpServer {
  const server = new McpServer({name: 'app-store-connect-mcp', version: VERSION});
  registerCapabilities(server, config);
  for (const [name, filename, mimeType] of [['capabilities', 'capabilities.json', 'application/json'], ['operations', 'operations.md', 'text/markdown']] as const) {
    const uri = `appstore-connect://${name}`;
    server.registerResource(name, uri, {mimeType, description: 'Packaged implementation and safety contract.'}, async () => ({contents: [{uri, mimeType, text: await readFile(new URL(`../resources/${filename}`, import.meta.url), 'utf8')}]}));
  }
  return server;
}
