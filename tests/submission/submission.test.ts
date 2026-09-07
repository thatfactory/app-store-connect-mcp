import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,realpath,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {PlanEngine} from '../../src/planning/engine.js';
import {ApiClient} from '../../src/api/client.js';
import {SubmissionAdapter,SubmissionReader,releaseReadinessChecks,type ReadinessCheck} from '../../src/domains/submission.js';
import {png} from '../screenshots/fixture.js';

const selection={root:'',platform:'MAC_OS' as const,version:'1.0',buildId:'BUILD',manualConfirmations:{privacyDeclarations:true as const,ageRating:true as const,agreementsAndRegionalObligations:true as const,exportCompliance:true as const}};

function baseRelease(){return {
  appId:'123',bundleId:'com.example.app',versionId:'VERSION',versionState:'PREPARE_FOR_SUBMISSION',releaseType:'AFTER_APPROVAL',earliestReleaseDate:null,
  build:{id:'BUILD',buildNumber:'42',processingState:'VALID',expired:false,usesNonExemptEncryption:null,appId:'123',platform:'MAC_OS',version:'1.0'},currentBuildId:null,
  locales:[{id:'LOC',locale:'en-US',desktopSets:[{id:'SET',states:['COMPLETE']}]}],
  review:{id:'REVIEW',presentFields:['contactFirstName','contactLastName','contactPhone','contactEmail'],demoAccountRequired:false},reviewDrift:false,submissions:[],
  commerce:{price:{current:{pricePointId:'ZERO'}},availability:{territories:[{available:true,contentStatuses:['AVAILABLE_FOR_SALE_UNRELEASED_APP']}]}},commercePriceDrift:false,metadataDrift:[],screenshotDrift:[]
};}

const app={schemaVersion:1,app:{appStoreId:'123',bundleId:'com.example.app',primaryLocale:'en-US'},platforms:['MAC_OS'],localizations:['en-US']} as any;
const local={valid:true,diagnostics:[],desired:{}};

test('readiness reports verified, blocked, manual and not-applicable states with exact evidence',()=>{
  const release=baseRelease();const checks=releaseReadinessChecks(local,app,release as any);const byName=(name:string)=>checks.find(check=>check.name===name)!;
  assert.equal(byName('build').status,'verified');assert.equal(byName('screenshots').status,'verified');assert.equal(byName('privacyDeclarations').status,'manualVerificationRequired');assert.equal(byName('reviewAcceptance').status,'notApplicable');assert.match(String((byName('releaseBehavior').evidence as any).warning),/publish/);
  release.build.processingState='PROCESSING';release.build.expired=true;release.locales[0]!.desktopSets[0]!.states=['PROCESSING'];release.review=null as any;release.commerce={price:{current:null},availability:{territories:[]}};release.commercePriceDrift=true;release.metadataDrift=['text:en-US.description'];release.screenshotDrift=['en-US: screenshot 1 bytes or order differ'];
  const blocked=releaseReadinessChecks({valid:false,diagnostics:[{path:'info/en-US.json',rule:'required',severity:'error'}],desired:{}},app,release as any);for(const name of ['repository','build','metadataSync','screenshots','reviewContact','priceAndAvailability'])assert.equal(blocked.find(check=>check.name===name)?.status,'blocked');
});

test('distribution restrictions and exact-build export evidence stay manual when unresolved',()=>{
  const release=baseRelease();(release.commerce.availability.territories[0] as any).contentStatuses=['CANNOT_SELL'];let checks=releaseReadinessChecks(local,app,release as any);assert.equal(checks.find(check=>check.name==='distributionRestrictions')?.status,'manualVerificationRequired');assert.equal(checks.find(check=>check.name==='exportCompliance')?.status,'manualVerificationRequired');
  release.build.usesNonExemptEncryption=false;checks=releaseReadinessChecks(local,app,release as any);assert.equal(checks.find(check=>check.name==='exportCompliance')?.status,'verified');
});
test('managed availability or review-detail drift blocks release submission readiness',()=>{
  const release=baseRelease();(release.commerce as any).availabilityComparison={manualActionRequired:true,additions:['DEU'],removals:[],futureTerritoryChange:true};let checks=releaseReadinessChecks(local,app,release as any);assert.equal(checks.find(check=>check.name==='priceAndAvailability')?.status,'blocked');
  (release.commerce as any).availabilityComparison={manualActionRequired:false};release.reviewDrift=true;checks=releaseReadinessChecks(local,app,release as any);assert.equal(checks.find(check=>check.name==='reviewContact')?.status,'blocked');release.reviewDrift=false;release.review.demoAccountRequired=null as any;checks=releaseReadinessChecks(local,app,release as any);assert.equal(checks.find(check=>check.name==='reviewContact')?.status,'blocked');
});
test('manual, automatic, scheduled and unknown release behavior are distinguished',()=>{
  const release=baseRelease();release.releaseType='MANUAL';let check=releaseReadinessChecks(local,app,release as any).find(item=>item.name==='releaseBehavior')!;assert.equal(check.status,'verified');assert.match(String((check.evidence as any).warning),/manual/);
  release.releaseType='SCHEDULED';release.earliestReleaseDate='2026-09-10T08:00:00Z';check=releaseReadinessChecks(local,app,release as any).find(item=>item.name==='releaseBehavior')!;assert.equal(check.status,'verified');assert.match(String((check.evidence as any).warning),/2026-09-10/);
  release.releaseType='UNKNOWN';check=releaseReadinessChecks(local,app,release as any).find(item=>item.name==='releaseBehavior')!;assert.equal(check.status,'blocked');
});

