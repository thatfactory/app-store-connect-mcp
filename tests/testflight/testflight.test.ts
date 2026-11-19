import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { mkdtemp, mkdir, realpath, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ApiClient } from '../../src/api/client.js';
import { TestFlightApi } from '../../src/api/resources/testflight.js';
import { registerTestFlight } from '../../src/tools/testflight.js';
import { registerPlanning } from '../../src/tools/planning.js';
import { PlanEngine } from '../../src/planning/engine.js';
import type { Adapter } from '../../src/planning/model.js';

const joinUrl = 'https://testflight.apple.com/join/FakeJoinCode';
const groupKey = 'candidates';
const groupName = 'External Candidates';
const bundleId = 'com.example.synthetic';
const builds = [{buildId:'build-ios',platform:'IOS'},{buildId:'build-tv',platform:'TV_OS'}];
const keyMap = {IOS:'iOS',TV_OS:'tvOS'};
const resource = (type:string, id:string, attributes?:Record<string,unknown>, relationships?:Record<string,unknown>) =>
  ({type,id,...(attributes?{attributes}:{}),...(relationships?{relationships}:{})});
type Resource = ReturnType<typeof resource>;
const relationship = (type:string, id:string) => ({data:{type,id}});
const doc = (data:unknown, extra:Record<string,unknown>={}) => Response.json({data,...extra});
const none = () => new Response(null,{status:204});
const code = (value:string) => ({code:value});

interface MockBuild {
  id:string; platform:string; app:string; version:string; processingState:string; expired:boolean;
  buildAudienceType:string | undefined; usesNonExemptEncryption:boolean | undefined;
  external:string; autoNotifyEnabled:boolean; review:string | null; localizations:Resource[];
}
function mockBuild(id:string, platform:string):MockBuild {
  return {id,platform,app:'1234',version:'1.0',processingState:'VALID',expired:false,buildAudienceType:'APP_STORE_ELIGIBLE',
    usesNonExemptEncryption:false,external:'READY_FOR_BETA_SUBMISSION',autoNotifyEnabled:false,review:null,localizations:[]};
}

