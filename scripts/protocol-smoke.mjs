import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
export async function protocolSmoke(command, args, cwd, appRoot) {
  const transport = new StdioClientTransport({command, args, cwd, env: {PATH: process.env.PATH || ''}, stderr: 'pipe'});
  let stderr = '';
  transport.stderr?.on('data', chunk => { stderr += chunk.toString(); });
  const client = new Client({name:'package-smoke',version:'1.0.0'});
  try {
    await client.connect(transport);
    assert.deepEqual((await client.listTools()).tools.map(tool => tool.name), ['get_capabilities','validate_repository','list_apps','get_app_store_state','export_app_store_state','prepare_app_record', 'apply_plan', 'get_operation_status','get_bundle_id_state','inspect_xcode_project','plan_provisioning_changes','plan_metadata_changes','plan_screenshot_changes','plan_commerce_changes','get_provisioning_resources','plan_signing_changes','download_signing_artifact','check_release_readiness','plan_submission','submit_for_review']);
    const capabilities = await client.callTool({name:'get_capabilities',arguments:{}});
    assert.equal(capabilities.isError, undefined);
    assert.equal(capabilities.structuredContent.remoteWritesImplemented, true);
    assert.equal(capabilities.structuredContent.allowWrites, false);
    const invalid = await client.callTool({name:'get_capabilities',arguments:{unexpected:true}});
    assert.equal(invalid.isError, true);
    if (appRoot) {
      const validation = await client.callTool({name:'validate_repository',arguments:{root:appRoot,domains:['appInfo']}});
      assert.equal(validation.isError, undefined);
      assert.equal(validation.structuredContent.valid, true);
      if(process.platform==='darwin') {
        const images=await client.callTool({name:'validate_repository',arguments:{root:appRoot,domains:['screenshots'],platform:'macOS',version:'1.0'}});
        assert.equal(images.isError,undefined);assert.equal(images.structuredContent.valid,true,JSON.stringify(images.structuredContent));
      }
    }
    const resources = await client.listResources();
    assert.equal(resources.resources.length, 10);
    for (const resource of resources.resources) assert.ok((await client.readResource({uri:resource.uri})).contents[0].text.length > 0);
  } finally { await client.close(); }
  assert.equal(stderr, '');
}