async function fixture(t:test.TestContext){
  const checkout=await realpath(await mkdtemp(path.join(os.tmpdir(),'asc-submission-')));t.after(()=>rm(checkout,{recursive:true,force:true}));const root=path.join(checkout,'AppStore');await mkdir(root);const release=baseRelease();const writes:string[]=[];let uncertain=false;let inputHash='hash';
  const reader={read:async()=>({root,app,local:{valid:true,diagnostics:[],hashes:{release:inputHash},secretFingerprint:'secrets',desired:{}},release:structuredClone(release),checks:releaseReadinessChecks(local,app,release as any) as ReadinessCheck[],credentialContext:'account'})};
  const api={request:async(url:string,options?:any)=>{writes.push(url);if(url.includes('/relationships/build'))release.currentBuildId='BUILD';else if(url==='/v1/reviewSubmissions')release.submissions.push({id:'SUB',platform:'MAC_OS',state:'READY_FOR_REVIEW',items:[]});else if(url==='/v1/reviewSubmissionItems')release.submissions[0]!.items.push({id:'ITEM',state:'READY_FOR_REVIEW',versionId:'VERSION'});else {release.submissions[0]!.state='WAITING_FOR_REVIEW';if(uncertain)throw new Error('response lost');}return {data:{}};}};
  const args={...selection,root};const adapter=new SubmissionAdapter(args,reader as any,api as any);const engine=new PlanEngine([checkout],true);return {release,writes,adapter,engine,setUncertain:()=>{uncertain=true;},changeInput:()=>{inputHash='changed';}};
}

test('submission plan selects the exact build, reuses verified dependencies and warns about automatic release',async t=>{
  const f=await fixture(t);const plan=await f.engine.create(f.adapter);assert.equal((plan.operations as any[]).length,4);assert.match(String((plan.summary as any).releaseBehavior.warning),/publish/);assert.deepEqual((plan.summary as any).selectedBuild,{id:'BUILD',buildNumber:'42',processingState:'VALID'});
  const approval={planId:plan.planId as string,digest:plan.digest as string,operationIds:(plan.operations as any[]).map(op=>op.id),authorization:{confirmedByHost:true as const}};await assert.rejects(f.engine.apply(approval),/Ordinary apply/);const journal=await f.engine.submit(approval,true);assert.equal(journal.state,'complete',JSON.stringify(journal));assert.equal(f.release.currentBuildId,'BUILD');assert.equal(f.release.submissions[0]?.state,'WAITING_FOR_REVIEW');assert.equal(f.writes.length,4);
  assert.equal((await f.engine.create(f.adapter)).noOp,true);
});

test('late local changes block submission before writes',async t=>{
  const f=await fixture(t);const plan=await f.engine.create(f.adapter);f.changeInput();const approval={planId:plan.planId as string,digest:plan.digest as string,operationIds:(plan.operations as any[]).map(op=>op.id),authorization:{confirmedByHost:true as const}};await assert.rejects(f.engine.submit(approval,true),/changed/);assert.equal(f.writes.length,0);
});

test('lost submit response is reconciled without replay',async t=>{
  const f=await fixture(t);f.release.currentBuildId='BUILD';f.release.submissions.push({id:'SUB',platform:'MAC_OS',state:'READY_FOR_REVIEW',items:[{id:'ITEM',state:'READY_FOR_REVIEW',versionId:'VERSION'}]});f.setUncertain();const plan=await f.engine.create(f.adapter);assert.equal((plan.operations as any[]).length,1);const approval={planId:plan.planId as string,digest:plan.digest as string,operationIds:(plan.operations as any[]).map(op=>op.id),authorization:{confirmedByHost:true as const}};const journal=await f.engine.submit(approval,true);assert.equal(journal.operations[0]?.state,'reconciled');assert.equal(f.writes.length,1);
});