async function fixture(t:TestContext, options:{missingGroup?:boolean; betaEnabled?:boolean}={}) {
  const checkout = await realpath(await mkdtemp(path.join(tmpdir(),'asc-testflight-')));
  const root = path.join(checkout,'AppStore');
  const save = async (file:string, data:unknown) => {
    const destination = path.join(root,file);
    await mkdir(path.dirname(destination),{recursive:true});
    await writeFile(destination,typeof data==='string'?data:JSON.stringify(data));
  };
  const group = (id:string, name:string, isInternalGroup:boolean) => resource('betaGroups',id,
    {name,isInternalGroup,publicLinkEnabled:false,publicLinkLimitEnabled:false,publicLinkLimit:250,publicLink:joinUrl},
    {app:relationship('apps','1234')});
  const groupManifest = (extra:Record<string,unknown>={}) => ({
    schemaVersion:1, groups:{[groupKey]:{name:groupName,...extra}},
  });
  await save('app.json',{schemaVersion:1,app:{bundleId,appStoreId:'1234',primaryLocale:'en-US'},platforms:['IOS','TV_OS'],localizations:['en-US','pt-BR']});
  await save('testflight/groups.json',groupManifest());
  const state = {
    groups:[group('internal','Internal',true),...(options.missingGroup?[]:[group('external',groupName,false)])],
    builds:new Map(builds.map(item=>[item.buildId,mockBuild(item.buildId,item.platform)])),
    members:new Set(['unmanaged-old-build']),
    appLocales:[resource('betaAppLocalizations','existing-en',{locale:'en-US',description:'Old',marketingUrl:'https://store.my-app.dev'}),
      resource('betaAppLocalizations','unmanaged-fr',{locale:'fr-FR',description:'French'})],
    review:resource('betaAppReviewDetails','review',{contactEmail:'obsolete@example.org',notes:'Old',demoAccountRequired:true}),
    writes:[] as {method:string;path:string;body:Record<string,any>}[],
    linkReads:0, autoReview:new Set<string>(), lostAttach:new Set<string>(), rejectedSubmit:false, pendingAttach:new Set<string>(), laterMembers:new Set<string>(),
  };
  state.builds.get('build-ios')!.localizations = [resource('betaBuildLocalizations','existing-note',{locale:'en-US',whatsNew:'Previous notes'}),
    resource('betaBuildLocalizations','old-note',{locale:'fr-FR',whatsNew:'Note française'})];

  function get(url:URL) {
    const route=url.pathname;
    if(route==='/v1/apps/1234') return doc(resource('apps','1234',{bundleId}));
    if(route==='/v1/apps/1234/betaGroups'){
      if (url.searchParams.has('cursor')) return doc(state.groups.slice(1));
      return doc(state.groups.slice(0,1),{links:{next:'/v1/apps/1234/betaGroups?cursor=next'}});
    }
    const found = state.groups.find(group => route===`/v1/betaGroups/${group.id}`);
    if(found){
      const link = url.searchParams.get('fields[betaGroups]')!.split(',').includes('publicLink');
      if(link)state.linkReads++;
      return doc(found); // Simulate a backend including the URL even without it in the sparse fieldset.
    }
    if(route==='/v1/betaGroups/external/builds') return doc([...state.members].map(id=>resource('builds',id)));
    if(route==='/v1/apps/1234/betaAppLocalizations') return doc(state.appLocales);
    if(route==='/v1/apps/1234/betaAppReviewDetail') return doc(state.review);
    if(route==='/v1/betaAppReviewSubmissions'){
      const build = state.builds.get(url.searchParams.get('filter[build]')!)!;
      return doc(build.review?[resource('betaAppReviewSubmissions',`review-${build.id}`,{betaReviewState:build.review},{build:relationship('builds',build.id)})]:[]);
    }
    const match = /^\/v1\/builds\/([^/]+)(?:\/(.+))?$/.exec(route);
    if(match){
      const build = state.builds.get(match[1]!)!;
      if(match[2]==='buildBetaDetail') return doc(resource('buildBetaDetails',`${build.id}-detail`,{autoNotifyEnabled:build.autoNotifyEnabled,externalBuildState:build.external}));
      if(match[2]==='betaBuildLocalizations') return doc(build.localizations);
      return doc(resource('builds',build.id,
        {version:'42',processingState:build.processingState,expired:build.expired,buildAudienceType:build.buildAudienceType,usesNonExemptEncryption:build.usesNonExemptEncryption},
        {app:relationship('apps',build.app),preReleaseVersion:relationship('preReleaseVersions','pre-release')}),
        {included:[resource('preReleaseVersions','pre-release',{platform:build.platform,version:build.version})]});
    }
    throw new Error('Unexpected mocked GET '+route);
  }

  const api = new TestFlightApi(new ApiClient({token:()=> 'fake-test-token'}, {readRetries:0, fetch:async (input,init)=>{
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    if(method==='GET')return get(url);
    const route=url.pathname;
    const body = JSON.parse(String(init?.body));
    state.writes.push({method,path:route,body});
    const data = body.data;
    if(route==='/v1/betaGroups'){
      state.groups.push(group('external',data.attributes.name,data.attributes.isInternalGroup));
      return doc(state.groups.at(-1));
    }
    if(route==='/v1/betaGroups/external'){
      Object.assign(state.groups.find(group=>group.id==='external')!.attributes!,data.attributes);
      return doc(state.groups.find(group=>group.id==='external'));
    }
    if(route==='/v1/betaGroups/external/relationships/builds'){
      const [item] = data;
      const build = state.builds.get(item.id)!;
      if(state.pendingAttach.has(build.id)){
        state.laterMembers.add(build.id);
        throw new Error('synthetic lost pending response');
      }
      state.members.add(build.id);
      if(state.autoReview.has(build.id)){build.external='WAITING_FOR_BETA_REVIEW';build.review='WAITING_FOR_REVIEW';}
      if(state.lostAttach.delete(build.id)) throw new Error('synthetic lost response');
      return none();
    }
    if(route==='/v1/betaAppReviewSubmissions'){
      if(state.rejectedSubmit)return Response.json({errors:[{code:'STATE_ERROR',detail:'private text or link '+joinUrl}]},{status:409});
      const build = state.builds.get(data.relationships.build.data.id)!;
      build.review='WAITING_FOR_REVIEW';
      build.external='WAITING_FOR_BETA_REVIEW';
      return doc(resource(data.type,`review-${build.id}`));
    }
    if(route==='/v1/buildBetaNotifications'){
      const build = state.builds.get(data.relationships.build.data.id)!;
      build.external='IN_BETA_TESTING';
      return doc(resource(data.type,'receipt'));
    }
    if(route.startsWith('/v1/buildBetaDetails/')){
      const build = [...state.builds.values()].find(item=>`${item.id}-detail`===data.id)!;
      build.autoNotifyEnabled=data.attributes.autoNotifyEnabled;
      return doc(resource(data.type,data.id,data.attributes));
    }
    if(route==='/v1/betaAppReviewDetails/review'){
      Object.assign(state.review.attributes!,data.attributes);
      return doc(state.review);
    }
    if(route.startsWith('/v1/betaAppLocalizations') || route.startsWith('/v1/betaBuildLocalizations')){
      const entries = route.startsWith('/v1/betaAppLocalizations') ? state.appLocales : method==='POST'
        ? state.builds.get(data.relationships.build.data.id)!.localizations
        : [...state.builds.values()].find(item => item.localizations.some(entry=>entry.id===data.id))!.localizations;
      if(method==='POST') entries.push(resource(data.type,`localization-${state.writes.length}`,data.attributes));
      else Object.assign(entries.find(entry=>entry.id===data.id)!.attributes!,data.attributes);
      return doc(method==='POST'?entries.at(-1):entries.find(entry=>entry.id===data.id));
    }
    throw new Error('Unexpected mocked write '+route);
  }}));
  const engine = new PlanEngine([checkout],true);
  const server = new McpServer({name:'testflight-test',version:'1.0.0'});
  registerPlanning(server,engine);
  registerTestFlight(server,{allowedRoots:[checkout],allowWrites:true,allowSubmission:true,allowBetaDistribution:options.betaEnabled??true},engine,api,()=> 'fixture-account');
  const client = new Client({name:'test',version:'1'});
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(async()=>{await client.close();await server.close();await rm(checkout,{recursive:true,force:true});});

  const call = async (name:string,args:Record<string,unknown>) => {
    const response = await client.callTool({name,arguments:args});
    assert.ok(response.structuredContent,JSON.stringify(response));
    return response.structuredContent as Record<string,any>;
  };
  const configuration = (args:Record<string,unknown>={groups:[groupKey]}) => call('plan_testflight_configuration',{root,...args});
  const distribution = (args:Record<string,unknown>={action:'attach',builds}) => call('plan_testflight_distribution',{root,groupKey,...args});
  const inventory = (args:Record<string,unknown>={}) => call('get_testflight_state',{root,groupKey,...args});
  const link = () => call('get_testflight_join_link',{root,groupKey});
  const notes = (locales = ['en-US']) => Promise.all(builds.flatMap(({platform})=>locales.map(locale=>
    save(`testflight/build-notes/${keyMap[platform as keyof typeof keyMap]}/1.0/${locale}.txt`,`Test on ${platform} in ${locale}.\n`))));
  return {root, state, call, configuration, distribution, inventory, link, notes, save, groupManifest, engine, group};
}
const approval = (plan:Record<string,any>) => ({
  planId:plan.planId,digest:plan.digest,operationIds:plan.operations.map((item:{id:string})=>item.id),authorization:{confirmedByHost:true},
});

