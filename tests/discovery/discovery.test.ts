import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, readFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { ApiClient } from '../../src/api/client.js';
import { Discovery } from '../../src/api/resources/discovery.js';
import { exportState, exportContent } from '../../src/repository/export.js';
import { validateRepository } from '../../src/repository/validate.js';
const app={id:'123',type:'apps',attributes:{name:'Synthetic',bundleId:'com.example.synthetic',primaryLocale:'en-US',sku:'OWNER-SKU'}};
const version={id:'version-1',type:'appStoreVersions',attributes:{platform:'MAC_OS',versionString:'1.0',appVersionState:'PREPARE_FOR_SUBMISSION',releaseType:'MANUAL'}};
const editable={id:'info-edit',type:'appInfos',attributes:{state:'PREPARE_FOR_SUBMISSION'}};
const released={id:'info-released',type:'appInfos',attributes:{state:'READY_FOR_DISTRIBUTION'}};
const target={appStoreId:'123',bundleId:'com.example.synthetic',platform:'MAC_OS' as const,version:'1.0'};
function fixture(overrides:Record<string,unknown>={}){
  const responses:Record<string,unknown>={
    '/v1/apps':{data:[app]},'/v1/apps/123':{data:app},
    '/v1/apps/123/appStoreVersions':{data:[version]},'/v1/apps/123/appInfos':{data:[released,editable]},
    '/v1/appInfos/info-edit/appInfoLocalizations':{data:[{id:'info-en',type:'appInfoLocalizations',attributes:{locale:'en-US',name:'Synthetic'}}]},
    '/v1/appInfos/info-released/appInfoLocalizations':{data:[{id:'info-old-en',type:'appInfoLocalizations',attributes:{locale:'en-US',name:'Published name'}}]},
    '/v1/appStoreVersions/version-1/appStoreVersionLocalizations':{data:[{id:'locale-en',type:'appStoreVersionLocalizations',attributes:{locale:'en-US',description:'A café\r\nAnother line\n',keywords:'one,two',marketingUrl:null}}]},
    '/v1/appStoreVersionLocalizations/locale-en/appScreenshotSets':{data:[{id:'set-1',type:'appScreenshotSets',attributes:{screenshotDisplayType:'APP_DESKTOP'}}]},
    '/v1/appScreenshotSets/set-1/appScreenshots':{data:[{id:'shot-1',type:'appScreenshots',attributes:{fileName:'image.png',fileSize:10,sourceFileChecksum:'checksum',imageAsset:{templateUrl:'https://signed-secret'},uploadOperations:[{url:'https://signed-secret'}],assetToken:'secret-token',assetDeliveryState:{state:'COMPLETE'}}}]},
    '/v1/appStoreVersions/version-1/appStoreReviewDetail':{data:{id:'review-1',type:'appStoreReviewDetails',attributes:{contactEmail:'private@example.test',demoAccountPassword:'private-password',demoAccountRequired:true,notes:'private-notes'}}},...overrides,
  };
  const calls:string[]=[];
  const api=new ApiClient({token:()=> 'test'}, {readRetries:0,fetch:(async(input,options)=>{
    assert.equal(options?.method,'GET');const url=new URL(String(input));calls.push(url.pathname);
    const key=url.searchParams.has('page')?`${url.pathname}?page=${url.searchParams.get('page')}`:url.pathname;
    if(!Object.hasOwn(responses,key))throw Error(`Unexpected test request ${key}`);
    const result=responses[key];return result instanceof Response?result:Response.json(result);
  }) as typeof fetch});
  return {reader:new Discovery(api,()=> 'credential-fingerprint'),calls};
}
test('exact identity and independent localization families are read without leaking review/upload data',async()=>{
  const {reader,calls}=fixture();const state=await reader.state(target);
  assert.equal(state.appInfo?.id,'info-edit');assert.equal(state.version?.id,'version-1');assert.equal(state.editable,true);
  assert.equal(state.appInfoLocalizations.length,1);assert.equal(state.versionLocalizations.length,1);
  const output=JSON.stringify(state);for(const secret of ['private@example.test','private-password','private-notes','signed-secret','secret-token'])assert.ok(!output.includes(secret));
  assert.ok(calls.length>4);
});
test('omitting version lists candidates and never chooses the latest implicitly',async()=>{
  const {reader,calls}=fixture();const {version:_,...identity}=target;const state=await reader.state(identity);assert.equal(state.selectionRequired,true);assert.equal(state.version,undefined);assert.equal(calls.length,3);
});
test('mismatched app identity, ambiguous versions and multiple editable AppInfos block reads',async()=>{
  await assert.rejects(fixture().reader.state({...target,bundleId:'com.example.other'}),/do not agree/);
  await assert.rejects(fixture({'/v1/apps/123/appStoreVersions':{data:[version,{...version,id:'version-2'}]}}).reader.state(target),/unique/);
  await assert.rejects(fixture({'/v1/apps/123/appInfos':{data:[editable,{...editable,id:'info-other'}]}}).reader.state(target),/Multiple applicable/);
  await assert.rejects(fixture().reader.state({...target,version:'2.0'}),/existing unique/);
});
test('released versions select released AppInfo even when a draft AppInfo exists',async()=>{
  const state=await fixture({'/v1/apps/123/appStoreVersions':{data:[{...version,attributes:{...version.attributes,appVersionState:'READY_FOR_DISTRIBUTION'}}]}}).reader.state(target);
  assert.equal(state.editable,false);assert.equal(state.appInfo?.id,'info-released');assert.equal(state.appInfoLocalizations[0]?.attributes.name,'Published name');
});
test('pagination is complete and denied access is never interpreted as an empty account',async()=>{
  const {reader}=fixture({'/v1/apps':{data:[app],links:{next:'/v1/apps?page=2'}},'/v1/apps?page=2':{data:[{...app,id:'456',attributes:{...app.attributes,bundleId:'com.example.other'}}]}});
  assert.equal((await reader.apps()).length,2);assert.equal((await reader.apps('com.example.synthetic')).length,1);
  await assert.rejects(fixture({'/v1/apps':new Response('private',{status:403})}).reader.apps(),/HTTP 403/);
});
test('missing localization in one family never suppresses the other',async()=>{
  const state=await fixture({'/v1/appInfos/info-edit/appInfoLocalizations':{data:[]}}).reader.state(target);assert.equal(state.appInfoLocalizations.length,0);assert.equal(state.versionLocalizations.length,1);
});
test('preparation confirms existing identity or returns exact manual bootstrap gaps with no writes',async()=>{
  assert.equal((await fixture().reader.prepare({bundleId:target.bundleId,appStoreId:'123'})).status,'existing');
  const result=await fixture({'/v1/apps':{data:[]}}).reader.prepare({bundleId:target.bundleId,name:'Owner name',sku:'OWNER-SKU',primaryLocale:'en-US',platform:'MAC_OS'});
  assert.equal(result.status,'manualActionRequired');assert.deepEqual(result.missing,[]);assert.deepEqual(result.bootstrap,{bundleId:target.bundleId,name:'Owner name',sku:'OWNER-SKU',primaryLocale:'en-US',platform:'MAC_OS'});
});
test('export refuses overwrite/escape and round-trips normalized prose without exporting contacts or asset URLs',async()=>{
  const parent=await realpath(await mkdtemp(path.join(tmpdir(),'asc-export-')));
  try{
    const state=await fixture().reader.state(target);const output=await exportState(state,path.join(parent,'AppStore'),[parent]);
    await assert.rejects(exportState(state,output.destination,[parent]),/new directory/);
    await assert.rejects(exportState(state,path.join(path.dirname(parent),'escape-export'),[parent]),/outside/);
    await symlink(output.destination,path.join(parent,'link'));await assert.rejects(exportState(state,path.join(parent,'link'),[parent]),/new directory/);
    const validation=await validateRepository({root:output.destination,domains:['appInfo','versionMetadata']},[parent],{});assert.equal(validation.valid,true);
    assert.equal(validation.desired['versions/macOS/1.0/localizations/en-US/description.txt'],'A café\nAnother line\n');
    const serialized=JSON.stringify(exportContent(state));for(const secret of ['private@example.test','private-password','private-notes','signed-secret','secret-token'])assert.ok(!serialized.includes(secret));
    const review=await readFile(path.join(output.destination,'versions/macOS/1.0/review.json'),'utf8');assert.ok(review.includes('APPSTORE_REVIEW_DEMO_PASSWORD'));
    assert.ok(output.englishFingerprint);assert.ok(!output.files.some(file=>file.endsWith('.png')));
  }finally{await rm(parent,{recursive:true,force:true});}
});
test('unresolved in-review AppInfo never falls back to unrelated published metadata',async()=>{
  const state=await fixture({'/v1/apps/123/appStoreVersions':{data:[{...version,attributes:{...version.attributes,appVersionState:'IN_REVIEW'}}]}}).reader.state(target);
  assert.equal(state.appInfo,undefined);assert.ok(state.unavailable.length);assert.throws(()=>exportContent(state),/resolve app information/);
});
test('metadata-rejected version with an unrecognized AppInfo state cannot export its released sibling',async()=>{
  const state=await fixture({'/v1/apps/123/appStoreVersions':{data:[{...version,attributes:{...version.attributes,appVersionState:'METADATA_REJECTED'}}]},'/v1/apps/123/appInfos':{data:[released,{id:'info-rejected',type:'appInfos',attributes:{state:'METADATA_REJECTED'}}]}}).reader.state(target);
  assert.equal(state.appInfo,undefined);assert.equal(state.editable,false);assert.throws(()=>exportContent(state),/resolve app information/);
});
test('metadata-rejected version selects its current REJECTED AppInfo using independent state rules',async()=>{
  const state=await fixture({'/v1/apps/123/appStoreVersions':{data:[{...version,attributes:{...version.attributes,appVersionState:'METADATA_REJECTED'}}]},'/v1/apps/123/appInfos':{data:[released,{...editable,attributes:{state:'REJECTED',appStoreState:'METADATA_REJECTED'}}]}}).reader.state(target);
  assert.equal(state.appInfo?.id,'info-edit');assert.equal(state.editable,true);assert.ok(exportContent(state)['info/en-US.json']?.includes('Synthetic'));
});
test('editable version without editable AppInfo never exports old published text',async()=>{
  const state=await fixture({'/v1/apps/123/appInfos':{data:[released]}}).reader.state(target);assert.equal(state.appInfo,undefined);assert.throws(()=>exportContent(state),/resolve app information/);
});
test('AppInfo editability is a subset of its independently pinned enum',async()=>{
  const {knownAppInfoStates,editableAppInfoStates,editableVersionStates}=await import('../../src/api/resources/states.js');
  const pinned=JSON.parse(await readFile('contracts/apple-openapi.json','utf8'));
  assert.deepEqual(knownAppInfoStates,pinned.components.schemas.AppInfo.properties.attributes.properties.state.enum);
  for(const state of editableAppInfoStates)assert.ok((knownAppInfoStates as readonly string[]).includes(state));
  assert.equal(editableAppInfoStates.has('METADATA_REJECTED'),false);assert.equal(editableVersionStates.has('METADATA_REJECTED'),true);
});
