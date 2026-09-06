import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,realpath,rm,writeFile,readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ApiClient } from '../../src/api/client.js';
import { PlanEngine,type Approval } from '../../src/planning/engine.js';
import { ProvisioningAdapter } from '../../src/domains/provisioning.js';
import type { Operation } from '../../src/planning/model.js';
async function fixture(t:test.TestContext,existing=false){
  const checkout=await realpath(await mkdtemp(path.join(os.tmpdir(),'asc-provision-')));t.after(()=>rm(checkout,{recursive:true,force:true}));const root=path.join(checkout,'AppStore');await mkdir(root);
  const app={schemaVersion:1,app:{bundleId:'com.test.app',primaryLocale:'en-US'},platforms:['MAC_OS'],localizations:['en-US']};
  const config={schemaVersion:1,primaryBundleId:{name:'Test',platform:'MAC_OS',capabilities:[{capabilityType:'GAME_CENTER'}] as unknown[]},additionalBundleIds:[{name:'Extension',platform:'MAC_OS',identifier:'com.test.app.ext',capabilities:[]}]};
  const save=async()=>{await writeFile(path.join(root,'app.json'),JSON.stringify(app));await writeFile(path.join(root,'provisioning.json'),JSON.stringify(config));};await save();
  const bundle={id:'BUNDLE1',type:'bundleIds',attributes:{identifier:'com.test.app',name:'Test',platform:'MAC_OS'}};
  const state={bundles:existing?[bundle]:[],caps:[] as {id:string;type:string;attributes:Record<string,unknown>}[],unknown:false,forbidden:false,duplicate:false};const calls:{path:string;method:string;body?:any}[]=[];
  const api=new ApiClient({token:()=> 'test-token'},{readRetries:0,fetch:async(input,options)=>{
    const url=new URL(String(input));const method=options?.method??'GET';const body=options?.body?JSON.parse(String(options.body)):undefined;calls.push({path:url.pathname,method,body});
    if(state.forbidden)return new Response('{}',{status:403});
    if(method==='GET')return Response.json({data:url.pathname==='/v1/bundleIds'?(state.duplicate?[bundle,bundle]:state.bundles):state.caps});
    if(method==='POST'&&url.pathname==='/v1/bundleIds')state.bundles.push({...bundle,attributes:body.data.attributes});
    else if(method==='POST'&&url.pathname==='/v1/bundleIdCapabilities')state.caps.push({id:'BUNDLE1_CAP_'+(state.caps.length+1),type:'bundleIdCapabilities',attributes:body.data.attributes});
    else if(method==='PATCH'&&url.pathname.startsWith('/v1/bundleIdCapabilities/'))state.caps.find(c=>c.id===body.data.id)!.attributes=body.data.attributes;
    else throw new Error('Unexpected endpoint');
    if(state.unknown)throw new Error('socket lost after commit');return Response.json({data:{}},{status:201});
  }});
  const adapter=new ProvisioningAdapter({root,identifiers:['com.test.app']},[checkout],api,()=> 'account1');const engine=new PlanEngine([checkout],true);
  const plan=async()=>{const p=await engine.create(adapter);const approval:Approval={planId:p.planId as string,digest:p.digest as string,operationIds:(p.operations as Operation[]).map(op=>op.id),authorization:{confirmedByHost:true}};return {p,approval};};
  return {root,checkout,config,app,save,state,calls,adapter,engine,plan,bundle};
}
test('register exact bundle then capability; second plan is no-op and extension is not included',async t=>{
  const f=await fixture(t);const {approval,p}=await f.plan();assert.equal((p.operations as Operation[]).length,2);assert.ok((p.operations as Operation[])[1]?.dependencies.length);
  assert.equal((await f.engine.apply(approval)).state,'complete');assert.equal((await f.plan()).p.noOp,true);
  const writes=f.calls.filter(c=>c.method!=='GET');assert.deepEqual(writes.map(c=>c.path),['/v1/bundleIds','/v1/bundleIdCapabilities']);
  assert.equal(writes[0]?.body.data.attributes.platform,'MAC_OS');assert.equal(writes[1]?.body.data.relationships.bundleId.data.id,'BUNDLE1');
  assert.equal(f.state.bundles.length,1);assert.equal(f.state.bundles[0]?.attributes.identifier,'com.test.app');
});
test('empty capability list preserves existing capability and bundle name',async t=>{
  const f=await fixture(t,true);f.config.primaryBundleId.capabilities=[];f.config.primaryBundleId.name='different desired label';await f.save();
  f.state.caps.push({id:'OTHER',type:'bundleIdCapabilities',attributes:{capabilityType:'PUSH_NOTIFICATIONS'}});
  const {p,approval}=await f.plan();assert.equal(p.noOp,true);await f.engine.apply(approval);assert.equal(f.calls.filter(c=>c.method!=='GET').length,0);
});
test('timeout after capability creation reconciles before any retry',async t=>{
  const f=await fixture(t,true);f.state.unknown=true;const {approval}=await f.plan();const journal=await f.engine.apply(approval);assert.equal(journal.state,'complete');assert.equal(journal.operations[0]?.state,'reconciled');assert.equal(f.calls.filter(c=>c.method==='POST').length,1);assert.equal((await f.plan()).p.noOp,true);
});
test('duplicate, incompatible platform and permission failures produce no writes',async t=>{
  const f=await fixture(t,true);f.state.duplicate=true;await assert.rejects(f.plan(),/multiple exact/);f.state.duplicate=false;
  f.bundle.attributes.platform='IOS';await assert.rejects(f.plan(),/platform differs/);f.bundle.attributes.platform='MAC_OS';f.state.forbidden=true;await assert.rejects(f.plan(),/HTTP 403/);assert.equal(f.calls.filter(c=>c.method!=='GET').length,0);
});
test('complex capability dependencies fail with manual setup instead of generic toggles',async t=>{
  const f=await fixture(t);f.config.primaryBundleId.capabilities=[{capabilityType:'APP_GROUPS'}];await f.save();await assert.rejects(f.plan(),/separately verified portal setup/);assert.equal(f.calls.length,0);
});
test('explicit Data Protection setting update preserves unrelated capabilities and uses PATCH',async t=>{
  const f=await fixture(t,true);f.config.primaryBundleId.platform='IOS';f.bundle.attributes.platform='IOS';f.app.platforms=['IOS'];
  const settings=[{key:'DATA_PROTECTION_PERMISSION_LEVEL',options:['COMPLETE_PROTECTION','PROTECTED_UNLESS_OPEN','PROTECTED_UNTIL_FIRST_USER_AUTH'].map(key=>({key,enabled:key==='COMPLETE_PROTECTION'}))}];
  f.config.primaryBundleId.capabilities=[{capabilityType:'DATA_PROTECTION',settings}];await f.save();
  f.state.caps.push({id:'DP',type:'bundleIdCapabilities',attributes:{capabilityType:'DATA_PROTECTION',settings:[{key:settings[0]!.key,options:settings[0]!.options.map(o=>({...o,enabled:o.key==='PROTECTED_UNTIL_FIRST_USER_AUTH'}))}]}},{id:'KEEP',type:'bundleIdCapabilities',attributes:{capabilityType:'GAME_CENTER'}});
  const {p,approval}=await f.plan();assert.equal((p.operations as Operation[])[0]?.kind,'update');assert.equal((await f.engine.apply(approval)).state,'complete');
  assert.deepEqual(f.calls.filter(c=>c.method!=='GET').map(c=>c.method),['PATCH']);assert.ok(f.state.caps.some(c=>c.id==='KEEP'));assert.equal((await f.plan()).p.noOp,true);
});
test('source change and conflicting creation invalidate the plan without POST',async t=>{
  const f=await fixture(t);const {approval}=await f.plan();f.state.bundles.push(f.bundle);await assert.rejects(f.engine.apply(approval),/remote state changed/);assert.equal(f.calls.filter(c=>c.method!=='GET').length,0);
  const next=await f.plan();f.config.primaryBundleId.capabilities=[];await f.save();await assert.rejects(f.engine.apply(next.approval),/Local inputs/);
});
test('plan changes never rewrite repository source',async t=>{
  const f=await fixture(t,true);const before=await readFile(path.join(f.root,'provisioning.json'));const {approval}=await f.plan();await f.engine.apply(approval);assert.deepEqual(await readFile(path.join(f.root,'provisioning.json')),before);
});
