import {z} from 'zod';
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {realpath} from 'node:fs/promises';
import type {ApiClient} from '../api/client.js';
import {resource} from '../api/resources/discovery.js';
import {AppStoreError} from '../errors.js';
import {RepositoryFiles,safeRelative} from '../repository/files.js';
import {canonical,type Adapter,type Snapshot,type Operation,type Json} from '../planning/model.js';
import {certificateTypes,platforms,profileTypes,provisioningInventory,type CertificateRecord,type DeviceRecord,type ProfileRecord} from '../signing/inventory.js';
import {validateCsr,type CsrFacts} from '../signing/csr.js';

const id=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const root=z.string().min(1);
const creatableCertificateTypes=certificateTypes.filter(type=>!type.startsWith('DEVELOPER_ID_')) as [Exclude<typeof certificateTypes[number],'DEVELOPER_ID_APPLICATION'|'DEVELOPER_ID_APPLICATION_G2'>,...Exclude<typeof certificateTypes[number],'DEVELOPER_ID_APPLICATION'|'DEVELOPER_ID_APPLICATION_G2'>[]];
const action=z.discriminatedUnion('type',[
  z.object({type:z.literal('createCertificate'),certificateType:z.enum(creatableCertificateTypes),csrPath:z.string().min(1).max(512)}).strict(),
  z.object({type:z.literal('revokeCertificate'),certificateId:id}).strict(),
  z.object({type:z.literal('registerDevice'),name:z.string().min(1).max(200),platform:z.enum(platforms),udid:z.string().regex(/^[A-Za-z0-9-]{8,100}$/)}).strict(),
  z.object({type:z.literal('updateDevice'),deviceId:id,name:z.string().min(1).max(200).optional(),status:z.enum(['ENABLED','DISABLED']).optional()}).strict(),
  z.object({type:z.literal('createProfile'),name:z.string().min(1).max(200),profileType:z.enum(profileTypes),bundleId:id,certificateIds:z.array(id).min(1).max(10),deviceIds:z.array(id).max(500)}).strict(),
  z.object({type:z.literal('deleteProfile'),profileId:id}).strict(),
]);
export const signingSelection=z.object({root,action}).strict();
type Selection=z.infer<typeof signingSelection>;
interface Inventory{certificates:CertificateRecord[];devices:DeviceRecord[];profiles:ProfileRecord[]}
interface SigningSnapshot extends Snapshot{action:Selection['action'];csr?:CsrFacts}
const bindingKey=randomBytes(32);
const opId=(type:string)=>'signing-'+createHash('sha256').update(type).digest('hex').slice(0,24);
const expired=(date:string)=>Date.parse(date)<=Date.now();

function profileRules(type:string):{platform:'IOS'|'MAC_OS'|'UNIVERSAL';devices:boolean;certificates:Set<string>} {
  if(type.startsWith('MAC_CATALYST_'))return {platform:'UNIVERSAL',devices:type.endsWith('DEVELOPMENT'),certificates:new Set(type.endsWith('DEVELOPMENT')?['DEVELOPMENT','IOS_DEVELOPMENT']:type.endsWith('STORE')?['DISTRIBUTION','IOS_DISTRIBUTION']:['DEVELOPER_ID_APPLICATION','DEVELOPER_ID_APPLICATION_G2'])};
  if(type.startsWith('MAC_'))return {platform:'MAC_OS',devices:type.endsWith('DEVELOPMENT'),certificates:new Set(type.endsWith('DEVELOPMENT')?['DEVELOPMENT','MAC_APP_DEVELOPMENT']:type.endsWith('STORE')?['DISTRIBUTION','MAC_APP_DISTRIBUTION']:['DEVELOPER_ID_APPLICATION','DEVELOPER_ID_APPLICATION_G2'])};
  const development=type.endsWith('DEVELOPMENT');
  return {platform:'IOS',devices:development||type.endsWith('ADHOC'),certificates:new Set(development?['DEVELOPMENT','IOS_DEVELOPMENT']:['DISTRIBUTION','IOS_DISTRIBUTION'])};
}
function sameExcept<T extends {id:string}>(before:T[],after:T[],changed:Set<string>):boolean {return canonical(before.filter(item=>!changed.has(item.id)))===canonical(after.filter(item=>!changed.has(item.id)));}

