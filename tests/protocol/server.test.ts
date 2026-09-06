import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { configuration } from '../../src/config.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
test('startup flags reject unknown options and require independent submission gates', async()=>{
  await assert.rejects(configuration(['--anything']),/Unknown/);
  await assert.rejects(configuration(['--allowed-root','relative']),/absolute/);
  await assert.rejects(configuration(['--allow-submission']),/requires/);
  const config=await configuration(['--allowed-root',process.cwd(),'--allow-writes','--allow-submission']);
  assert.equal(config.allowedRoots.length,1);assert.equal(config.allowSubmission,true);
});
test('SDK initialization, tool validation and packaged resources need no Apple credentials',async()=>{
  const transport=new StdioClientTransport({command:process.execPath,args:['--import','tsx','src/index.ts'],env:{PATH:process.env.PATH||''},stderr:'pipe'});
  let errors='';transport.stderr?.on('data',chunk=>{errors+=chunk.toString();});
  const client=new Client({name:'test',version:'1'});
  try {
    await client.connect(transport);
    assert.deepEqual((await client.listTools()).tools.map(tool=>tool.name),['get_capabilities','validate_repository','list_apps','get_app_store_state','export_app_store_state','prepare_app_record', 'apply_plan', 'get_operation_status']);
    assert.equal((await client.callTool({name:'get_capabilities',arguments:{}})).isError,undefined);
    assert.equal((await client.callTool({name:'get_capabilities',arguments:{unexpected:'reject'}})).isError,true);
    const resources=await client.listResources();assert.equal(resources.resources.length,10);
    for(const resource of resources.resources) assert.ok((await client.readResource({uri:resource.uri})).contents.length);
  } finally {await client.close();}
  assert.equal(errors,'');
});
test('stdout is JSON-RPC only and stdin closure terminates cleanly',async()=>{
  await new Promise<void>((resolve,reject)=>{
    const child=spawn(process.execPath,['--import','tsx','src/index.ts'],{env:{PATH:process.env.PATH||''},stdio:'pipe'});
    let output='';let errors='';
    const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Server did not shut down'));},5000);
    child.stderr.on('data',chunk=>{errors+=chunk.toString();});
    child.stdout.on('data',chunk=>{
      output+=chunk.toString();
      if(output.includes('"id":1'))child.stdin.end();
    });
    child.on('error',reject);
    child.on('close',code=>{clearTimeout(timer);try{assert.equal(code,0);assert.equal(errors,'');const lines=output.trim().split('\n').map(line=>JSON.parse(line));assert.ok(lines.length);for(const line of lines)assert.equal(line.jsonrpc,'2.0');resolve();}catch(error){reject(error);}});
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}}})+'\n');
  });
});
