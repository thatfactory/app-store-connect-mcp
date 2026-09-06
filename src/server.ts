import {registerScreenshots} from './tools/screenshots.js';
import { registerMetadata } from './tools/metadata.js';
import { registerProvisioning } from './tools/provisioning.js';
import { PlanEngine } from './planning/engine.js';
import { registerPlanning } from './tools/planning.js';
import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDiscovery } from './tools/discovery.js';
import { schemas } from './repository/schemas.js';
import { registerRepository } from './tools/repository.js';
import { registerCapabilities } from './tools/capabilities.js';
import type { Configuration } from './config.js';
export const VERSION = '1.0.0';
export function createServer(config: Configuration): McpServer {
  const server = new McpServer({name: 'app-store-connect-mcp', version: VERSION});
  registerCapabilities(server, config);
  registerRepository(server, config);
  registerDiscovery(server, config);
  const plans=new PlanEngine(config.allowedRoots,config.allowWrites);
  registerPlanning(server,plans);
  registerProvisioning(server,config,plans);
  registerMetadata(server,config,plans);
  registerScreenshots(server,config,plans);
  for (const name of Object.keys(schemas)) {
    const uri = `appstore-connect://schemas/${name}`;
    server.registerResource(`schema-${name}`, uri, {mimeType: "application/schema+json"}, async () => ({contents: [{uri, mimeType: "application/schema+json", text: await readFile(new URL(`../resources/schemas/${name}.json`, import.meta.url), "utf8")}]}));
  }
  for (const [name, filename, mimeType] of [['capabilities', 'capabilities.json', 'application/json'], ['operations', 'operations.md', 'text/markdown']] as const) {
    const uri = `appstore-connect://${name}`;
    server.registerResource(name, uri, {mimeType, description: 'Packaged implementation and safety contract.'}, async () => ({contents: [{uri, mimeType, text: await readFile(new URL(`../resources/${filename}`, import.meta.url), 'utf8')}]}));
  }
  return server;
}