test('creates a disabled external group, adopts the exact identity and detects absence, collisions and name drift',async t=>{
  const f=await fixture(t,{missingGroup:true});
  assert.equal((await f.inventory()).group,null);
  assert.equal((await f.link()).code,'betaGroupMissing');
  const internal=f.state.groups.pop()!;
  assert.equal((await f.configuration()).code,'internalBetaGroupRequired');
  f.state.groups.push(internal);
  await f.save('testflight/groups.json',f.groupManifest({publicLink:{enabled:true,testerLimit:10}}));
  const plan=await f.configuration();
  assert.deepEqual(plan.operations[0].after,{name:groupName,isInternalGroup:false,publicLinkEnabled:false});
  assert.equal((await f.call('apply_plan',approval(plan))).state,'complete');
  assert.deepEqual(f.state.writes[0],{method:'POST',path:'/v1/betaGroups',body:{data:{
    type:'betaGroups',attributes:{name:groupName,isInternalGroup:false,publicLinkEnabled:false},relationships:{app:relationship('apps','1234')},
  }}});
  assert.equal((await f.configuration()).summary.groups[0].existing.id,'external');
  assert.equal((await f.configuration()).noOp,true);
  assert.equal((await f.link()).joinLink,null);
  await f.save('testflight/groups.json',f.groupManifest({groupId:'external'}));
  const external=f.state.groups.at(-1)!;
  external.attributes!.name='Renamed';
  assert.equal((await f.configuration()).code,'betaGroupIdentityMismatch');
  external.attributes!.name=groupName;
  f.state.groups.push(f.group('duplicate',groupName,false));
  assert.equal((await f.configuration()).code,'ambiguousBetaGroup');
  f.state.groups.pop();
  external.attributes!.isInternalGroup=true;
  assert.equal((await f.configuration()).code,'internalBetaGroupCollision');
  assert.equal(f.state.writes.length,1);
});

