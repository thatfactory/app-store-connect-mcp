import { z } from 'zod';
import { realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { ApiClient } from '../api/client.js';
import { resource } from '../api/resources/discovery.js';
import { AppStoreError } from '../errors.js';
import { provisioningSchema,type AppManifest } from '../repository/schemas.js';
import { validateRepository } from '../repository/validate.js';
import { canonical,type Adapter,type Snapshot,type Operation,type Json } from '../planning/model.js';
export const provisioningSelection=z.object({root:z.string().min(1),identifiers:z.array(z.string().regex(/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/)).min(1).max(20)}).strict();
type Identifier=z.infer<typeof provisioningSchema>['primaryBundleId']&{identifier:string};
const capabilityTypes=provisioningSchema.shape.primaryBundleId.shape.capabilities.element.shape.capabilityType.options;
interface ProvisioningSnapshot extends Snapshot{desired:Identifier[]}
const supported=new Set(['PUSH_NOTIFICATIONS','GAME_CENTER','ASSOCIATED_DOMAINS','IN_APP_PURCHASE','DATA_PROTECTION']);
const opId=(key:string)=>`provision-${createHash('sha256').update(key).digest('hex').slice(0,24)}`;
function object(value:Json|undefined):Record<string,Json>|undefined{return value&&typeof value==='object'&&!Array.isArray(value)?value:undefined;}
function matches(actual:Json|undefined,desired:Json|undefined):boolean{const expected=object(desired);const remote=object(actual);return !!expected&&!!remote&&Object.keys(expected).every(key=>canonical(remote[key])===canonical(expected[key]));}
function normalizeSettings(value:unknown):Json{
  if(value==null)return null;
  if(!Array.isArray(value)||value.length>10)throw new AppStoreError('invalidResponse','Capability settings are malformed.');
  const settings=value.map(setting=>{
    if(!setting||typeof setting.key!=='string'||!Array.isArray(setting.options)||setting.options.length>20)throw new AppStoreError('invalidResponse','Capability setting is malformed.');
    if(!['ICLOUD_VERSION','DATA_PROTECTION_PERMISSION_LEVEL','APPLE_ID_AUTH_APP_CONSENT'].includes(setting.key))throw new AppStoreError('invalidResponse','Unknown capability setting key.');
    if(new Set(setting.options.map((option:{key?:unknown})=>option.key)).size!==setting.options.length)throw new AppStoreError('invalidResponse','Duplicate capability options.');
    return {key:setting.key,options:setting.options.map((option:{key?:unknown;enabled?:unknown})=>{if(typeof option.key!=='string'||!['XCODE_5','XCODE_6','COMPLETE_PROTECTION','PROTECTED_UNLESS_OPEN','PROTECTED_UNTIL_FIRST_USER_AUTH','PRIMARY_APP_CONSENT'].includes(option.key)||(option.enabled!==undefined&&typeof option.enabled!=='boolean'))throw new AppStoreError('invalidResponse','Capability option is malformed.');return {key:option.key,...(option.enabled===undefined?{}:{enabled:option.enabled})};}).sort((a:{key:string},b:{key:string})=>a.key.localeCompare(b.key,'en'))};
  }).sort((a,b)=>a.key.localeCompare(b.key,'en'));
  if(new Set(settings.map(setting=>setting.key)).size!==settings.length)throw new AppStoreError('invalidResponse','Duplicate capability settings.');
  return settings;
}
export class ProvisioningAdapter implements Adapter{
  readonly domain='provisioning';
  constructor(private readonly selection:z.infer<typeof provisioningSelection>,private readonly allowedRoots:readonly string[],private readonly api:ApiClient,private readonly identity:()=>string){}
  async #desired(signal?:AbortSignal):Promise<{identifiers:Identifier[];inputs:Record<string,string>;secretFingerprint:string;root:string;bundleId:string}>{
    const validation=await validateRepository({root:this.selection.root,domains:['provisioning']},this.allowedRoots,{},signal);
    if(!validation.valid)throw new AppStoreError('invalidRepository','Validate provisioning source before planning.');
    const app=validation.desired['app.json'] as AppManifest;const config=provisioningSchema.safeParse(validation.desired['provisioning.json']);
    if(!config.success)throw new AppStoreError('missingProvisioning','Supply explicit provisioning.json before planning.');
    const all=[{...config.data.primaryBundleId,identifier:app.app.bundleId},...(config.data.additionalBundleIds??[])];
    if(new Set(all.map(item=>item.identifier)).size!==all.length||new Set(this.selection.identifiers).size!==this.selection.identifiers.length)throw new AppStoreError('duplicateIdentifier','Select each declared bundle identifier once.');
    const identifiers=this.selection.identifiers.map(identifier=>{const found=all.find(item=>item.identifier===identifier);if(!found)throw new AppStoreError('unmanagedIdentifier','Every selected identifier must be explicitly declared in provisioning.json.');return found;});
    for(const item of identifiers){
      if(item.identifier===app.app.bundleId&&((item.platform==='MAC_OS'&&app.platforms.some(platform=>platform!=='MAC_OS'))||(item.platform==='IOS'&&app.platforms.includes('MAC_OS'))))throw new AppStoreError('platformMismatch','Primary identifier platform must cover the platforms declared in app.json; use an explicit universal identifier for mixed platforms.');
      if(new Set(item.capabilities.map(capability=>capability.capabilityType)).size!==item.capabilities.length)throw new AppStoreError('duplicateCapability','Manage each capability once.');
      for(const capability of item.capabilities){
        if(!supported.has(capability.capabilityType)||(capability.settings!==undefined&&capability.capabilityType!=='DATA_PROTECTION'))throw new AppStoreError('capabilitySetupRequired','This capability or setting needs separately verified portal setup; it cannot be represented by a generic toggle in this adapter.');
        if(capability.capabilityType==='DATA_PROTECTION'){
          const setting=capability.settings?.[0];const options=setting?.options??[];
          if(item.platform!=='IOS'||capability.settings?.length!==1||setting?.key!=='DATA_PROTECTION_PERMISSION_LEVEL'||options.length!==3||new Set(options.map(option=>option.key)).size!==3||options.some(option=>!['COMPLETE_PROTECTION','PROTECTED_UNLESS_OPEN','PROTECTED_UNTIL_FIRST_USER_AUTH'].includes(option.key))||options.filter(option=>option.enabled).length!==1)throw new AppStoreError('unsupportedCapabilitySettings','Data Protection requires an IOS identifier and exactly one explicitly enabled protection class among all three documented options.');
        }
      }
    }
    return {identifiers,inputs:validation.hashes,secretFingerprint:validation.secretFingerprint,root:await realpath(this.selection.root),bundleId:app.app.bundleId};
  }
  async capture(signal?:AbortSignal):Promise<ProvisioningSnapshot>{
    const desired=await this.#desired(signal);const remote:Record<string,Json>={};
    for(const item of desired.identifiers){
      const key=`bundle:${item.identifier}`;const state=await readBundleState(this.api,item.identifier,signal);
      const bundle=state.bundle;remote[key]=bundle;
      for(const type of capabilityTypes)remote[`capability:${item.identifier}:${type}`]=null;
      if(bundle){
        if(bundle.platform!==item.platform)throw new AppStoreError('platformMismatch','Existing bundle platform differs from the explicit provisioning request.');
        for(const capability of state.capabilities)remote[`capability:${item.identifier}:${capability.capabilityType}`]=capability;
      }
    }
    return {root:desired.root,target:{bundleId:desired.bundleId,identifiers:this.selection.identifiers.join(',')},credentialContext:this.identity(),inputs:desired.inputs,secretFingerprint:desired.secretFingerprint,rulesVersion:'provisioning-1',remote,desired:desired.identifiers} satisfies ProvisioningSnapshot;
  }
  propose(snapshot:Snapshot):Operation[]{
    const operations:Operation[]=[];
    for(const item of (snapshot as ProvisioningSnapshot).desired){
      const key=`bundle:${item.identifier}`;const missing=snapshot.remote[key]===null;const bundleOperation=opId(key);
      if(missing)operations.push({id:bundleOperation,domain:this.domain,kind:'create',key,scope:item.identifier,before:null,after:{identifier:item.identifier,name:item.name,platform:item.platform},dependencies:[],affects:[key,...capabilityTypes.map(type=>`capability:${item.identifier}:${type}`)],sensitive:false});
      for(const capability of item.capabilities){
        const capKey=`capability:${item.identifier}:${capability.capabilityType}`;
        if(capability.settings){
          const existingSettings=object(snapshot.remote[capKey])?.settings;
          if(Array.isArray(existingSettings)&&existingSettings.some(setting=>object(setting)?.key!=='DATA_PROTECTION_PERMISSION_LEVEL'))throw new AppStoreError('unmanagedCapabilitySettings','Unrecognized existing settings would require a broader replacement; resolve manually.');
        }
        const after:Json={capabilityType:capability.capabilityType,...(capability.settings?{settings:normalizeSettings(capability.settings)}:{})};
        if(matches(snapshot.remote[capKey],after))continue;
        operations.push({id:opId(capKey),domain:this.domain,kind:snapshot.remote[capKey]===null?'create':'update',key:capKey,scope:item.identifier,before:snapshot.remote[capKey]!,after,dependencies:missing?[bundleOperation]:[],affects:[capKey],sensitive:false});
      }
    }
    return operations;
  }
  async execute(operation:Operation,signal?:AbortSignal):Promise<void>{
    const current=await this.capture(signal);if(this.verify(operation,current))return;
    if(operation.key.startsWith('bundle:')){
      if(current.remote[operation.key]!==null)throw new AppStoreError('conflict','Bundle identity appeared before creation; replan.');
      await this.api.request('/v1/bundleIds',{method:'POST',body:{data:{type:'bundleIds',attributes:operation.after}},...(signal?{signal}:{})});
    }else{
      const bundle=object(current.remote[`bundle:${operation.scope}`]);if(!bundle||typeof bundle.id!=='string')throw new AppStoreError('missingDependency','Bundle registration must be verified first.');
      const existing=object(current.remote[operation.key]);
      if(operation.kind==='update'){
        if(!existing||typeof existing.id!=='string'||existing.id!==object(operation.before)?.id)throw new AppStoreError('conflict','Capability identity changed; replan.');
        await this.api.request(`/v1/bundleIdCapabilities/${existing.id}`,{method:'PATCH',body:{data:{type:'bundleIdCapabilities',id:existing.id,attributes:operation.after}},...(signal?{signal}:{})});return;
      }
      if(existing)throw new AppStoreError('conflict','Capability changed before creation; replan.');
      await this.api.request('/v1/bundleIdCapabilities',{method:'POST',body:{data:{type:'bundleIdCapabilities',attributes:operation.after,relationships:{bundleId:{data:{type:'bundleIds',id:bundle.id}}}}},...(signal?{signal}:{})});
    }
  }
  verify(operation:Operation,snapshot:Snapshot):boolean{return matches(snapshot.remote[operation.key],operation.after);}
  remoteIds(operation:Operation,snapshot:Snapshot):string[]{const id=object(snapshot.remote[operation.key])?.id;return typeof id==='string'?[id]:[];}
}

