import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,realpath,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ApiClient} from '../../src/api/client.js';
import {PlanEngine,type Approval} from '../../src/planning/engine.js';
import {MetadataAdapter} from '../../src/domains/metadata.js';
import type {Operation} from '../../src/planning/model.js';
const locales=['en-US','de-DE','fr-FR','ja','pt-BR'] as const;
const file=(root:string,name:string,value:unknown)=>writeFile(path.join(root,name),typeof value==='string'?value:JSON.stringify(value));
async function fixture(t:test.TestContext){
  const checkout=await realpath(await mkdtemp(path.join(os.tmpdir(),'asc-metadata-')));t.after(()=>rm(checkout,{recursive:true,force:true}));const root=path.join(checkout,'AppStore');await mkdir(path.join(root,'info'),{recursive:true});
  await file(root,'app.json',{schemaVersion:1,app:{appStoreId:'123',bundleId:'com.test.app',primaryLocale:'en-US'},platforms:['MAC_OS'],localizations:locales,categories:{primary:'UTILITIES'}});
  const prefix='versions/macOS/1.0';await mkdir(path.join(root,prefix),{recursive:true});await file(root,`${prefix}/version.json`,{schemaVersion:1,platform:'MAC_OS',versionString:'1.0',copyright:'New owner',releaseType:'MANUAL'});
  for(const locale of locales){await file(root,`info/${locale}.json`,{name:`App ${locale}`,subtitle:'Reviewed subtitle',privacyPolicyUrl:'https://www.thatfactory.com/privacy/'});await mkdir(path.join(root,`${prefix}/localizations/${locale}`),{recursive:true});await file(root,`${prefix}/localizations/${locale}/metadata.json`,{supportUrl:'https://www.thatfactory.com/support'});await file(root,`${prefix}/localizations/${locale}/description.txt`,`Description ${locale}\n`);await file(root,`${prefix}/localizations/${locale}/keywords.txt`,'budget,usage\n');}
  const version={id:'V1',type:'appStoreVersions',attributes:{platform:'MAC_OS',versionString:'1.0',appVersionState:'PREPARE_FOR_SUBMISSION',copyright:'Old owner',releaseType:'AFTER_APPROVAL'}};
  const info={id:'I1',type:'appInfos',attributes:{state:'PREPARE_FOR_SUBMISSION'}};
  const state={versions:[version],infos:[info],infoLocales:[{id:'ENI',type:'appInfoLocalizations',attributes:{locale:'en-US',name:'Keep English',subtitle:'English original'}}] as any[],textLocales:[{id:'ENT',type:'appStoreVersionLocalizations',attributes:{locale:'en-US',description:'Keep original English',keywords:'original',supportUrl:'https://www.thatfactory.com/support'}}] as any[],review:null as any,categories:{primaryCategory:'PRODUCTIVITY',secondaryCategory:null,primarySubcategoryOne:null,primarySubcategoryTwo:null,secondarySubcategoryOne:null,secondarySubcategoryTwo:null} as Record<string,string|null>,failLocale:'',unknown:false,autoCompanion:false,companionContent:null as string|null};
  const calls:{method:string;path:string;body?:any}[]=[];
  const api=new ApiClient({token:()=> 'mock'},{readRetries:0,fetch:async(input,options)=>{
    const url=new URL(String(input));const method=options?.method??'GET';const body=options?.body?JSON.parse(String(options.body)):undefined;calls.push({method,path:url.pathname,body});
    if(method==='GET'){
      let data:unknown;
      if(url.pathname==='/v1/apps/123')data={id:'123',type:'apps',attributes:{bundleId:'com.test.app',primaryLocale:'en-US'}};
      else if(url.pathname.endsWith('/appStoreVersions'))data=state.versions;
      else if(url.pathname.endsWith('/appInfos'))data=state.infos;
      else if(url.pathname.endsWith('/appInfoLocalizations'))data=state.infoLocales;
      else if(url.pathname.endsWith('/appStoreVersionLocalizations'))data=state.textLocales;
      else if(url.pathname.endsWith('/appStoreReviewDetail')){if(!state.review)return Response.json({}, {status:404});data=state.review;}
      else if(url.pathname==='/v1/appCategories')data=['UTILITIES','PRODUCTIVITY'].map(id=>({id,type:'appCategories'}));
      else if(url.pathname==='/v1/appInfos/I1')data={...info,relationships:Object.fromEntries(Object.entries(state.categories).map(([key,id])=>[key,{data:id?{id,type:'appCategories'}:null}]))};
      else throw new Error('Unexpected read '+url.pathname);
      return Response.json({data});
    }
    if(body.data.attributes?.locale===state.failLocale)return Response.json({errors:[{code:'ENTITY_ERROR.ATTRIBUTE.INVALID'}]},{status:409});
    const type=body.data.type;
    if(type==='appStoreVersions'){if(method==='POST')state.versions.push({...version,attributes:{...version.attributes,...body.data.attributes}});else Object.assign(version.attributes,body.data.attributes);}
    else if(type==='appInfos'){for(const [key,value] of Object.entries(body.data.relationships) as [string,any][])state.categories[key]=value.data?.id??null;}
    else if(type==='appStoreReviewDetails'){if(method==='POST')state.review={id:'R1',type,attributes:body.data.attributes};else Object.assign(state.review.attributes,body.data.attributes);}
    else{if(type==='appInfoLocalizations'&&method==='POST'&&state.autoCompanion)state.textLocales.push({id:'AUTO-'+body.data.attributes.locale,type:'appStoreVersionLocalizations',attributes:{locale:body.data.attributes.locale,description:state.companionContent,keywords:null,supportUrl:null,marketingUrl:null,promotionalText:null,whatsNew:null}});const list=type==='appInfoLocalizations'?state.infoLocales:state.textLocales;if(method==='POST')list.push({id:`L${list.length}`,type,attributes:body.data.attributes});else Object.assign(list.find(item=>item.id===body.data.id).attributes,body.data.attributes);}
    if(state.unknown)throw new Error('lost response after write');return Response.json({data:{}},{status:method==='POST'?201:200});
  }});
  const engine=new PlanEngine([checkout],true);const env:Record<string,string|undefined>={};
  const plan=async(domains:('appInfo'|'versionMetadata'|'version'|'review')[]=['appInfo','versionMetadata'],selectedLocales:typeof locales[number][]=['de-DE','fr-FR','ja','pt-BR'],manageCategories=false)=>{
    const adapter=new MetadataAdapter({root,platform:'macOS',version:'1.0',locales:selectedLocales,domains,manageCategories},[checkout],api,()=> 'account',env);
    const p=await engine.create(adapter);const approval:Approval={planId:p.planId as string,digest:p.digest as string,operationIds:(p.operations as Operation[]).map(op=>op.id),authorization:{confirmedByHost:true}};return {p,approval,adapter};
  };
  return {checkout,root,prefix,state,calls,engine,plan,env,version,info,api};
}
test('four-locale text sync independently creates both families and preserves en-US/shared fields',async t=>{
  const f=await fixture(t);const english=JSON.stringify([f.state.infoLocales[0],f.state.textLocales[0]]);const {p,approval}=await f.plan();assert.equal((p.operations as Operation[]).length,8);
  const result=await f.engine.apply(approval);assert.equal(result.state,'complete');assert.equal(JSON.stringify([f.state.infoLocales[0],f.state.textLocales[0]]),english);assert.equal(f.version.attributes.releaseType,'AFTER_APPROVAL');assert.equal(f.version.attributes.copyright,'Old owner');assert.equal(f.state.categories.primaryCategory,'PRODUCTIVITY');
  assert.equal((await f.plan()).p.noOp,true);assert.equal(f.calls.filter(c=>c.method!=='GET').length,8);assert.ok(f.calls.every(c=>!/(?:review|screenshot|price|availabilit|submission)/i.test(c.path)));
});
test('one missing app-info locale and existing version locale reconcile independently',async t=>{
  const f=await fixture(t);f.state.textLocales.push({id:'DE',type:'appStoreVersionLocalizations',attributes:{locale:'de-DE',description:'Description de-DE',keywords:'budget,usage',supportUrl:'https://www.thatfactory.com/support'}});
  const {p,approval}=await f.plan(['appInfo','versionMetadata'],['de-DE']);assert.equal((p.operations as Operation[]).length,1);await f.engine.apply(approval);assert.equal(f.calls.filter(c=>c.method==='POST')[0]?.path,'/v1/appInfoLocalizations');
});
test('noneditable state rejects before writes and stale file invalidates approval',async t=>{
  const f=await fixture(t);f.version.attributes.appVersionState='IN_REVIEW';await assert.rejects(f.plan(),/not in a supported editable/);f.version.attributes.appVersionState='PREPARE_FOR_SUBMISSION';const {approval}=await f.plan();await file(f.root,'info/de-DE.json',{name:'Changed'});await assert.rejects(f.engine.apply(approval),/Local inputs/);assert.equal(f.calls.filter(c=>c.method!=='GET').length,0);
});
test('name conflict stops later work while prior locale success is retained',async t=>{
  const f=await fixture(t);f.state.failLocale='fr-FR';const {approval}=await f.plan(['appInfo']);const result=await f.engine.apply(approval);assert.equal(result.state,'partial');assert.deepEqual(result.operations.map(op=>op.state),['confirmed','failed','notStarted','notStarted']);assert.ok(f.state.infoLocales.some(item=>item.attributes.locale==='de-DE'));assert.ok(!f.state.infoLocales.some(item=>item.attributes.locale==='ja'));
});
test('unknown create outcomes are reconciled without duplicate localization POST',async t=>{
  const f=await fixture(t);f.state.unknown=true;const {approval}=await f.plan(['appInfo'],['ja']);const result=await f.engine.apply(approval);assert.equal(result.operations[0]?.state,'reconciled');assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
});
test('shared copyright/release/category changes require their own selected operations',async t=>{
  const f=await fixture(t);const {p,approval}=await f.plan(['version','appInfo'],['de-DE'],true);assert.ok((p.operations as Operation[]).some(op=>op.key==='categories'));const id=(p.operations as Operation[]).find(op=>op.key==='version')!.id;
  const result=await f.engine.apply({...approval,operationIds:[id]});assert.equal(result.state,'complete');assert.equal(f.version.attributes.releaseType,'MANUAL');assert.equal(f.state.categories.primaryCategory,'PRODUCTIVITY');assert.equal(f.calls.filter(c=>c.method!=='GET').length,1);
});
test('category update uses catalog IDs without resetting unmanaged subcategories',async t=>{
  const f=await fixture(t);f.state.categories.primarySubcategoryOne='OLD_SUBCATEGORY';await assert.rejects(f.plan(['appInfo'],['de-DE'],true),/unmanaged subcategories/);f.state.categories.primarySubcategoryOne=null;const {p,approval}=await f.plan(['appInfo'],['de-DE'],true);const id=(p.operations as Operation[]).find(op=>op.key==='categories')!.id;assert.equal((await f.engine.apply({...approval,operationIds:[id]})).state,'complete');assert.equal(f.state.categories.primaryCategory,'UTILITIES');
});
test('initial version creation is explicit, ordered and repeatable without changing identity',async t=>{
  const f=await fixture(t);f.state.versions=[];f.state.textLocales=[];await assert.rejects(f.plan(),/explicitly selected shared version/);const {p,approval}=await f.plan(['version','versionMetadata'],['de-DE']);assert.equal((p.operations as Operation[])[0]?.key,'version');assert.equal((await f.engine.apply(approval)).state,'complete');assert.equal((await f.plan(['version','versionMetadata'],['de-DE'])).p.noOp,true);assert.deepEqual(f.calls.filter(c=>c.method!=='GET').map(c=>c.path),['/v1/appStoreVersions','/v1/appStoreVersionLocalizations']);
});
test('review secrets are injected only during approved execution and secret changes reject stale plan',async t=>{
  const f=await fixture(t);f.env.APPSTORE_REVIEW_DEMO_PASSWORD='secret-one';await file(f.root,`${f.prefix}/review.json`,{demoAccountRequired:true,demoAccountName:'reviewer',demoAccountPassword:{env:'APPSTORE_REVIEW_DEMO_PASSWORD'}});
  const {p,approval}=await f.plan(['review'],['en-US']);assert.ok(!JSON.stringify(p).includes('secret-one'));f.env.APPSTORE_REVIEW_DEMO_PASSWORD='secret-two';await assert.rejects(f.engine.apply(approval),/Local inputs/);
  const next=await f.plan(['review'],['en-US']);assert.equal((await f.engine.apply(next.approval)).state,'complete');assert.equal(f.calls.filter(c=>c.method==='POST')[0]?.body.data.attributes.demoAccountPassword,'secret-two');assert.equal((await f.plan(['review'],['en-US'])).p.noOp,true);
});
test('read-only review comparison remains available after the version becomes noneditable',async t=>{
  const f=await fixture(t);await file(f.root,`${f.prefix}/review.json`,{contactFirstName:'Ada',contactLastName:'Lovelace',contactPhone:'+49 30 123456',contactEmail:'review@example.test',demoAccountRequired:false});f.state.review={id:'R1',type:'appStoreReviewDetails',attributes:{contactFirstName:'Ada',contactLastName:'Lovelace',contactPhone:'+49 30 123456',contactEmail:'review@example.test',demoAccountRequired:false}};f.version.attributes.appVersionState='WAITING_FOR_REVIEW';
  const adapter=new MetadataAdapter({root:f.root,platform:'macOS',version:'1.0',locales:['en-US'],domains:['review'],manageCategories:false},[f.checkout],f.api,()=> 'account',f.env);
  assert.equal(await adapter.reviewDrift(),false);f.state.review.attributes.contactFirstName='Changed';assert.equal(await adapter.reviewDrift(),true);await assert.rejects(adapter.capture(),/not in a supported editable state/);
});

