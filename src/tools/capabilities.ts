import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Configuration } from '../config.js';
export function registerCapabilities(server: McpServer, config: Configuration): void {
  server.registerTool('get_capabilities', {
    description: 'Report implemented features and configured safety gates without credentials or network access.',
    inputSchema: z.object({}).strict(),
    annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
  }, async (_args, extra) => {
    if (extra.signal.aborted) return {isError: true, content: [{type: 'text', text: 'Request cancelled.'}]};
    const result = {schemaVersion: 1, stage: 'repositoryValidation', tools: ['get_capabilities', 'validate_repository'], remoteWritesImplemented: false,
      submissionImplemented: false, allowedRootCount: config.allowedRoots.length, allowWrites: config.allowWrites, allowSubmission: config.allowSubmission};
    return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
  });
}
