import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,realpath,rm,readFile,writeFile,stat,symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PlanEngine,type Approval } from '../../src/planning/engine.js';
import { diffManaged,canonical,type Snapshot,type Operation,type Adapter,type Json } from '../../src/planning/model.js';
import { AppStoreError } from '../../src/errors.js';
async function fixture(t:test.TestContext,allowWrites=true){
  const checkout=await realpath(await mkdtemp(path.join(os.tmpdir(),'asc-plan-')));t.after(()=>rm(checkout,{recursive:true,force:true}));
  const root=path.join(checkout,'AppStore');await mkdir(root);
  let time=Date.now();const engine=new PlanEngine([checkout],allowWrites,()=>time);
  const snapshot:Snapshot={root,target:{appStoreId:'123',bundleId:'com.test.app',version:'1.0'},credentialContext:'account-A',inputs:{metadata:'hash-A'},secretFingerprint:'secret-hmac-A',rulesVersion:'1',remote:{'en-US':'old','de-DE':'old',unmanaged:'keep'}};
  const desired:Record<string,Json>={'en-US':'new','de-DE':'neu'};const writes:string[]=[];
  const adapter:Adapter={domain:'metadata',capture:async()=>structuredClone(snapshot),propose:s=>diffManaged('metadata',desired,s.remote,'locales'),execute:async op=>{writes.push(op.key);snapshot.remote[op.key]=op.after!;},verify:(op,s)=>canonical(s.remote[op.key])===canonical(op.after),remoteIds:()=>['remote-123']};
  const create=async()=>{const p=await engine.create(adapter);return {p,approval:{planId:p.planId as string,digest:p.digest as string,operationIds:(p.operations as Operation[]).map(op=>op.id),authorization:{confirmedByHost:true}} satisfies Approval};};
  return {checkout,root,engine,snapshot,desired,writes,adapter,create,advance:()=>{time+=900_000;}};
}
function code(expected:string){return (error:unknown)=>error instanceof AppStoreError&&error.code===expected;}
test('managed diff preserves omission, explicit clearing, deterministic IDs and no-op',()=>{
  assert.deepEqual(diffManaged('a',{name:'same'},{name:'same',other:'keep'},'x'),[]);
  const ops=diffManaged('a',{name:''},{name:'old'},'x');assert.equal(ops[0]?.after,'');
  assert.equal(ops[0]?.id,diffManaged('a',{name:'new'},{},'x')[0]?.id);
  assert.notEqual(ops[0]?.id,diffManaged('a',{name:'new'},{},'other-scope')[0]?.id);
});
test('approved updates are verified, journaled with IDs, and second plan is no-op',async t=>{
  const f=await fixture(t);const {p,approval}=await f.create();const journal=await f.engine.apply(approval);
  assert.equal(journal.state,'complete');assert.deepEqual(f.writes,['de-DE','en-US']);assert.equal(f.snapshot.remote.unmanaged,'keep');
  assert.ok(journal.operations.every(op=>op.state==='confirmed'&&op.beforeHash&&op.afterHash&&op.remoteIds?.[0]==='remote-123'));
  assert.equal((await f.create()).p.noOp,true);await assert.rejects(f.engine.apply(approval),code('planConsumed'));
  assert.equal((await stat(p.planPath as string)).mode&0o777,0o600);
  assert.equal((await stat(path.dirname(p.planPath as string))).mode&0o777,0o700);
});
for(const field of ['inputs','credentialContext','target','secretFingerprint','rulesVersion','remote'] as const){
  test(`changed ${field} rejects approval before any write`,async t=>{
    const f=await fixture(t);const {approval}=await f.create();
    if(field==='inputs')f.snapshot.inputs.metadata='changed';else if(field==='target')f.snapshot.target.version='2';else if(field==='remote')f.snapshot.remote['en-US']='other editor';else f.snapshot[field]='changed';
    await assert.rejects(f.engine.apply(approval),code('stalePlan'));assert.equal(f.writes.length,0);
  });
}
test('digest, expiry, host assertion, read-only and arbitrary operation IDs fail closed',async t=>{
  const f=await fixture(t);const {approval}=await f.create();
  await assert.rejects(f.engine.apply({...approval,digest:'0'.repeat(64)}),code('stalePlan'));
  await assert.rejects(f.engine.apply({...approval,authorization:{confirmedByHost:false} as never}),code('approvalRequired'));
  await assert.rejects(f.engine.apply({...approval,operationIds:['injected-endpoint']}),code('invalidApproval'));
  await assert.rejects(f.engine.apply({...approval,operationIds:[approval.operationIds[0]!,approval.operationIds[0]!]}),code('invalidApproval'));
  f.advance();await assert.rejects(f.engine.apply(approval),code('stalePlan'));assert.equal(f.writes.length,0);
  const ro=await fixture(t,false);await assert.rejects(ro.engine.apply((await ro.create()).approval),code('readOnly'));assert.equal(ro.writes.length,0);
});
test('immutable memory plan ignores a tampered local artifact and caller edits',async t=>{
  const f=await fixture(t);const {p,approval}=await f.create();(p.operations as Operation[])[0]!.after='injected';
  await writeFile(p.planPath as string,JSON.stringify({endpoint:'/evil',after:'injected'}));
  await writeFile((p.planPath as string).replace('.plan.json','.journal.json'),JSON.stringify({state:'complete'}));
  assert.equal((await f.engine.status(approval.planId)).state,'planned');
  await f.engine.apply(approval);assert.equal(f.snapshot.remote['de-DE'],'neu');
  const restarted=new PlanEngine([f.checkout],true);await assert.rejects(restarted.apply(approval),code('unknownPlan'));
});
test('dependencies are ordered and require explicit approval; unapproved work stays unexecuted',async t=>{
  const f=await fixture(t);f.adapter.propose=s=>{const ops=diffManaged('metadata',f.desired,s.remote,'locales');ops[0]!.dependencies=[ops[1]!.id];return ops;};
  const {approval}=await f.create();await assert.rejects(f.engine.apply({...approval,operationIds:[approval.operationIds[1]!]}),code('missingDependency'));
  const journal=await f.engine.apply({...approval,operationIds:[approval.operationIds[0]!]});assert.deepEqual(f.writes,['en-US']);
  assert.equal(journal.operations.filter(op=>!op.approved)[0]?.state,'notStarted');await f.engine.status(approval.planId,true);assert.equal(f.writes.length,1);
});
test('partial locale failure never rolls back success or replays writes',async t=>{
  const f=await fixture(t);const execute=f.adapter.execute;f.adapter.execute=async op=>{if(op.key==='en-US')throw new AppStoreError('rejected','Rejected.','rejected');await execute(op);};
  const {approval}=await f.create();const journal=await f.engine.apply(approval);assert.equal(journal.state,'partial');assert.deepEqual(journal.operations.map(op=>op.state),['confirmed','failed']);
  assert.deepEqual(f.writes,['de-DE']);assert.equal((await f.create()).approval.operationIds.length,1);
});
test('timeout after successful POST is reconciled with exactly one execute per operation',async t=>{
  const f=await fixture(t);const execute=f.adapter.execute;f.adapter.execute=async op=>{await execute(op);throw new AppStoreError('timeout','Uncertain.','outcomeUnknown');};
  const {approval}=await f.create();const journal=await f.engine.apply(approval);assert.equal(journal.state,'complete');assert.deepEqual(journal.operations.map(op=>op.state),['reconciled','reconciled']);assert.equal(f.writes.length,2);
});
test('unverified outcome blocks remaining writes; status may only reconcile already approved attempts',async t=>{
  const f=await fixture(t);let pending:Operation|undefined;
  f.adapter.execute=async op=>{f.writes.push(op.key);pending=op;throw new AppStoreError('timeout','Uncertain.','outcomeUnknown');};
  const {approval}=await f.create();const journal=await f.engine.apply(approval);assert.deepEqual(journal.operations.map(op=>op.state),['outcomeUnknown','notStarted']);
  f.snapshot.remote[pending!.key]=pending!.after!;const status=await f.engine.status(approval.planId,true);assert.equal(status.operations[0]?.state,'reconciled');assert.equal(status.state,'partial');assert.equal(f.writes.length,1);
  await assert.rejects(f.engine.apply(approval),code('planConsumed'));
});
test('status cannot reconcile against a different account or changed secret',async t=>{
  const f=await fixture(t);f.adapter.execute=async()=>{throw new Error('unknown');};const {approval}=await f.create();await f.engine.apply(approval);
  f.snapshot.credentialContext='account-B';await assert.rejects(f.engine.status(approval.planId,true),code('stalePlan'));assert.equal((await f.engine.status(approval.planId)).operations[0]?.state,'outcomeUnknown');
});
test('intent is flushed before mutation; process loss preserves uncertainty and cannot resume writes',async t=>{
  const f=await fixture(t);const {approval,p}=await f.create();f.adapter.execute=async op=>{
    const disk=JSON.parse(await readFile((p.planPath as string).replace('.plan.json','.journal.json'),'utf8'));
    assert.equal(disk.operations.find((entry:{id:string})=>entry.id===op.id).state,'inFlight');
    f.snapshot.remote[op.key]=op.after!;f.adapter.capture=async()=>{throw new Error('process transport lost');};
  };
  const journal=await f.engine.apply(approval);assert.equal(journal.operations[0]?.state,'outcomeUnknown');
  assert.equal(JSON.parse(await readFile((p.planPath as string).replace('.plan.json','.journal.json'),'utf8')).state,'partial');
});
test('success response with failed postcondition remains unknown',async t=>{
  const f=await fixture(t);f.adapter.execute=async op=>{f.writes.push(op.key);};const {approval}=await f.create();const journal=await f.engine.apply(approval);
  assert.equal(journal.operations[0]?.state,'outcomeUnknown');assert.equal(f.writes.length,1);
});
test('unrelated concurrent edit stops subsequent operations and is reported',async t=>{
  const f=await fixture(t);const execute=f.adapter.execute;f.adapter.execute=async op=>{await execute(op);f.snapshot.remote.unmanaged='concurrent';};
  const {approval}=await f.create();const journal=await f.engine.apply(approval);assert.equal(journal.state,'partial');assert.equal(journal.operations[0]?.code,'concurrentChange');assert.equal(f.writes.length,1);
});
test('account lock serializes plans across versions and is released after execution',async t=>{
  const f=await fixture(t);const one=await f.create();const otherAdapter={...f.adapter,capture:async()=>({...structuredClone(f.snapshot),target:{...f.snapshot.target,version:'2'}})};
  const two=await f.engine.create(otherAdapter);let release!:()=>void;let entered!:()=>void;const inside=new Promise<void>(r=>{entered=r;});
  const execute=f.adapter.execute;f.adapter.execute=async op=>{entered();await new Promise<void>(r=>{release=r;});await execute(op);};
  const running=f.engine.apply({...one.approval,operationIds:[one.approval.operationIds[0]!]});await inside;
  await assert.rejects(f.engine.apply({...one.approval,planId:two.planId as string,digest:two.digest as string}),code('busy'));
  release();await running;assert.equal(f.writes.length,1);
});
test('secret values and fingerprints are excluded from persisted plans and journals',async t=>{
  const f=await fixture(t);f.desired['en-US']='SUPER-SECRET';f.adapter.propose=s=>diffManaged('metadata',f.desired,s.remote,'review',true);
  const {p,approval}=await f.create();await f.engine.apply(approval);
  for(const filename of [p.planPath as string,(p.planPath as string).replace('.plan.json','.journal.json')]){
    const text=await readFile(filename,'utf8');assert.ok(!text.includes('SUPER-SECRET'));assert.ok(!text.includes(f.snapshot.secretFingerprint));assert.ok(!text.includes(f.snapshot.credentialContext));
  }
});
test('ordinary apply rejects submission and adapter models reject unsafe dependencies',async t=>{
  const f=await fixture(t);const propose=f.adapter.propose;f.adapter.propose=s=>propose(s).map(op=>({...op,kind:'submission'}));
  await assert.rejects(f.engine.apply((await f.create()).approval),code('submissionForbidden'));
  f.adapter.propose=s=>propose(s).map(op=>({...op,dependencies:['missing']}));await assert.rejects(f.create(),code('invalidPlan'));
  f.adapter.propose=s=>propose(s).map(op=>({...op,domain:'injected'}));await assert.rejects(f.create(),code('invalidPlan'));assert.equal(f.writes.length,0);
});
test('submission requires its independent flag and the complete submission-only plan',async t=>{
  const f=await fixture(t);const propose=f.adapter.propose;f.adapter.propose=s=>propose(s).map(op=>({...op,kind:'submission'}));const {approval}=await f.create();
  await assert.rejects(f.engine.submit(approval,false),code('submissionDisabled'));
  await assert.rejects(f.engine.submit({...approval,operationIds:[approval.operationIds[0]!]},true),code('invalidSubmissionApproval'));
  assert.equal((await f.engine.submit(approval,true)).state,'complete');assert.equal(f.writes.length,2);
});
test('symlinked journal directory is rejected before creating artifacts',async t=>{
  const f=await fixture(t);await symlink(f.root,path.join(f.checkout,'.appstore-connect-mcp'));await assert.rejects(f.create(),code('unsafePath'));
});