test('all five explicitly selected locales can be updated and then produce a no-op',async t=>{
  const f=await fixture(t);const {approval}=await f.plan(['appInfo','versionMetadata'],[...locales]);assert.equal((await f.engine.apply(approval)).state,'complete');assert.equal(f.state.infoLocales[0].attributes.name,'App en-US');assert.equal((await f.plan(['appInfo','versionMetadata'],[...locales])).p.noOp,true);
});
test('initial release does not accept update notes; a prior release makes notes eligible',async t=>{
  const f=await fixture(t);await file(f.root,`${f.prefix}/localizations/de-DE/whats-new.txt`,'Update notes');await assert.rejects(f.plan(['versionMetadata'],['de-DE']),/initial release/);
  f.state.versions.push({id:'OLD',type:'appStoreVersions',attributes:{...f.version.attributes,versionString:'0.9',appVersionState:'READY_FOR_DISTRIBUTION'}});const {approval}=await f.plan(['versionMetadata'],['de-DE']);assert.equal((await f.engine.apply(approval)).state,'complete');
});

test('Apple-initialized empty companion is explicitly planned and patched without duplicate POST',async t=>{
  const f=await fixture(t);f.state.autoCompanion=true;const {p,approval}=await f.plan(['appInfo','versionMetadata'],['de-DE']);assert.ok((p.operations as Operation[])[1]?.scope.includes('empty companion'));assert.equal((p.operations as Operation[])[1]?.dependencies[0],(p.operations as Operation[])[0]?.id);
  assert.equal((await f.engine.apply(approval)).state,'complete');assert.deepEqual(f.calls.filter(c=>c.method!=='GET').map(c=>[c.method,c.path]),[['POST','/v1/appInfoLocalizations'],['PATCH','/v1/appStoreVersionLocalizations/AUTO-de-DE']]);assert.equal((await f.plan(['appInfo','versionMetadata'],['de-DE'])).p.noOp,true);
});
test('nonempty unexpected companion is never overwritten under a create approval',async t=>{
  const f=await fixture(t);f.state.autoCompanion=true;f.state.companionContent='Other editor content';const {approval}=await f.plan(['appInfo','versionMetadata'],['de-DE']);const result=await f.engine.apply(approval);assert.equal(result.state,'partial');assert.equal(result.operations[1]?.state,'failed');assert.equal(f.calls.filter(c=>c.method!=='GET').length,1);assert.equal(f.state.textLocales[1].attributes.description,'Other editor content');
});

