import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,realpath,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ApiClient} from '../../src/api/client.js';
import {ScreenshotAdapter} from '../../src/domains/screenshots.js';
import {PlanEngine} from '../../src/planning/engine.js';
import {png} from './fixture.js';
import {AppStoreError} from '../../src/errors.js';
import {createHash} from 'node:crypto';
async function fixture(t:test.TestContext){
 const checkout=await realpath(await mkdtemp(path.join(os.tmpdir(),'asc-sync-')));t.after(()=>rm(checkout,{recursive:true,force:true}));const root=path.join(checkout,'AppStore');const folder=path.join(root,'versions/macOS/1.0/localizations/en-US');await mkdir(folder,{recursive:true});await mkdir(path.join(root,'assets'));
 const bytes=png();await writeFile(path.join(root,'assets/screen.png'),bytes);await writeFile(path.join(root,'app.json'),JSON.stringify({schemaVersion:1,app:{appStoreId:'123',bundleId:'com.example.app',primaryLocale:'en-US'},platforms:['MAC_OS'],localizations:['en-US']}));await writeFile(path.join(root,'versions/macOS/1.0/version.json'),JSON.stringify({schemaVersion:1,platform:'MAC_OS',versionString:'1.0'}));await writeFile(path.join(folder,'screenshots.json'),JSON.stringify({mode:'merge',sets:{APP_DESKTOP:['assets/screen.png']}}));
 const sets:any[]=[];const images:any[]=[];const calls:{method:string;url:string;body?:any}[]=[];const controls={transferFailure:false,wrongParent:false,setUnknown:false,concurrentExtra:false,version:'1.0'};let transferred=0;
 const api=new ApiClient({token:()=> 'secret'},{readRetries:0,fetch:async(input,options)=>{
  const url=new URL(String(input)).pathname;const method=options?.method??'GET';const body=options?.body?JSON.parse(String(options.body)):undefined;calls.push({method,url,body});
  if(method==='GET'){
   let data:unknown;
   if(url==='/v1/apps/123')data={id:'123',type:'apps',attributes:{bundleId:'com.example.app'}};
   else if(url.endsWith('/appStoreVersions'))data=[{id:'VERSION',type:'appStoreVersions',attributes:{platform:'MAC_OS',versionString:controls.version,appVersionState:'PREPARE_FOR_SUBMISSION'}}];
   else if(url.endsWith('/appStoreVersionLocalizations'))data=[{id:'LOCALE',type:'appStoreVersionLocalizations',attributes:{locale:'en-US'}}];
   else if(url.endsWith('/appScreenshotSets'))data=sets;
   else if(url.endsWith('/relationships/appScreenshots'))data=images.map(image=>({type:'appScreenshots',id:image.id}));
   else if(url.endsWith('/appScreenshots'))data=images;
   else if(url==='/v1/appScreenshotSets/SET')data=sets[0];
   else data=images.find(image=>url.endsWith('/'+image.id));
   return Response.json({data});
  }
  if(method==='POST'&&url==='/v1/appScreenshotSets'){
   sets.push({id:'SET',type:'appScreenshotSets',attributes:body.data.attributes});if(controls.setUnknown)throw new Error('lost set response');return Response.json({data:sets[0]},{status:201});
  }
  if(method==='POST'){
   const image={id:'IMAGE-'+(images.length+1),type:'appScreenshots',attributes:{...body.data.attributes,assetDeliveryState:{state:'AWAITING_UPLOAD'},uploadOperations:[{method:'PUT',offset:0,length:bytes.length,url:'https://fixture.blobstore.apple.com/secret',requestHeaders:[]}]},relationships:{appScreenshotSet:{data:{id:controls.wrongParent?'OTHER':'SET',type:'appScreenshotSets'}}}};images.push(image);return Response.json({data:image},{status:201});
  }
  if(method==='DELETE'){images.splice(images.findIndex(image=>url.endsWith('/'+image.id)),1);return new Response(null,{status:204});}
  if(url.endsWith('/relationships/appScreenshots')){const ordered=body.data.map((target:any)=>images.find(image=>image.id===target.id));images.splice(0,images.length,...ordered);return new Response(null,{status:204});}
  const image=images.find(image=>url.endsWith('/'+image.id));image.attributes.sourceFileChecksum=body.data.attributes.sourceFileChecksum;image.attributes.assetDeliveryState={state:'COMPLETE'};if(controls.concurrentExtra)images.unshift({...structuredClone(image),id:'CONCURRENT',attributes:{...image.attributes,sourceFileChecksum:'f'.repeat(32)}});return Response.json({data:image});
 }});
 const adapter=()=>new ScreenshotAdapter({root,platform:'macOS',version:controls.version,locales:['en-US']},[checkout],api,()=> 'account',{transfer:async(_operation,source)=>{if(controls.transferFailure)throw new AppStoreError('syntheticFailure','Synthetic transfer failed.');for await(const chunk of source)transferred+=chunk.length;}});
 const engine=new PlanEngine([checkout],true);const plan=()=>engine.create(adapter());const apply=(plan:any,ids?:string[])=>engine.apply({planId:plan.planId,digest:plan.digest,operationIds:ids??plan.operations.map((op:any)=>op.id),authorization:{confirmedByHost:true}});
 return {root,folder,controls,sets,images,calls,bytes,engine,plan,apply,adapter,transferred:()=>transferred,md5:createHash('md5').update(bytes).digest('hex')};
}
const native={skip:process.platform!=='darwin'};
test('approved set creation, upload and order verify live mock membership; second plan has zero writes',native,async t=>{
 const f=await fixture(t);f.controls.setUnknown=true;const plan=await f.plan();assert.equal((plan.operations as any[]).length,3);const journal=await f.apply(plan);assert.equal(journal.state,'complete');assert.equal(journal.operations[0]!.state,'reconciled');assert.equal(f.transferred(),f.bytes.length);const count=f.calls.filter(call=>call.method!=='GET').length;assert.equal((await f.plan()).noOp,true);assert.equal(f.calls.filter(call=>call.method!=='GET').length,count);
});
test('changed approved sources stop before any Apple write',native,async t=>{
 const f=await fixture(t);const plan=await f.plan();await writeFile(path.join(f.root,'assets/screen.png'),png(1440,900));await assert.rejects(f.apply(plan),/changed/);assert.equal(f.calls.filter(call=>call.method!=='GET').length,0);
});
test('failed partial upload retains reservation, stops ordering and refuses a blind duplicate on replan',native,async t=>{
 const f=await fixture(t);f.controls.transferFailure=true;const journal=await f.apply(await f.plan());assert.equal(journal.state,'partial');assert.equal(f.images.length,1);assert.equal(f.calls.filter(call=>call.method==='PATCH').length,0);await assert.rejects(f.plan(),/pending/);assert.equal(f.calls.filter(call=>call.method==='POST'&&call.url==='/v1/appScreenshots').length,1);
});
test('wrong-parent resources cannot transfer or verify',native,async t=>{
 const f=await fixture(t);f.controls.wrongParent=true;const journal=await f.apply(await f.plan());assert.equal(journal.state,'partial');assert.equal(f.transferred(),0);await assert.rejects(f.plan(),/parent/);
});
test('reorder-only uses no image transfer and explicit replacement removes only approved IDs',native,async t=>{
 const f=await fixture(t);await f.apply(await f.plan());const original=f.images[0];f.images.unshift({...structuredClone(original),id:'UNOWNED',attributes:{...original.attributes,sourceFileChecksum:'a'.repeat(32)}});const plan=await f.plan();assert.equal((plan.operations as any[]).length,1);const count=f.transferred();assert.equal((await f.apply(plan)).state,'complete');assert.equal(f.transferred(),count);assert.deepEqual(f.images.map(image=>image.id),['IMAGE-1','UNOWNED']);
 await writeFile(path.join(f.folder,'screenshots.json'),JSON.stringify({mode:'replace',sets:{APP_DESKTOP:['assets/screen.png']}}));const replacement=await f.plan();assert.equal((replacement.operations as any[]).filter(op=>op.kind==='remove').length,1);assert.equal((await f.apply(replacement)).state,'complete');assert.deepEqual(f.images.map(image=>image.id),['IMAGE-1']);assert.equal(f.transferred(),count);
});

