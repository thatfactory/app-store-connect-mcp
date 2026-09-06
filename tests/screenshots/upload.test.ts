import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,realpath,rm,readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {ApiClient} from '../../src/api/client.js';
import {AppStoreError} from '../../src/errors.js';
import {JournalStore} from '../../src/planning/journal.js';
import {ScreenshotUploader} from '../../src/screenshots/upload.js';
import {validateImage} from '../../src/screenshots/validate.js';
import type {AssetTransfer} from '../../src/api/asset-transfer.js';
import {png,decoded} from './fixture.js';
async function fixture(t:test.TestContext){
  const checkout=await realpath(await mkdtemp(path.join(os.tmpdir(),'asc-image-')));t.after(()=>rm(checkout,{recursive:true,force:true}));const root=path.join(checkout,'AppStore');await mkdir(root);const journal=await JournalStore.create(root,[checkout]);
  const original=png();let bytes=original;const identity=await validateImage(bytes,'screen.png',undefined,decoded);const controls={reserveUnknown:false,commitUnknown:false,processing:false,failed:false,corruptChecksum:false,wrongParent:false,expired:false,rateLimited:false,changeAfterPart:false,hideReservation:false,abortAfterPart:undefined as AbortController|undefined};const images:any[]=[];const calls:{method:string;path:string;body?:any}[]=[];const parts:Buffer[]=[];const storedHeaders:unknown[]=[];
  const api=new ApiClient({token:()=> 'ASC-BEARER-PRIVATE'},{readRetries:0,fetch:async(input,options)=>{
    const url=new URL(String(input));const method=options?.method??'GET';const body=options?.body?JSON.parse(String(options.body)):undefined;calls.push({method,path:url.pathname,body});
    if(method==='GET'){
      if(url.pathname==='/v1/appScreenshotSets/SET')return Response.json({data:{id:'SET',type:'appScreenshotSets',attributes:{screenshotDisplayType:'APP_DESKTOP'}}});
      if(url.pathname.endsWith('/appScreenshots'))return Response.json({data:controls.hideReservation?[]:images});
      return Response.json({data:images.find(image=>url.pathname.endsWith('/'+image.id))});
    }
    if(method==='POST'){
      const half=Math.floor(original.length/2);const operations=[{offset:half,length:original.length-half},{offset:0,length:half}].map(range=>({...range,method:'PUT',url:'https://fixture.blobstore.apple.com/part?secret=SIGNED-PRIVATE',requestHeaders:[{name:'Content-Type',value:'image/png'}]}));
      images.push({id:'IMAGE',type:'appScreenshots',attributes:{...body.data.attributes,uploadOperations:operations,assetDeliveryState:{state:'AWAITING_UPLOAD'}},relationships:{appScreenshotSet:{data:{type:'appScreenshotSets',id:controls.wrongParent?'OTHER':'SET'}}}});
      if(controls.reserveUnknown)throw new Error('response lost');return Response.json({data:images[0]},{status:201});
    }
    images[0].attributes.sourceFileChecksum=controls.corruptChecksum?'0'.repeat(32):body.data.attributes.sourceFileChecksum;images[0].attributes.assetDeliveryState={state:controls.failed?'FAILED':controls.processing?'UPLOAD_COMPLETE':'COMPLETE',errors:controls.failed?[{code:'INVALID_IMAGE',description:'SIGNED-PRIVATE'}]:[]};
    if(controls.commitUnknown)throw new Error('commit response lost');return Response.json({data:images[0]});
  }});
  let attempts=0;const transfer:AssetTransfer={transfer:async(operation,source,signal)=>{signal.throwIfAborted();attempts++;storedHeaders.push(operation.headers);if(controls.expired)throw new AppStoreError('uploadUrlExpired','Expired.','rejected',403);if(controls.rateLimited&&attempts===1)throw new AppStoreError('uploadRateLimited','Limited.','rejected',429);const chunks:Buffer[]=[];for await(const chunk of source)chunks.push(Buffer.from(chunk));parts.push(Buffer.concat(chunks));controls.abortAfterPart?.abort();if(controls.changeAfterPart)bytes=Buffer.from('changed source');}};
  const uploader=new ScreenshotUploader(api,transfer,journal,true,{decode:decoded,pollTimeoutMs:0,pollMs:0});const source={name:'screen.png',read:async()=>bytes};const start=(signal?:AbortSignal)=>uploader.start('SET',source,identity.sha256,signal);
  return {checkout,root,journal,identity,original,controls,images,calls,parts,storedHeaders,uploader,start,source,attempts:()=>attempts};
}
test('synthetic image reserves, streams exact multipart bytes, commits MD5, verifies and redacts journals',async t=>{
  const f=await fixture(t);const receipt=await f.start();assert.equal(receipt.stage,'complete');const half=Math.floor(f.original.length/2);assert.deepEqual(f.parts,[f.original.subarray(half),f.original.subarray(0,half)]);assert.equal(f.calls.find(call=>call.method==='PATCH')?.body.data.attributes.sourceFileChecksum,f.identity.md5);assert.ok(f.storedHeaders.every(headers=>!JSON.stringify(headers).includes('ASC-BEARER-PRIVATE')));
  for(const filename of await readdir(f.journal.directory)){const text=await readFile(path.join(f.journal.directory,filename),'utf8');assert.ok(!text.includes('SIGNED-PRIVATE'));assert.ok(!text.includes('blobstore.apple.com'));assert.ok(!text.includes('ASC-BEARER-PRIVATE'));}
});
test('uncertain reserve and commit are reconciled with one POST and one PATCH, never replayed',async t=>{
  const f=await fixture(t);f.controls.reserveUnknown=true;f.controls.commitUnknown=true;const result=await f.start();assert.equal(result.stage,'complete');assert.equal(f.calls.filter(call=>call.method==='POST').length,1);assert.equal(f.calls.filter(call=>call.method==='PATCH').length,1);
});
test('unresolved reserve retains receipt; read-only reconciliation never resumes transfer',async t=>{
  const f=await fixture(t);f.controls.reserveUnknown=true;f.controls.hideReservation=true;const result=await f.start();assert.equal(result.stage,'reserveUnknown');assert.equal(f.parts.length,0);f.controls.hideReservation=false;const reconciled=await f.uploader.reconcileReservation(result);assert.equal(reconciled.screenshotId,'IMAGE');assert.equal(reconciled.stage,'reserved');assert.equal(f.parts.length,0);assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
});
test('source changes after a transferred part stop future parts and forbid commit',async t=>{
  const f=await fixture(t);f.controls.changeAfterPart=true;const result=await f.start();assert.equal(result.stage,'transferFailed');assert.equal(result.code,'sourceChanged');assert.equal(result.screenshotId,'IMAGE');assert.equal(f.parts.length,1);assert.equal(f.calls.filter(call=>call.method==='PATCH').length,0);
});
test('expired URL retains reservation and is not retried; rate limits retry only identical PUT bytes',async t=>{
  const expired=await fixture(t);expired.controls.expired=true;const failure=await expired.start();assert.equal(failure.stage,'transferFailed');assert.equal(failure.code,'uploadUrlExpired');assert.equal(expired.attempts(),1);assert.equal(expired.calls.filter(call=>call.method==='PATCH').length,0);
  const limited=await fixture(t);limited.controls.rateLimited=true;assert.equal((await limited.start()).stage,'complete');assert.equal(limited.attempts(),3);assert.equal(limited.calls.filter(call=>call.method==='POST').length,1);
});
test('processing is not success, terminal failures expose redacted diagnostics, wrong checksum fails',async t=>{
  const pending=await fixture(t);pending.controls.processing=true;assert.equal((await pending.start()).stage,'processing');
  const failed=await fixture(t);failed.controls.failed=true;const receipt=await failed.start();assert.equal(receipt.stage,'failed');assert.deepEqual(receipt.diagnosticCodes,['INVALID_IMAGE']);assert.ok(!JSON.stringify(receipt).includes('SIGNED-PRIVATE'));
  const corrupt=await fixture(t);corrupt.controls.corruptChecksum=true;assert.equal((await corrupt.start()).code,'checksumMismatch');
});
test('wrong-parent reservation cannot transfer bytes and cancellation creates no false rollback',async t=>{
  const wrong=await fixture(t);wrong.controls.wrongParent=true;const result=await wrong.start();assert.ok(['reserveUnknown','failed'].includes(result.stage));assert.equal(wrong.parts.length,0);
  const cancelled=await fixture(t);const abort=new AbortController();abort.abort();await assert.rejects(cancelled.start(abort.signal));assert.equal(cancelled.calls.filter(call=>call.method==='POST').length,0);
});

test('cancellation after a part retains its reservation and never commits',async t=>{
 const f=await fixture(t);const controller=new AbortController();f.controls.abortAfterPart=controller;
 const receipt=await f.start(controller.signal);assert.equal(receipt.stage,'cancelled');assert.equal(receipt.screenshotId,'IMAGE');assert.equal(f.parts.length,1);assert.equal(f.calls.filter(call=>call.method==='PATCH').length,0);
});