test('historical replaced releases do not block the next version or its update notes',async t=>{
  const f=await fixture(t);f.state.versions=[{id:'OLD',type:'appStoreVersions',attributes:{...f.version.attributes,versionString:'0.9',appVersionState:'REPLACED_WITH_NEW_VERSION'}}];f.state.textLocales=[];
  await file(f.root,`${f.prefix}/localizations/de-DE/whats-new.txt`,'Reviewed update notes');const {approval}=await f.plan(['version','versionMetadata'],['de-DE']);assert.equal((await f.engine.apply(approval)).state,'complete');assert.equal((await f.plan(['version','versionMetadata'],['de-DE'])).p.noOp,true);
});

for(const source of ['environment','literal','notes'] as const)test(`late ${source} change cannot replace approved review values at dispatch`,async t=>{
  const f=await fixture(t);const approved='APPROVED-PRIVATE-VALUE';const changed='UNAPPROVED-PRIVATE-VALUE';
  if(source==='environment'){f.env.APPSTORE_REVIEW_DEMO_PASSWORD=approved;await file(f.root,`${f.prefix}/review.json`,{demoAccountPassword:{env:'APPSTORE_REVIEW_DEMO_PASSWORD'}});}
  else if(source==='literal')await file(f.root,`${f.prefix}/review.json`,{contactFirstName:approved});
  else await file(f.root,`${f.prefix}/review-notes.txt`,approved);
  const {p,approval,adapter}=await f.plan(['review'],['en-US']);const capture=adapter.capture.bind(adapter);let captures=0;
  adapter.capture=async signal=>{const snapshot=await capture(signal);if(++captures===3){
    if(source==='environment')f.env.APPSTORE_REVIEW_DEMO_PASSWORD=changed;
    else if(source==='literal')await file(f.root,`${f.prefix}/review.json`,{contactFirstName:changed});
    else await file(f.root,`${f.prefix}/review-notes.txt`,changed);
  }return snapshot;};
  const journal=await f.engine.apply(approval);assert.equal(journal.state,'partial');assert.equal(journal.operations[0]?.state,'failed');assert.equal(journal.operations[0]?.code,'stalePlan');assert.equal(f.calls.filter(call=>call.method!=='GET').length,0);
  const output=JSON.stringify({p,journal});assert.ok(!output.includes(approved));assert.ok(!output.includes(changed));
});