export async function readBundleState(api:ApiClient,identifier:string,signal?:AbortSignal):Promise<{bundle:Record<string,Json>|null;capabilities:Record<string,Json>[]}>{
  const query=new URLSearchParams({'filter[identifier]':identifier});
  const bundles=(await api.list<unknown>(`/v1/bundleIds?${query}`,signal)).map(raw=>resource(raw,'bundleIds',['identifier','name','platform'])).filter(bundle=>bundle.attributes.identifier===identifier);
  if(bundles.length>1)throw new AppStoreError('ambiguousIdentifier','Apple returned multiple exact bundle matches.');
  const bundle=bundles[0];if(!bundle)return {bundle:null,capabilities:[]};
  const raws=await api.list<unknown>(`/v1/bundleIds/${bundle.id}/bundleIdCapabilities`,signal);const seen=new Set<string>();
  const capabilities=raws.map(raw=>{
    const capability=resource(raw,'bundleIdCapabilities',['capabilityType']);const type=String(capability.attributes.capabilityType);
    if(!capabilityTypes.includes(type as typeof capabilityTypes[number])||seen.has(type))throw new AppStoreError('incompleteSnapshot','Capability identity is unknown or duplicated.');seen.add(type);
    return {id:capability.id,capabilityType:type,settings:normalizeSettings((raw as {attributes:Record<string,unknown>}).attributes.settings)};
  });
  return {bundle:{id:bundle.id,...bundle.attributes},capabilities};
}