export class SigningAdapter implements Adapter {
  readonly domain='signing';
  #last:SigningSnapshot|undefined;
  readonly #before=new Map<string,Inventory>();
  constructor(private readonly selection:Selection,private readonly roots:readonly string[],private readonly api:ApiClient,private readonly identity:()=>string){}
  async capture(signal?:AbortSignal):Promise<SigningSnapshot> {
    const selected=signingSelection.parse(this.selection);const actualRoot=await realpath(selected.root);const files=await RepositoryFiles.create(actualRoot,this.roots,signal);let csr:CsrFacts|undefined;
    if(selected.action.type==='createCertificate'){
      if(!safeRelative(selected.action.csrPath))throw new AppStoreError('unsafePath','CSR path must remain within the approved root.');
      csr=await validateCsr((await files.read(selected.action.csrPath,true,64*1024))!,signal);
    }
    const inventory=await provisioningInventory(this.api,signal);
    if(selected.action.type==='createProfile'){
      const bundleRaw=(await this.api.request<{data?:unknown}>(`/v1/bundleIds/${selected.action.bundleId}`,signal?{signal}:{}))?.data;const bundle=resource(bundleRaw,'bundleIds',['platform']);
      if(!platforms.includes(bundle.attributes.platform as typeof platforms[number]))throw new AppStoreError('incompatibleProfile','Bundle platform is unavailable or unsupported.');
      const rules=profileRules(selected.action.profileType);if(bundle.attributes.platform!==rules.platform&&bundle.attributes.platform!=='UNIVERSAL')throw new AppStoreError('incompatibleProfile','Profile type is incompatible with the exact bundle platform.');
      if(new Set(selected.action.certificateIds).size!==selected.action.certificateIds.length||new Set(selected.action.deviceIds).size!==selected.action.deviceIds.length)throw new AppStoreError('duplicateSelection','Choose every certificate and device once.');
      const certs=selected.action.certificateIds.map(certId=>inventory.certificates.find(item=>item.id===certId));
      if(certs.some(item=>!item||!item.activated||expired(item.expirationDate)||!rules.certificates.has(item.certificateType)||(item.platform!==rules.platform&&item.platform!=='UNIVERSAL')))throw new AppStoreError('incompatibleCertificate','Every chosen certificate must be active, unexpired, exact, and compatible with the requested profile type.');
      const devices=selected.action.deviceIds.map(deviceId=>inventory.devices.find(item=>item.id===deviceId));
      if(rules.devices&&(devices.length===0||devices.some(item=>!item||item.status!=='ENABLED'||(item.platform!==rules.platform&&item.platform!=='UNIVERSAL'))))throw new AppStoreError('incompatibleDevice','This profile requires explicitly selected enabled devices on a compatible platform.');
      if(!rules.devices&&devices.length)throw new AppStoreError('incompatibleDevice','This distribution profile type does not accept device relationships.');
    }
    const target={resourceFamily:selected.action.type.replace(/^(create|revoke|register|update|delete)/,'').toLowerCase()};
    const snapshot:SigningSnapshot={root:actualRoot,target,credentialContext:this.identity(),inputs:files.hashes,secretFingerprint:createHmac('sha256',bindingKey).update(canonical(selected.action)).digest('hex'),rulesVersion:'signing-1',remote:{inventory:inventory as unknown as Json},action:selected.action,...(csr?{csr}:{})};this.#last=structuredClone(snapshot);return snapshot;
  }
  summary(snapshot:Snapshot):Json {
    const value=snapshot as SigningSnapshot;const inventory=value.remote.inventory as unknown as Inventory;const action=value.action;
    if(action.type==='createCertificate')return {action:action.type,certificateType:action.certificateType,activeSameType:inventory.certificates.filter(item=>item.certificateType===action.certificateType&&item.activated&&!expired(item.expirationDate)).length,csr:{algorithm:value.csr!.algorithm,...(value.csr!.bits?{bits:value.csr!.bits}:{}),...(value.csr!.curve?{curve:value.csr!.curve}:{})},accountLimit:'Apple enforces account-specific quotas; no certificate is automatically revoked.'};
    if(action.type==='revokeCertificate'){const affectedProfileIds=inventory.profiles.filter(profile=>profile.certificateIds.includes(action.certificateId)).map(profile=>profile.id);return {action:action.type,certificateId:action.certificateId,affectedProfileCount:affectedProfileIds.length,affectedProfileIds,impact:'Revocation may affect other apps and profiles; no replacement is generated.'};}
    if(action.type==='createProfile')return {action:action.type,profileType:action.profileType,bundleId:action.bundleId,certificateIds:action.certificateIds,deviceIds:action.deviceIds,impact:'Creates exactly the reviewed relationships; capabilities never recreate profiles automatically.'};
    if(action.type==='registerDevice')return {action:action.type,platform:action.platform,name:action.name,udidFingerprint:createHash('sha256').update(action.udid).digest('hex'),impact:'Registers exactly the reviewed device identity.'};
    if(action.type==='updateDevice')return {action:action.type,deviceId:action.deviceId,changes:{...(action.name!==undefined?{name:action.name}:{}),...(action.status!==undefined?{status:action.status}:{})},impact:'Changes only the exact selected device.'};
    return {action:action.type,profileId:action.profileId,impact:'Deletes one exact profile; original bytes cannot be restored without recreation.'};
  }
  propose(snapshot:Snapshot):Operation[]{
    const value=snapshot as SigningSnapshot;const inventory=value.remote.inventory as unknown as Inventory;const action=value.action;let kind:Operation['kind']='update';let before:Json|null=null;let after:Json=action as unknown as Json;
    if(action.type==='createCertificate'){kind='create';before={certificates:inventory.certificates,type:action.certificateType} as unknown as Json;after={certificateType:action.certificateType,csrSha256:value.csr!.sha256};}
    if(action.type==='revokeCertificate'){kind='remove';const certificate=inventory.certificates.find(item=>item.id===action.certificateId);if(!certificate)throw new AppStoreError('resourceNotFound','Select an existing exact certificate.');before={certificate,affectedProfiles:inventory.profiles.filter(profile=>profile.certificateIds.includes(certificate.id))} as unknown as Json;after={revoked:true,affectedProfileIds:inventory.profiles.filter(profile=>profile.certificateIds.includes(certificate.id)).map(profile=>profile.id)};}
    if(action.type==='registerDevice'){kind='create';const same=inventory.devices.filter(item=>item.udid===action.udid);if(same.length){if(same.length===1&&same[0]!.name===action.name&&same[0]!.platform===action.platform&&same[0]!.status==='ENABLED')return [];throw new AppStoreError('deviceConflict','UDID already exists with different identity or status; use an explicit update if supported.');}before={devices:inventory.devices} as unknown as Json;}
    if(action.type==='updateDevice'){const device=inventory.devices.find(item=>item.id===action.deviceId);if(!device)throw new AppStoreError('resourceNotFound','Select an existing exact device.');if(action.name===undefined&&action.status===undefined)throw new AppStoreError('emptyUpdate','Select a device name or status change.');after={...device,...(action.name?{name:action.name}:{}),...(action.status?{status:action.status}:{})} as unknown as Json;if(canonical(device)===canonical(after))return [];before=device as unknown as Json;}
    if(action.type==='createProfile'){kind='create';const duplicates=inventory.profiles.filter(item=>item.name===action.name);if(duplicates.length)throw new AppStoreError('profileConflict','Profile name already exists; select a distinct explicit name or delete the old exact profile separately.');before={profiles:inventory.profiles} as unknown as Json;}
    if(action.type==='deleteProfile'){kind='remove';const profile=inventory.profiles.find(item=>item.id===action.profileId);if(!profile)throw new AppStoreError('resourceNotFound','Select an existing exact profile.');before=profile as unknown as Json;after={deleted:true,profileId:profile.id};}
    return [{id:opId(action.type),domain:this.domain,kind,key:'inventory',scope:`explicit ${action.type}`,before,after,dependencies:[],affects:['inventory'],sensitive:true,payload:{action,...(value.csr?{csrPem:value.csr.pem,csrPublicKeySha256:value.csr.publicKeySha256}:{})} as unknown as Json}];
  }
  async execute(operation:Readonly<Operation>,signal?:AbortSignal):Promise<void>{
    const before=this.#last;const current=await this.capture(signal);if(!before||canonical(before)!==canonical(current))throw new AppStoreError('stalePlan','Provisioning inventory or selected sensitive input changed before dispatch.');this.#before.set(operation.id,structuredClone(current.remote.inventory as unknown as Inventory));const action=(operation.payload as unknown as {action:Selection['action'];csrPem?:string}).action;
    if(action.type==='createCertificate')await this.api.request('/v1/certificates',{method:'POST',body:{data:{type:'certificates',attributes:{certificateType:action.certificateType,csrContent:(operation.payload as unknown as {csrPem:string}).csrPem}}},...(signal?{signal}:{})});
    else if(action.type==='revokeCertificate')await this.api.request(`/v1/certificates/${action.certificateId}`,{method:'DELETE',...(signal?{signal}:{})});
    else if(action.type==='registerDevice')await this.api.request('/v1/devices',{method:'POST',body:{data:{type:'devices',attributes:{name:action.name,platform:action.platform,udid:action.udid}}},...(signal?{signal}:{})});
    else if(action.type==='updateDevice')await this.api.request(`/v1/devices/${action.deviceId}`,{method:'PATCH',body:{data:{type:'devices',id:action.deviceId,attributes:{...(action.name?{name:action.name}:{}),...(action.status?{status:action.status}:{})}}},...(signal?{signal}:{})});
    else if(action.type==='createProfile')await this.api.request('/v1/profiles',{method:'POST',body:{data:{type:'profiles',attributes:{name:action.name,profileType:action.profileType},relationships:{bundleId:{data:{type:'bundleIds',id:action.bundleId}},certificates:{data:action.certificateIds.map(id=>({type:'certificates',id}))},...(action.deviceIds.length?{devices:{data:action.deviceIds.map(id=>({type:'devices',id}))}}:{})}}},...(signal?{signal}:{})});
    else await this.api.request(`/v1/profiles/${action.profileId}`,{method:'DELETE',...(signal?{signal}:{})});
  }
  verify(operation:Readonly<Operation>,snapshot:Snapshot):boolean {
    const before=this.#before.get(operation.id);const after=snapshot.remote.inventory as unknown as Inventory;const payload=operation.payload as unknown as {action:Selection['action'];csrPublicKeySha256?:string};const action=payload.action;if(!before)return false;
    const otherFamilies=canonical(before.certificates)===canonical(after.certificates)&&canonical(before.devices)===canonical(after.devices)&&canonical(before.profiles)===canonical(after.profiles);
    if(action.type==='createCertificate'){const prior=new Set(before.certificates.map(item=>item.id));const created=after.certificates.filter(item=>!prior.has(item.id));return created.length===1&&created[0]!.certificateType===action.certificateType&&created[0]!.activated&&created[0]!.publicKeyFingerprint!==null&&created[0]!.publicKeyFingerprint===payload.csrPublicKeySha256&&sameExcept(before.certificates,after.certificates,new Set([created[0]!.id]))&&canonical(before.devices)===canonical(after.devices)&&canonical(before.profiles)===canonical(after.profiles);}
    if(action.type==='revokeCertificate'){
      const affected=new Set(before.profiles.filter(profile=>profile.certificateIds.includes(action.certificateId)).map(profile=>profile.id));
      const normalized=after.profiles.map(profile=>{const prior=before.profiles.find(item=>item.id===profile.id);if(!prior||!affected.has(profile.id))return profile;if(![prior.profileState,'INVALID'].includes(profile.profileState))return profile;return {...profile,profileState:prior.profileState};});
      return !after.certificates.some(item=>item.id===action.certificateId)&&sameExcept(before.certificates,after.certificates,new Set([action.certificateId]))&&canonical(before.devices)===canonical(after.devices)&&canonical(before.profiles)===canonical(normalized);
    }
    if(action.type==='registerDevice'){const prior=new Set(before.devices.map(item=>item.id));const created=after.devices.filter(item=>!prior.has(item.id));return created.length===1&&created[0]!.udid===action.udid&&created[0]!.name===action.name&&created[0]!.platform===action.platform&&created[0]!.status==='ENABLED'&&sameExcept(before.devices,after.devices,new Set([created[0]!.id]))&&canonical(before.certificates)===canonical(after.certificates)&&canonical(before.profiles)===canonical(after.profiles);}
    if(action.type==='updateDevice'){const expected=operation.after as unknown as DeviceRecord;return canonical(after.devices.find(item=>item.id===action.deviceId))===canonical(expected)&&sameExcept(before.devices,after.devices,new Set([action.deviceId]))&&canonical(before.certificates)===canonical(after.certificates)&&canonical(before.profiles)===canonical(after.profiles);}
    if(action.type==='createProfile'){const prior=new Set(before.profiles.map(item=>item.id));const created=after.profiles.filter(item=>!prior.has(item.id));return created.length===1&&created[0]!.name===action.name&&created[0]!.profileType===action.profileType&&created[0]!.bundleId===action.bundleId&&canonical(created[0]!.certificateIds)===canonical([...action.certificateIds].sort())&&canonical(created[0]!.deviceIds)===canonical([...action.deviceIds].sort())&&sameExcept(before.profiles,after.profiles,new Set([created[0]!.id]))&&canonical(before.certificates)===canonical(after.certificates)&&canonical(before.devices)===canonical(after.devices);}
    if(action.type==='deleteProfile')return !after.profiles.some(item=>item.id===action.profileId)&&sameExcept(before.profiles,after.profiles,new Set([action.profileId]))&&canonical(before.certificates)===canonical(after.certificates)&&canonical(before.devices)===canonical(after.devices);
    return otherFamilies;
  }
  remoteIds(operation:Readonly<Operation>,snapshot:Snapshot):string[]{const action=(operation.payload as unknown as {action:Selection['action']}).action;const inventory=snapshot.remote.inventory as unknown as Inventory;const before=this.#before.get(operation.id);if(!before)return [];if(action.type==='createCertificate'){const prior=new Set(before.certificates.map(item=>item.id));return inventory.certificates.filter(item=>!prior.has(item.id)).map(item=>item.id);}if(action.type==='registerDevice'){const prior=new Set(before.devices.map(item=>item.id));return inventory.devices.filter(item=>!prior.has(item.id)).map(item=>item.id);}if(action.type==='createProfile'){const prior=new Set(before.profiles.map(item=>item.id));return inventory.profiles.filter(item=>!prior.has(item.id)).map(item=>item.id);}return [];}
}