test('updates selected beta metadata, keeps omitted values and locales, and excludes private values and links from artifacts',async t=>{
  const f=await fixture(t);
  const envKeys=['APPSTORE_REVIEW_EMAIL','APPSTORE_TESTFLIGHT_FEEDBACK_EMAIL'];
  const original=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
  t.after(()=>{for(const key of envKeys)if(original[key]===undefined)delete process.env[key];else process.env[key]=original[key];});
  process.env.APPSTORE_REVIEW_EMAIL='private-reviewer@example.org';
  process.env.APPSTORE_TESTFLIGHT_FEEDBACK_EMAIL='private-feedback@example.org';
  await f.save('testflight/localizations/en-US.json',{description:'Real beta text',feedbackEmail:{env:'APPSTORE_TESTFLIGHT_FEEDBACK_EMAIL'}});
  await f.save('testflight/review.json',{contactEmail:{env:'APPSTORE_REVIEW_EMAIL'}});
  await f.save('testflight/review-notes.txt','Use the first screen.\n');
  const args={groups:[groupKey],locales:['en-US'],review:true};
  assert.equal((await f.configuration({...args,locales:['pt-BR']})).code,'invalidRepository');
  const plan=await f.configuration(args);
  assert.equal(plan.operations.length,2);
  assert.ok(plan.operations.every((item:{sensitive:boolean})=>item.sensitive));
  const journal=await f.call('apply_plan',approval(plan));
  assert.equal(journal.state,'complete');
  const recorded=[plan,journal,await readFile(plan.planPath,'utf8'),
    await readFile(plan.planPath.replace('.plan.json','.journal.json'),'utf8'),await f.inventory()];
  assert.doesNotMatch(JSON.stringify(recorded),/private-reviewer|private-feedback|obsolete@example|FakeJoinCode/);
  assert.equal(f.state.linkReads,0);
  assert.equal(f.state.appLocales[0]!.attributes!.marketingUrl,'https://store.my-app.dev');
  assert.equal(f.state.appLocales[1]!.attributes!.description,'French');
  assert.equal(f.state.review.attributes!.demoAccountRequired,true);
  assert.equal(f.state.review.attributes!.notes,'Use the first screen.');
  assert.equal((await f.configuration(args)).noOp,true);
});