test('concurrent same-set additions prevent successful upload postcondition and stop order',native,async t=>{
 const f=await fixture(t);f.controls.concurrentExtra=true;const result=await f.apply(await f.plan());assert.equal(result.state,'partial');assert.equal(result.operations[1]!.state,'outcomeUnknown');assert.equal(f.calls.filter(call=>call.url.endsWith('/relationships/appScreenshots')&&call.method==='PATCH').length,0);
});
test('a stale remote list prevents applying the approved replacement',native,async t=>{
 const f=await fixture(t);await f.apply(await f.plan());await writeFile(path.join(f.folder,'screenshots.json'),JSON.stringify({mode:'replace',sets:{APP_DESKTOP:[]}}));const plan=await f.plan();f.images[0].attributes.sourceFileChecksum='b'.repeat(32);const writes=f.calls.filter(call=>call.method!=='GET').length;await assert.rejects(f.apply(plan),/changed/);assert.equal(f.calls.filter(call=>call.method!=='GET').length,writes);
});
test('missing manifests are unmanaged even when screenshots already exist',native,async t=>{
 const f=await fixture(t);await f.apply(await f.plan());await rm(path.join(f.folder,'screenshots.json'));assert.equal((await f.plan()).noOp,true);assert.equal(f.images.length,1);
});
