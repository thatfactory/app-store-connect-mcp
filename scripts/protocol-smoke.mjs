import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
export async function protocolSmoke(command, args, cwd) {
  const transport = new StdioClientTransport({command, args, cwd, env: {PATH: process.env.PATH || ''}, stderr: 'pipe'});
  let stderr = '';
  transport.stderr?.on('data', chunk => { stderr += chunk.toString(); });
  const client = new Client({name:'package-smoke',version:'1.0.0'});
  try {
    await client.connect(transport);
    assert.deepEqual((await client.listTools()).tools.map(tool => tool.name), ['get_capabilities']);
    const capabilities = await client.callTool({name:'get_capabilities',arguments:{}});
    assert.equal(capabilities.isError, undefined);
    assert.equal(capabilities.structuredContent.remoteWritesImplemented, false);
    const invalid = await client.callTool({name:'get_capabilities',arguments:{unexpected:true}});
    assert.equal(invalid.isError, true);
    const resources = await client.listResources();
    assert.equal(resources.resources.length, 2);
    for (const resource of resources.resources) assert.ok((await client.readResource({uri:resource.uri})).contents[0].text.length > 0);
  } finally { await client.close(); }
  assert.equal(stderr, '');
}