test('attaches iOS and tvOS exact builds after notes and auto-notify, reports Apple-started review, and never replays a lost response',async t=>{
  const f=await fixture(t);
  await f.notes();
  f.state.autoReview.add('build-ios');
  f.state.lostAttach.add('build-ios');
  const args={action:'attach',builds:[{...builds[0],autoNotifyEnabled:true},builds[1]],locales:['en-US']};
  const plan=await f.distribution(args);
  const approved=approval(plan);
  assert.equal(plan.summary.builds[0].version,'1.0');
  assert.equal(plan.summary.builds[0].buildNumber,'42');
  assert.equal(plan.summary.builds[1].platform,'TV_OS');
  assert.equal(plan.summary.builds[0].audience,'APP_STORE_ELIGIBLE');
  assert.equal((await f.call('apply_plan',approved)).code,'betaDistributionForbidden');
  assert.equal((await f.call('apply_testflight_distribution',{...approved,digest:'0'.repeat(64)})).code,'stalePlan');
  const iosMembership=plan.operations.find((item:{key:string})=>item.key==='build:build-ios:membership');
  assert.equal((await f.call('apply_testflight_distribution',{...approved,operationIds:[iosMembership.id]})).code,'missingDependency');
  const journal=await f.call('apply_testflight_distribution',approved);
  assert.equal(journal.state,'complete');
  assert.equal(journal.operations.find((entry:{id:string})=>entry.id===iosMembership.id).state,'reconciled');
  assert.deepEqual(f.state.writes.map(write=>[write.method,write.path]),[
    ['PATCH','/v1/betaBuildLocalizations/existing-note'],['PATCH','/v1/buildBetaDetails/build-ios-detail'],
    ['POST','/v1/betaGroups/external/relationships/builds'],['POST','/v1/betaBuildLocalizations'],
    ['POST','/v1/betaGroups/external/relationships/builds'],
  ]);
  assert.deepEqual(f.state.writes[2]!.body,{data:[{type:'builds',id:'build-ios'}]});
  assert.deepEqual(f.state.writes[4]!.body,{data:[{type:'builds',id:'build-tv'}]});
  assert.deepEqual([...f.state.members],['unmanaged-old-build','build-ios','build-tv']);
  assert.equal(f.state.builds.get('build-ios')!.localizations[1]!.attributes!.whatsNew,'Note française');
  assert.equal(journal.testflight.builds[0].waitingForReview,true);
  assert.equal(journal.testflight.builds[0].review.state,'WAITING_FOR_REVIEW');
  assert.equal(journal.testflight.builds[0].readyForTesters,false);
  assert.equal(journal.testflight.builds[1].inSelectedGroup,true);
  assert.equal((await f.distribution({action:'submit',build:builds[0]})).noOp,true);
  assert.equal((await f.distribution(args)).noOp,true);
  assert.equal((await f.call('apply_testflight_distribution',approved)).code,'planConsumed');
  assert.equal(f.state.writes.length,5);
});

test('distributes exact macOS and visionOS builds and accepts iPad and Watch builds reported as IOS',async t=>{
  const f=await fixture(t);
  const targets = [
    {buildId:'build-mac',platform:'MAC_OS',directory:'macOS'},
    {buildId:'build-vision',platform:'VISION_OS',directory:'visionOS'},
    {buildId:'build-ipad',platform:'IOS',directory:'iOS'},
    {buildId:'build-watch',platform:'IOS',directory:'iOS'},
  ];
  await f.save('app.json',{
    schemaVersion:1, app:{bundleId,appStoreId:'1234',primaryLocale:'en-US'},
    platforms:['IOS','MAC_OS','TV_OS','VISION_OS'], localizations:['en-US'],
  });
  for (const {buildId, platform, directory} of targets) {
    f.state.builds.set(buildId,mockBuild(buildId,platform));
    await f.save(`testflight/build-notes/${directory}/1.0/en-US.txt`,`Test the ${directory} build.`);
  }
  const selected = targets.map(({buildId,platform})=>({buildId,platform}));
  const args = {action:'attach',builds:selected,locales:['en-US']};
  const plan = await f.distribution(args);
  assert.deepEqual(plan.summary.builds.map(({id,platform}:{id:string;platform:string})=>({buildId:id,platform})),selected);
  const journal = await f.call('apply_testflight_distribution',approval(plan));
  assert.equal(journal.state,'complete');
  for (const {buildId, directory} of targets) {
    assert.equal(f.state.members.has(buildId),true);
    assert.equal(f.state.builds.get(buildId)!.localizations[0]?.attributes?.whatsNew,`Test the ${directory} build.`);
  }
  assert.equal((await f.distribution(args)).noOp,true);
});

