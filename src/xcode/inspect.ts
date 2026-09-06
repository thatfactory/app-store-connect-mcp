import { execFile } from 'node:child_process';
import path from 'node:path';
import { z } from 'zod';
import { RepositoryFiles,safeRelative } from '../repository/files.js';
import { AppStoreError } from '../errors.js';
export const inspectSchema=z.object({root:z.string().min(1),project:z.string().endsWith('.xcodeproj'),workspace:z.string().endsWith('.xcworkspace').optional(),target:z.string().min(1),configuration:z.string().min(1),platform:z.enum(['MAC_OS','IOS','TV_OS','VISION_OS'])}).strict();
type Dictionary=Record<string,unknown>;
function dict(value:unknown):Dictionary{if(!value||typeof value!=='object'||Array.isArray(value))throw new AppStoreError('invalidProject','Expected a static project dictionary.');return value as Dictionary;}
function text(value:unknown):string|undefined{return typeof value==='string'?value:undefined;}
export async function decodePlist(bytes:Buffer,signal?:AbortSignal):Promise<unknown>{
  if(process.platform!=='darwin')throw new AppStoreError('inspectionUnavailable','Static Xcode inspection uses Apple plutil on macOS; other server features remain available.');
  if(bytes.includes(Buffer.from('<!ENTITY')))throw new AppStoreError('invalidProject','Custom XML entities are not supported.');
  return new Promise((resolve,reject)=>{
    const child=execFile('/usr/bin/plutil',['-convert','json','-o','-','--','-'],{timeout:5000,maxBuffer:2_097_152,...(signal?{signal}:{})},(error,stdout)=>{
      if(error){reject(new AppStoreError('invalidProject','Apple plutil could not decode the bounded static plist.'));return;}
      try{resolve(JSON.parse(stdout));}catch{reject(new AppStoreError('invalidProject','Invalid static plist output.'));}
    });
    child.stdin?.on('error',()=>{});child.stdin?.end(bytes);
  });
}
export const capabilityMappingVersion='1';
const mapping:Record<string,{capability:string;confidence:'high'|'requiresSetup';setup?:string}>={
  'aps-environment':{capability:'PUSH_NOTIFICATIONS',confidence:'high'},
  'com.apple.developer.aps-environment':{capability:'PUSH_NOTIFICATIONS',confidence:'high'},
  'com.apple.developer.associated-domains':{capability:'ASSOCIATED_DOMAINS',confidence:'high'},
  'com.apple.developer.game-center':{capability:'GAME_CENTER',confidence:'high'},
  'com.apple.developer.applesignin':{capability:'APPLE_ID_AUTH',confidence:'requiresSetup',setup:'Review Sign in with Apple primary/group configuration.'},
  'com.apple.security.application-groups':{capability:'APP_GROUPS',confidence:'requiresSetup',setup:'Register and associate the exact App Group identifiers manually.'},
  'com.apple.developer.icloud-container-identifiers':{capability:'ICLOUD',confidence:'requiresSetup',setup:'Register and associate the exact iCloud containers manually.'},
  'com.apple.developer.in-app-payments':{capability:'APPLE_PAY',confidence:'requiresSetup',setup:'Merchant identifiers and certificates need separate setup.'},
};
export function mapEntitlements(entitlements:Dictionary):{proposals:unknown[];sandboxOnly:string[];unresolved:string[]}{
  const proposals:unknown[]=[];const sandboxOnly:string[]=[];const unresolved:string[]=[];
  for(const key of Object.keys(entitlements).sort()){
    const rule=mapping[key];
    if(rule){if(entitlements[key]!==false)proposals.push({...rule,entitlement:key,provenance:'Static entitlement key; proposal only, not proof of portal state.'});}
    else if(['com.apple.security.app-sandbox','com.apple.security.network.client','com.apple.security.network.server','com.apple.security.files.user-selected.read-only','com.apple.security.files.user-selected.read-write','com.apple.security.files.downloads.read-only','com.apple.security.files.downloads.read-write','com.apple.security.device.audio-input','com.apple.security.device.camera','com.apple.security.device.usb','com.apple.security.print'].includes(key))sandboxOnly.push(key);
    else if(!['application-identifier','com.apple.application-identifier','com.apple.developer.team-identifier','get-task-allow','keychain-access-groups'].includes(key))unresolved.push(key);
  }
  return {proposals,sandboxOnly,unresolved};
}
export async function inspectXcode(input:z.infer<typeof inspectSchema>,allowedRoots:readonly string[],signal?:AbortSignal,decode=decodePlist):Promise<Record<string,unknown>>{
  const args=inspectSchema.parse(input);if(!safeRelative(args.project))throw new AppStoreError('unsafePath','Select a contained project path.');
  const files=await RepositoryFiles.create(args.root,allowedRoots,signal);const filename=`${args.project}/project.pbxproj`;
  const workspaceGaps:string[]=[];
  if(args.workspace){
    if(!safeRelative(args.workspace))throw new AppStoreError('unsafePath','Select a contained workspace path.');
    const xml=new TextDecoder('utf-8',{fatal:true}).decode((await files.read(`${args.workspace}/contents.xcworkspacedata`,true))!);
    if(/<!ENTITY|<!DOCTYPE/.test(xml))throw new AppStoreError('invalidProject','Workspace entity declarations are unsupported.');
    const refs=[...xml.matchAll(/<FileRef\s+location\s*=\s*"([^"]+)"/g)].map(match=>match[1]!);
    const direct=refs.some(ref=>ref.startsWith('group:')&&path.normalize(path.join(path.dirname(args.workspace!),ref.slice(6)))===path.normalize(args.project));
    if(!direct||/<Group\b/.test(xml))workspaceGaps.push('Workspace membership or nested groups require manual resolution; explicit project inspected independently.');
  }
  const project=dict(await decode((await files.read(filename,true))!,signal));const objects=dict(project.objects);
  const candidates=Object.entries(objects).filter(([,value])=>{const o=dict(value);return o.isa==='PBXNativeTarget'&&o.name===args.target;});
  if(candidates.length!==1)throw new AppStoreError('targetSelectionRequired','Select one exact native target; duplicate names are ambiguous.');
  const [targetId,targetValue]=candidates[0]!;const target=dict(targetValue);const productType=text(target.productType);
  if(!['com.apple.product-type.application','com.apple.product-type.app-extension'].includes(productType??''))throw new AppStoreError('unsupportedTarget','Select an app or an explicitly included app extension, not tests or frameworks.');
  const projectObject=dict(objects[text(project.rootObject)??'']);const unresolved:string[]=[...workspaceGaps];const provenance:string[]=[];
  function settings(owner:Dictionary,scope:string):Dictionary{
    const list=dict(objects[text(owner.buildConfigurationList)??'']);if(!Array.isArray(list.buildConfigurations))throw new AppStoreError('invalidProject','Missing build configuration list.');
    const matches=list.buildConfigurations.map(id=>dict(objects[String(id)])).filter(config=>config.name===args.configuration);
    if(matches.length!==1)throw new AppStoreError('configurationSelectionRequired','Select an exact configuration present in project and target.');
    const config=matches[0]!;
    if(config.baseConfigurationReference)unresolved.push(`${scope}: external xcconfig settings require manual resolution`);
    const result=dict(config.buildSettings??{});
    if(Object.keys(result).some(key=>key.includes('[')))unresolved.push(`${scope}: conditional build settings require manual resolution`);
    provenance.push(`${filename}:${scope}:${args.configuration}`);return result;
  }
  const values={...settings(projectObject,'project'),...settings(target,`target ${targetId}`),SRCROOT:path.dirname(path.join(files.root,args.project)),PROJECT_DIR:path.dirname(path.join(files.root,args.project)),TARGET_NAME:args.target};
  function resolve(key:string,seen:string[]=[]):string|undefined{
    if(seen.includes(key)||seen.length>=20){unresolved.push(`${key}: cyclic or deep substitution`);return undefined;}
    const value=values[key as keyof typeof values];if(typeof value!=='string'){if(value!==undefined)unresolved.push(`${key}: non-string value`);return undefined;}
    let missing=false;const expanded=value.replace(/\$\(([^)]+)\)|\$\{([^}]+)\}/g,(_match,a:string,b:string)=>{const name=a??b;const replacement=resolve(name,[...seen,key]);if(replacement===undefined){missing=true;unresolved.push(`${key}: unresolved ${name}`);}return replacement??'';});
    if(missing||expanded.includes('$'))return undefined;return expanded;
  }
  const bundleIdentifier=resolve('PRODUCT_BUNDLE_IDENTIFIER');const team=resolve('DEVELOPMENT_TEAM');const sdk=resolve('SDKROOT');
  const expected={MAC_OS:'macosx',IOS:'iphoneos',TV_OS:'appletvos',VISION_OS:'xros'}[args.platform];
  const supported=resolve('SUPPORTED_PLATFORMS')?.split(/\s+/);
  if((sdk&&sdk!=='auto'&&sdk!==expected)||(supported&&!supported.includes(expected)))throw new AppStoreError('platformMismatch','Explicit platform does not match the selected static SDKROOT.');
  if((!sdk||sdk==='auto')&&!supported?.includes(expected))unresolved.push('SDKROOT: platform cannot be confirmed statically');
  const entitlementsPath=resolve('CODE_SIGN_ENTITLEMENTS');let entitlements:Dictionary={};
  if(entitlementsPath){const relative=path.relative(files.root,path.resolve(path.dirname(path.join(files.root,args.project)),entitlementsPath));if(!safeRelative(relative))throw new AppStoreError('unsafePath','Entitlements must remain in the approved checkout.');entitlements=dict(await decode((await files.read(relative,true))!,signal));provenance.push(relative);}
  const capabilities=mapEntitlements(entitlements);
  return {project:args.project,target:args.target,targetId,productType,configuration:args.configuration,platform:args.platform,
    ...(bundleIdentifier?{bundleIdentifier}:{}),...(team?{developmentTeam:team}:{}),issuerIdIsNotDevelopmentTeam:true,
    ...(unresolved.length?{valuesAreProvisional:true}:{}),unresolved:[...new Set(unresolved)],provenance,sourceHashes:files.hashes,
    capabilityMappingVersion,capabilities,sandboxEnabled:resolve('ENABLE_APP_SANDBOX')==='YES',projectModified:false,
    limitations:['Static inspection only; no xcodebuild or dependency resolution.','External xcconfig and conditional build settings are not evaluated; resolve reported gaps before registration.','Inspection proposals never automatically include other targets or mutate project files.']};
}
