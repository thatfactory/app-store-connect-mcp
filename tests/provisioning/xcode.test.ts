import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,realpath,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {inspectXcode,mapEntitlements,decodePlist} from '../../src/xcode/inspect.js';
async function fixture(t:test.TestContext){
  const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'asc-xcode-')));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(path.join(root,'App.xcodeproj'));
  const objects:Record<string,any>={ROOT:{isa:'PBXProject',buildConfigurationList:'PC'},APP:{isa:'PBXNativeTarget',name:'App',productType:'com.apple.product-type.application',buildConfigurationList:'TC'},EXT:{isa:'PBXNativeTarget',name:'Extension',productType:'com.apple.product-type.app-extension',buildConfigurationList:'TC'},TEST:{isa:'PBXNativeTarget',name:'Tests',productType:'com.apple.product-type.bundle.unit-test',buildConfigurationList:'TC'},PC:{buildConfigurations:['P']},TC:{buildConfigurations:['T']},P:{name:'Release',buildSettings:{SDKROOT:'auto',SUPPORTED_PLATFORMS:'macosx',PREFIX:'com.test',DEVELOPMENT_TEAM:'TEAM123'}},T:{name:'Release',buildSettings:{PRODUCT_BUNDLE_IDENTIFIER:'$(PREFIX).${TARGET_NAME}',CODE_SIGN_ENTITLEMENTS:'App.entitlements',ENABLE_APP_SANDBOX:'YES'}}};
  const filename=path.join(root,'App.xcodeproj/project.pbxproj');const save=async()=>{await writeFile(filename,JSON.stringify({rootObject:'ROOT',objects}));};await save();
  await writeFile(path.join(root,'App.entitlements'),JSON.stringify({'com.apple.security.app-sandbox':true,'com.apple.developer.associated-domains':['applinks:test.invalid'],'com.apple.unknown':true}));
  const args={root,project:'App.xcodeproj',target:'App',configuration:'Release',platform:'MAC_OS'} as const;
  const inspect=()=>inspectXcode(args,[root],undefined,async bytes=>JSON.parse(bytes.toString()));return {root,objects,filename,save,args,inspect};
}
test('exact app target and configuration resolve known variables with provenance and no mutation',async t=>{
  const f=await fixture(t);const before=await readFile(f.filename);const result=await f.inspect();assert.equal(result.bundleIdentifier,'com.test.App');assert.equal(result.developmentTeam,'TEAM123');assert.equal(result.issuerIdIsNotDevelopmentTeam,true);assert.equal(result.sandboxEnabled,true);assert.deepEqual(result.unresolved,[]);assert.ok(Array.isArray(result.provenance));assert.deepEqual(await readFile(f.filename),before);
});
test('extensions require explicit selection; test target, wrong configuration and platform fail',async t=>{
  const f=await fixture(t);const decode=async(bytes:Buffer)=>JSON.parse(bytes.toString());const result=await inspectXcode({...f.args,target:'Extension'},[f.root],undefined,decode);assert.equal(result.productType,'com.apple.product-type.app-extension');
  await assert.rejects(inspectXcode({...f.args,target:'Tests'},[f.root],undefined,decode),/not tests/);
  await assert.rejects(inspectXcode({...f.args,configuration:'Debug'},[f.root],undefined,decode),/exact configuration/);
  await assert.rejects(inspectXcode({...f.args,platform:'IOS'},[f.root],undefined,decode),/platform/);
});
test('cycles, unresolved substitutions, conditional and external settings are provisional',async t=>{
  const f=await fixture(t);f.objects.T.buildSettings.PRODUCT_BUNDLE_IDENTIFIER='$(MISSING)';f.objects.T.buildSettings['OTHER[sdk=macosx*]']='value';f.objects.T.baseConfigurationReference='external';await f.save();const result=await f.inspect();assert.equal(result.bundleIdentifier,undefined);assert.equal(result.valuesAreProvisional,true);assert.ok((result.unresolved as string[]).length>=3);
  f.objects.T.buildSettings.PRODUCT_BUNDLE_IDENTIFIER='$(PRODUCT_BUNDLE_IDENTIFIER)';await f.save();assert.equal((await f.inspect()).bundleIdentifier,undefined);
});
test('unknown entitlements remain unresolved and sandbox permissions do not become capabilities',()=>{
  const result=mapEntitlements({'com.apple.security.network.client':true,'com.apple.security.unknown':true,'com.apple.security.application-groups':['group.test'],'aps-environment':'production'});
  assert.deepEqual(result.sandboxOnly,['com.apple.security.network.client']);assert.deepEqual(result.unresolved,['com.apple.security.unknown']);assert.equal(result.proposals.length,2);assert.ok(JSON.stringify(result.proposals).includes('requiresSetup'));
});
test('entitlement traversal and malformed plist fail without evaluating project tools',async t=>{
  const f=await fixture(t);f.objects.T.buildSettings.CODE_SIGN_ENTITLEMENTS='../outside';await f.save();await assert.rejects(f.inspect(),/approved checkout/);
  if(process.platform==='darwin')await assert.rejects(decodePlist(Buffer.from('not a plist')),/could not decode/);
});
test('native Apple static decoder supports synthetic project without Xcode execution',{skip:process.platform!=='darwin'},async t=>{
  const f=await fixture(t);const result=await inspectXcode(f.args,[f.root]);assert.equal(result.bundleIdentifier,'com.test.App');assert.equal(result.projectModified,false);
});
test('workspace input is bounded and unresolved membership is reported',async t=>{
  const f=await fixture(t);await mkdir(path.join(f.root,'App.xcworkspace'));const file=path.join(f.root,'App.xcworkspace/contents.xcworkspacedata');await writeFile(file,'<Workspace><FileRef location="group:App.xcodeproj"></FileRef></Workspace>');
  const decode=async(bytes:Buffer)=>JSON.parse(bytes.toString());const args={...f.args,workspace:'App.xcworkspace'};assert.deepEqual((await inspectXcode(args,[f.root],undefined,decode)).unresolved,[]);
  await writeFile(file,'<Workspace><Group location="group:Other"><FileRef location="group:App.xcodeproj"></FileRef></Group></Workspace>');assert.equal((await inspectXcode(args,[f.root],undefined,decode)).valuesAreProvisional,true);
});

test('nested project entitlement paths resolve relative to the selected project directory',async t=>{
  const f=await fixture(t);await mkdir(path.join(f.root,'Nested/App.xcodeproj'),{recursive:true});
  await writeFile(path.join(f.root,'Nested/App.xcodeproj/project.pbxproj'),await readFile(f.filename));
  await writeFile(path.join(f.root,'Nested/App.entitlements'),JSON.stringify({'aps-environment':'production'}));
  const r=await inspectXcode({...f.args,project:'Nested/App.xcodeproj'},[f.root],undefined,async bytes=>JSON.parse(bytes.toString()));
  assert.ok(JSON.stringify(r.capabilities).includes('PUSH_NOTIFICATIONS'));assert.ok(!JSON.stringify(r.capabilities).includes('ASSOCIATED_DOMAINS'));
});