test('submits only an attached ready build, and treats Apple approval and actual tester availability separately',async t=>{
  const f=await fixture(t);
  const build=builds[0];
  assert.equal((await f.distribution({action:'submit',build})).code,'betaBuildMembershipRequired');
  f.state.members.add('build-ios');
  const planned=await f.distribution({action:'submit',build});
  const approved=approval(planned);
  f.state.rejectedSubmit=true;
  const rejected=await f.call('apply_testflight_distribution', approved);
  assert.deepEqual(rejected.operations[0].validationErrors,[code('STATE_ERROR')]);
  assert.equal(rejected.operations[0].state,'failed');
  assert.doesNotMatch(JSON.stringify(rejected),/FakeJoinCode|private text/);
  assert.equal((await f.call('apply_testflight_distribution',approved)).code,'planConsumed');
  f.state.rejectedSubmit=false;
  const second=await f.distribution({action:'submit',build});
  const submitted=await f.call('apply_testflight_distribution',approval(second));
  assert.equal(submitted.testflight.builds[0].waitingForReview,true);
  assert.deepEqual(f.state.writes.at(-1)?.body,{data:{type:'betaAppReviewSubmissions',relationships:{build:relationship('builds','build-ios')}}});
  const apple=f.state.builds.get('build-ios')!;
  apple.review='APPROVED';
  apple.external='BETA_APPROVED';
  assert.equal((await f.inventory({builds:[build]})).builds[0].readyForTesters,false);
  const notify=await f.distribution({action:'notify',build});
  apple.autoNotifyEnabled=true;
  assert.equal((await f.call('apply_testflight_distribution',approval(notify))).code,'stalePlan');
  assert.equal((await f.distribution({action:'notify',build})).code,'betaNotificationBlocked');
  apple.autoNotifyEnabled=false;
  const notification=await f.call('apply_testflight_distribution',approval(await f.distribution({action:'notify',build})));
  assert.equal(notification.testflight.builds[0].readyForTesters,true);
  assert.equal(notification.testflight.builds[0].review.state,'APPROVED');
  assert.deepEqual(f.state.writes.at(-1)?.body,{data:{type:'buildBetaNotifications',relationships:{build:relationship('builds','build-ios')}}});
  assert.equal((await f.distribution({action:'notify',build})).noOp,true);
});

test('pending lost attachment stops later writes until status can reconcile the membership',async t=>{
  const f=await fixture(t);
  f.state.pendingAttach.add('build-ios');
  const plan=await f.distribution();
  const approved=approval(plan);
  const journal=await f.call('apply_testflight_distribution',approved);
  assert.equal(journal.state,'partial');
  assert.deepEqual(journal.operations.map((entry:{state:string})=>entry.state),['outcomeUnknown','notStarted']);
  assert.equal((await f.call('apply_testflight_distribution',approved)).code,'planConsumed');
  assert.equal(f.state.writes.length,1);
  f.state.members.add([...f.state.laterMembers][0]!);
  const status=await f.call('get_operation_status',{planId:plan.planId,poll:true});
  assert.equal(status.operations[0].state,'reconciled');
  assert.equal(f.state.writes.length,1);
  assert.equal((await f.distribution()).operations.length,1);
});