test('conflicting draft items and unresolved submissions block planning',async t=>{
  const f=await fixture(t);f.release.submissions.push({id:'SUB',platform:'MAC_OS',state:'READY_FOR_REVIEW',items:[{id:'OTHER',state:'READY_FOR_REVIEW',versionId:'OTHER'}]});await assert.rejects(f.engine.create(f.adapter),/blocked|unrelated/);
  f.release.submissions=[{id:'SUB2',platform:'MAC_OS',state:'UNRESOLVED_ISSUES',items:[{id:'ITEM',state:'REJECTED',versionId:'VERSION'}]}];await assert.rejects(f.engine.create(f.adapter),/blocked|activeSubmission/);
});
test('a non-ready target item in a draft cannot be reused or submitted',async t=>{
  const f=await fixture(t);f.release.currentBuildId='BUILD';f.release.submissions.push({id:'SUB',platform:'MAC_OS',state:'READY_FOR_REVIEW',items:[{id:'ITEM',state:'REJECTED',versionId:'VERSION'}]});await assert.rejects(f.engine.create(f.adapter),/blocked|not ready/);assert.equal(f.writes.length,0);
});

async function realReaderFixture(t:test.TestContext,lostResponse:boolean){
  const checkout=await realpath(await mkdtemp(path.join(os.tmpdir(),'asc-submission-reader-')));t.after(()=>rm(checkout,{recursive:true,force:true}));const root=path.join(checkout,'AppStore');const folder=path.join(root,'versions/macOS/1.0/localizations/en-US');await mkdir(path.join(root,'assets'),{recursive:true});await mkdir(folder,{recursive:true});const image=png();await writeFile(path.join(root,'assets/screen.png'),image);const write=async(file:string,value:unknown)=>writeFile(path.join(root,file),JSON.stringify(value));
  await write('app.json',{schemaVersion:1,app:{appStoreId:'123',bundleId:'com.example.app',primaryLocale:'en-US'},platforms:['MAC_OS'],localizations:['en-US']});await write('versions/macOS/1.0/version.json',{schemaVersion:1,platform:'MAC_OS',versionString:'1.0',releaseType:'AFTER_APPROVAL'});await write('versions/macOS/1.0/review.json',{contactFirstName:'Ada',contactLastName:'Lovelace',contactPhone:'+49 30 123456',contactEmail:'review@example.test',demoAccountRequired:false});await write('versions/macOS/1.0/localizations/en-US/screenshots.json',{mode:'replace',sets:{APP_DESKTOP:['assets/screen.png']}});await write('commerce.json',{schemaVersion:1,price:{mode:'free',baseTerritory:'DEU'},availability:{territories:['DEU'],availableInNewTerritories:true}});
  const version={id:'VERSION',type:'appStoreVersions',attributes:{platform:'MAC_OS',versionString:'1.0',appVersionState:'PREPARE_FOR_SUBMISSION',releaseType:'AFTER_APPROVAL'}};const info={id:'INFO',type:'appInfos',attributes:{state:'PREPARE_FOR_SUBMISSION'}};const review={id:'REVIEW',type:'appStoreReviewDetails',attributes:{contactFirstName:'Ada',contactLastName:'Lovelace',contactPhone:'+49 30 123456',contactEmail:'review@example.test',demoAccountRequired:false}};const submissions:any[]=[];let currentBuild:string|null=null;let submitPatches=0;
  const response=(data:unknown,status=200)=>Response.json({data},{status});const related=(type:string,id:string)=>({data:{type,id}});const api=new ApiClient({token:()=> 'mock'},{readRetries:0,fetch:async(input,options)=>{const url=new URL(String(input));const method=options?.method??'GET';const body=options?.body?JSON.parse(String(options.body)):undefined;const p=url.pathname;
    if(method!=='GET'){
      if(p==='/v1/appStoreVersions/VERSION/relationships/build')currentBuild='BUILD';
      else if(p==='/v1/reviewSubmissions')submissions.push({id:'SUB',type:'reviewSubmissions',attributes:{platform:'MAC_OS',state:'READY_FOR_REVIEW'},items:[]});
      else if(p==='/v1/reviewSubmissionItems')submissions[0].items.push({id:'ITEM',type:'reviewSubmissionItems',attributes:{state:'READY_FOR_REVIEW'},relationships:{appStoreVersion:related('appStoreVersions','VERSION')}});
      else if(p==='/v1/reviewSubmissions/SUB'){submitPatches++;submissions[0].attributes.state='WAITING_FOR_REVIEW';version.attributes.appVersionState='WAITING_FOR_REVIEW';info.attributes.state='WAITING_FOR_REVIEW';if(lostResponse)throw new Error('lost response after accepted submit');}
      else throw new Error('Unexpected write '+p+' '+JSON.stringify(body));return response({});
    }
    if(p==='/v1/apps/123')return response({id:'123',type:'apps',attributes:{bundleId:'com.example.app',primaryLocale:'en-US'}});if(p==='/v1/apps/123/appStoreVersions')return response([version]);if(p==='/v1/apps/123/appInfos')return response([info]);if(p==='/v1/appInfos/INFO/appInfoLocalizations')return response([]);if(p==='/v1/appStoreVersions/VERSION/appStoreVersionLocalizations')return response([{id:'LOC',type:'appStoreVersionLocalizations',attributes:{locale:'en-US'}}]);if(p==='/v1/appStoreVersionLocalizations/LOC/appScreenshotSets')return response([{id:'SET',type:'appScreenshotSets',attributes:{screenshotDisplayType:'APP_DESKTOP'}}]);if(p==='/v1/appScreenshotSets/SET/appScreenshots')return response([{id:'IMAGE',type:'appScreenshots',attributes:{fileName:'screen.png',fileSize:image.length,sourceFileChecksum:createHash('md5').update(image).digest('hex'),assetDeliveryState:{state:'COMPLETE'}}}]);if(p==='/v1/appScreenshotSets/SET/relationships/appScreenshots')return response([{id:'IMAGE',type:'appScreenshots'}]);if(p==='/v1/appStoreVersions/VERSION/appStoreReviewDetail')return response(review);
    if(p==='/v1/builds/BUILD')return response({id:'BUILD',type:'builds',attributes:{version:'42',processingState:'VALID',expired:false,usesNonExemptEncryption:false}});if(p==='/v1/builds/BUILD/app')return response({id:'123',type:'apps'});if(p==='/v1/builds/BUILD/preReleaseVersion')return response({id:'PRE',type:'preReleaseVersions',attributes:{platform:'MAC_OS',version:'1.0'}});if(p==='/v1/appStoreVersions/VERSION/build')return currentBuild?response({id:currentBuild,type:'builds'}):response({},404);if(p==='/v1/apps/123/reviewSubmissions')return response(submissions.map(({items:_,...item})=>item));if(p.startsWith('/v1/reviewSubmissions/')&&p.endsWith('/items'))return response(submissions.find(item=>p.includes(item.id))?.items??[]);
    if(p==='/v1/territories')return response([{id:'DEU',type:'territories',attributes:{currency:'EUR'}}]);if(p==='/v1/apps/123/appPriceSchedule')return response({id:'PRICE',type:'appPriceSchedules'});if(p==='/v1/appPriceSchedules/PRICE/baseTerritory')return response({id:'DEU',type:'territories'});if(p==='/v1/appPriceSchedules/PRICE/manualPrices')return response([{id:'P1',type:'appPrices',attributes:{startDate:null,endDate:null},relationships:{territory:related('territories','DEU'),appPricePoint:related('appPricePoints','ZERO')}}]);if(p==='/v1/appPriceSchedules/PRICE/automaticPrices')return response([]);if(p==='/v3/appPricePoints/ZERO')return response({id:'ZERO',type:'appPricePoints',attributes:{customerPrice:'0'},relationships:{territory:related('territories','DEU'),app:related('apps','123')}});if(p==='/v1/apps/123/appPricePoints')return response([{id:'ZERO',type:'appPricePoints',attributes:{customerPrice:'0'},relationships:{territory:related('territories','DEU'),app:related('apps','123')}}]);if(p==='/v1/apps/123/appAvailabilityV2')return response({id:'AVAILABLE',type:'appAvailabilities',attributes:{availableInNewTerritories:true}});if(p==='/v2/appAvailabilities/AVAILABLE/territoryAvailabilities')return response([{id:'TA',type:'territoryAvailabilities',attributes:{available:true,contentStatuses:['AVAILABLE_FOR_SALE_UNRELEASED_APP']},relationships:{territory:related('territories','DEU')}}]);throw new Error('Unexpected read '+url.href);
  }});
  const args={...selection,root};const reader=new SubmissionReader(args,[checkout],api,()=> 'account');const adapter=new SubmissionAdapter(args,reader,api);return {engine:new PlanEngine([checkout],true),adapter,submitPatches:()=>submitPatches};
}
for(const lostResponse of [false,true])test(`real submission reader verifies a ${lostResponse?'lost-response':'successful'} submit after the version becomes noneditable`,async t=>{const f=await realReaderFixture(t,lostResponse);const plan=await f.engine.create(f.adapter);const approval={planId:plan.planId as string,digest:plan.digest as string,operationIds:(plan.operations as any[]).map(op=>op.id),authorization:{confirmedByHost:true as const}};const journal=await f.engine.submit(approval,true);assert.equal(journal.state,'complete',JSON.stringify(journal));assert.equal(f.submitPatches(),1);assert.equal((await f.engine.create(f.adapter)).noOp,true);});