test('public link policy works with zero installable builds and can be disabled without build reads or limit changes',async t=>{
  const f=await fixture(t);
  assert.equal((await f.distribution({action:'publicLink'})).code,'publicLinkUnmanaged');
  await f.save('testflight/groups.json',f.groupManifest({publicLink:{enabled:true,testerLimit:10}}));
  const plan=await f.distribution({action:'publicLink'});
  assert.doesNotMatch(JSON.stringify(plan),/FakeJoinCode|unmanaged-old-build/);
  const journal=await f.call('apply_testflight_distribution',approval(plan));
  assert.equal(journal.state,'complete');
  assert.equal(journal.testflight.group.publicLinkEnabled,true);
  assert.equal(f.state.linkReads,0);
  assert.deepEqual((await f.inventory()).builds,[]);
  assert.equal((await f.link()).joinLink,joinUrl);
  assert.equal(f.state.linkReads,1);
  assert.equal((await f.distribution({action:'publicLink'})).noOp,true);
  await f.save('testflight/groups.json',f.groupManifest({publicLink:{enabled:false}}));
  const disabled=await f.call('apply_testflight_distribution',approval(await f.distribution({action:'publicLink'})));
  assert.equal(disabled.state,'complete');
  assert.deepEqual(f.state.writes.at(-1)?.body.data.attributes,{publicLinkEnabled:false});
  assert.equal((await f.link()).joinLink,null);
});

test('rejects ineligible or ambiguous builds and input drift before dispatch',async t=>{
  const f=await fixture(t);
  const apple=f.state.builds.get('build-ios')!;
  const args={action:'attach',builds:[builds[0]]};
  for(const [key,value,expected] of [
    ['expired',true,'betaBuildBlocked'],['processingState','PROCESSING','betaBuildBlocked'],
    ['buildAudienceType','INTERNAL_ONLY','betaBuildBlocked'],['buildAudienceType',undefined,'incompleteSnapshot'],
    ['usesNonExemptEncryption',undefined,'betaBuildBlocked'],['usesNonExemptEncryption',true,'betaBuildBlocked'],
    ['external','UNRECOGNIZED','incompleteSnapshot'],['app','9999','wrongBuild'],['platform','TV_OS','wrongBuildPlatform'],
  ] as const){
    const prior=apple[key];
    Object.assign(apple,{[key]:value});
    assert.equal((await f.distribution(args)).code,expected,key);
    Object.assign(apple,{[key]:prior});
  }
  await f.notes();
  const plan=await f.distribution({...args,locales:['en-US']});
  await f.save('testflight/build-notes/iOS/1.0/en-US.txt','Different valid text.');
  assert.equal((await f.call('apply_testflight_distribution',approval(plan))).code,'stalePlan');
  assert.equal(f.state.writes.length,0);
});

test('requires the beta gate and denies production or ordinary plans in the beta executor',async t=>{
  const f=await fixture(t,{betaEnabled:false});
  assert.equal((await f.call('apply_testflight_distribution',approval(await f.distribution()))).code,'betaDistributionDisabled');
  const adapter:Adapter = {
    domain:'submission',
    capture:async()=>({root:f.root,target:{appId:'1234'},credentialContext:'fixture-account',inputs:{},secretFingerprint:'none',rulesVersion:'test',remote:{}}),
    propose:()=>[{id:'submit',domain:'submission',kind:'submission',key:'submit',scope:'1234',dependencies:[],affects:['submit'],sensitive:false}],
    execute:async()=>{throw new Error('Unexpected production submission.');},
    verify:()=>false,
  };
  await assert.rejects(f.engine.distributeBeta(approval(await f.engine.create(adapter)) as never,true),code('invalidBetaDistributionApproval'));
  const beta=approval(await f.distribution());
  await assert.rejects(f.engine.submit(beta as never,true),code('betaDistributionForbidden'));
  assert.equal(f.state.writes.length,0);
});
