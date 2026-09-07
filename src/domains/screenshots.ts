import {z} from 'zod';
import {realpath} from 'node:fs/promises';
import path from 'node:path';
import type {ApiClient,ApiDocument} from '../api/client.js';
import {resource} from '../api/resources/discovery.js';
import {editableVersionStates} from '../api/resources/states.js';
import {AppStoreError} from '../errors.js';
import {validateRepository} from '../repository/validate.js';
import {RepositoryFiles} from '../repository/files.js';
import {localeSchema,type AppManifest} from '../repository/schemas.js';
import {canonical,type Adapter,type Snapshot,type Operation,type Json} from '../planning/model.js';
import {JournalStore} from '../planning/journal.js';
import {ScreenshotUploader,type UploadReceipt} from '../screenshots/upload.js';
import {HttpsAssetTransfer} from '../screenshots/transfer.js';
import type {AssetTransfer} from '../api/asset-transfer.js';
import {planSet,equivalent,type SetIntent,type RemoteSet,type ScreenshotPayload} from '../screenshots/planner.js';
export const screenshotSelection=z.object({root:z.string().min(1),platform:z.literal('macOS'),version:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/),locales:z.array(localeSchema).min(1).max(5)}).strict();
type Selection=z.infer<typeof screenshotSelection>;
interface ScreenshotSnapshot extends Snapshot{intent:Record<string,SetIntent>}
const object=(value:unknown)=>value as Record<string,unknown>;
export class ScreenshotAdapter implements Adapter{
 readonly domain='screenshots';#lastSnapshot:ScreenshotSnapshot|undefined;readonly #receipts=new Map<string,UploadReceipt>();readonly #before=new Map<string,RemoteSet|null>();
 constructor(private readonly selection:Selection,private readonly roots:readonly string[],private readonly api:ApiClient,private readonly identity:()=>string,private readonly transfer:AssetTransfer=new HttpsAssetTransfer()){}
 async capture(signal?:AbortSignal):Promise<ScreenshotSnapshot>{
  const selected=screenshotSelection.parse(this.selection);if(new Set(selected.locales).size!==selected.locales.length)throw new AppStoreError('invalidSelection','Select each locale only once.');
  const local=await validateRepository({...selected,domains:['screenshots']},this.roots,process.env,signal);if(!local.valid)throw new AppStoreError('invalidRepository','Validate all selected original screenshots before planning.');
  const app=local.desired['app.json'] as AppManifest;if(!app.app.appStoreId)throw new AppStoreError('appSelectionRequired','Select a verified existing App Store app ID.');
  const intent:Record<string,SetIntent>={};for(const locale of selected.locales){const manifest=local.desired[`versions/macOS/${selected.version}/localizations/${locale}/screenshots.json`] as {mode:'merge'|'replace';sets:{APP_DESKTOP?:string[]}}|undefined;if(manifest?.sets.APP_DESKTOP)intent[locale]={mode:manifest.mode,images:manifest.sets.APP_DESKTOP.map(file=>({path:file,sha256:local.images[file]!.sha256,md5:local.images[file]!.md5,size:local.images[file]!.size}))};}
  const current=resource((await this.api.request<ApiDocument>(`/v1/apps/${app.app.appStoreId}`,signal?{signal}:{}))?.data,'apps',['bundleId']);if(current.id!==app.app.appStoreId||current.attributes.bundleId!==app.app.bundleId)throw new AppStoreError('identityMismatch','App ID and bundle ID must match this account.');
  const versions=(await this.api.list<unknown>(`/v1/apps/${current.id}/appStoreVersions`,signal)).map(raw=>resource(raw,'appStoreVersions',['platform','versionString','appVersionState','appStoreState']));const matches=versions.filter(version=>version.attributes.platform==='MAC_OS'&&version.attributes.versionString===selected.version);if(matches.length!==1)throw new AppStoreError('versionNotFound','Select one exact existing macOS version.');const version=matches[0]!;const state=String(version.attributes.appVersionState??version.attributes.appStoreState);if(!editableVersionStates.has(state))throw new AppStoreError('noneditableVersion','Screenshot sync requires a supported editable version.');
  const locales=(await this.api.list<unknown>(`/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`,signal)).map(raw=>resource(raw,'appStoreVersionLocalizations',['locale']));
  const remote:Record<string,Json>={app:{id:current.id,bundleId:app.app.bundleId},version:{id:version.id,state},locales:locales.map(item=>({id:item.id,locale:String(item.attributes.locale)})).sort((a,b)=>a.id.localeCompare(b.id,'en'))};
  const globalIds=new Set<string>();const setIds=new Set<string>();
  if(new Set(locales.map(item=>item.id)).size!==locales.length)throw new AppStoreError('incompleteSnapshot','Duplicate localization identities.');
  for(const locale of Object.keys(intent)){
   const found=locales.filter(item=>item.attributes.locale===locale);if(found.length!==1)throw new AppStoreError('localizationRequired','Create each selected version localization through metadata synchronization first.');const localeId=found[0]!.id;
   const sets=(await this.api.list<unknown>(`/v1/appStoreVersionLocalizations/${localeId}/appScreenshotSets`,signal)).map(raw=>resource(raw,'appScreenshotSets',['screenshotDisplayType']));const matches=sets.filter(set=>set.attributes.screenshotDisplayType==='APP_DESKTOP');if(matches.length>1)throw new AppStoreError('ambiguousScreenshotSet','More than one APP_DESKTOP set exists for a selected locale.');const set=matches[0];remote['locale:'+locale]=localeId;
   if(!set){remote['set:'+locale]=null;continue;}
   if(setIds.has(set.id))throw new AppStoreError('wrongParent','Screenshot set is shared across different localizations.');setIds.add(set.id);
   const listed=await this.api.list<unknown>(`/v1/appScreenshotSets/${set.id}/appScreenshots?include=appScreenshotSet`,signal);const order=(await this.api.list<unknown>(`/v1/appScreenshotSets/${set.id}/relationships/appScreenshots`,signal)).map(raw=>resource({...object(raw),attributes:{}},'appScreenshots',[]).id);
   if(listed.length>10||new Set(order).size!==order.length||order.length!==listed.length)throw new AppStoreError('incompleteSnapshot','Screenshot membership is incomplete or exceeds ten entries.');
   const images=listed.map(raw=>{
    const item=resource(raw,'appScreenshots',['fileName','fileSize','sourceFileChecksum']);const attrs=object(raw).attributes as Record<string,unknown>;const parent=(raw as {relationships?:{appScreenshotSet?:{data?:{id?:unknown}}}}).relationships?.appScreenshotSet?.data?.id;
    if(parent!==undefined&&parent!==set.id)throw new AppStoreError('wrongParent','Screenshot parent contradicts its destination set.');
    if(globalIds.has(item.id)||!order.includes(item.id))throw new AppStoreError('wrongParent','Screenshot IDs must be unique and belong to their exact parent order.');globalIds.add(item.id);
    const state=object(attrs.assetDeliveryState??{}).state;if(typeof state!=='string'||!['AWAITING_UPLOAD','UPLOAD_COMPLETE','COMPLETE','FAILED'].includes(state)||typeof item.attributes.fileName!=='string'||!Number.isSafeInteger(item.attributes.fileSize))throw new AppStoreError('incompleteSnapshot','Screenshot identity and processing fields are required.');
    const checksum=item.attributes.sourceFileChecksum;if(checksum!=null&&(typeof checksum!=='string'||!/^[0-9a-fA-F]{32}$/.test(checksum)))throw new AppStoreError('invalidChecksum','Screenshot checksum is not a documented MD5 value.');
    return {id:item.id,name:item.attributes.fileName,size:item.attributes.fileSize as number,md5:typeof checksum==='string'?checksum.toLowerCase():null,state};
   });
   remote['set:'+locale]={id:set.id,localeId,images:order.map(id=>images.find(image=>image.id===id)!)} as unknown as Json;
  }
  const snapshot:ScreenshotSnapshot={root:await realpath(selected.root),target:{appId:current.id,bundleId:app.app.bundleId,platform:'MAC_OS',version:selected.version},credentialContext:this.identity(),inputs:local.hashes,secretFingerprint:local.secretFingerprint,rulesVersion:'screenshots-1',intent,remote};this.#lastSnapshot=structuredClone(snapshot);return snapshot;
 }
 propose(snapshot:Snapshot):Operation[]{const shot=snapshot as ScreenshotSnapshot;return Object.entries(shot.intent).flatMap(([locale,intent])=>planSet(locale,intent,shot.remote['set:'+locale] as unknown as RemoteSet|null,String(shot.remote['locale:'+locale])));}
 #order(payload:ScreenshotPayload,set:RemoteSet):string[]{return payload.order!.map(target=>{if('id'in target){if(!set.images.some(image=>image.id===target.id))throw new AppStoreError('stalePlan','An approved retained screenshot disappeared.');return target.id;}const matches=set.images.filter(remote=>equivalent(remote,target));if(matches.length!==1)throw new AppStoreError('screenshotEquivalenceUnknown','Uploaded screenshot identity is not uniquely verified.');return matches[0]!.id;});}
 async execute(operation:Readonly<Operation>,signal?:AbortSignal):Promise<void>{
  const payload=operation.payload as unknown as ScreenshotPayload;const before=this.#lastSnapshot;const snapshot=await this.capture(signal);if(!before||canonical(before)!==canonical(snapshot))throw new AppStoreError('stalePlan','Screenshot inputs or live state changed immediately before dispatch.');const set=snapshot.remote['set:'+payload.locale] as unknown as RemoteSet|null;this.#before.set(operation.id,structuredClone(set));
  if(payload.action==='set'){
   if(set)throw new AppStoreError('stalePlan','An unapproved screenshot set appeared.');
   await this.api.request('/v1/appScreenshotSets',{method:'POST',body:{data:{type:'appScreenshotSets',attributes:{screenshotDisplayType:'APP_DESKTOP'},relationships:{appStoreVersionLocalization:{data:{type:'appStoreVersionLocalizations',id:snapshot.remote['locale:'+payload.locale]}}}}},...(signal?{signal}:{})});return;
  }
  if(!set)throw new AppStoreError('stalePlan','Approved destination set is missing.');
  if(payload.action==='delete'){
   if(set.id!==payload.setId||!set.images.some(image=>image.id===payload.removeId))throw new AppStoreError('stalePlan','Approved screenshot removal no longer matches its parent.');
   await this.api.request(`/v1/appScreenshots/${payload.removeId}`,{method:'DELETE',...(signal?{signal}:{})});return;
  }
  if(payload.action==='upload'){
   const image=payload.image!;if(set.images.some(remote=>equivalent(remote,image)))throw new AppStoreError('stalePlan','Equivalent bytes appeared before upload; create a fresh no-op plan.');
   const journal=await JournalStore.create(snapshot.root,this.roots);const uploader=new ScreenshotUploader(this.api,this.transfer,journal,true);
   const receipt=await uploader.start(set.id,{name:path.basename(image.path),read:async(signal)=>{const files=await RepositoryFiles.create(snapshot.root,this.roots,signal);return (await files.read(image.path,true,33_554_432))!;}},image.sha256,signal);this.#receipts.set(operation.id,receipt);
   if(receipt.stage!=='complete')throw new AppStoreError(receipt.code??'screenshotProcessingPending','Screenshot reservation is retained; inspect its upload journal and reconcile before a fresh plan.','outcomeUnknown');return;
  }
  const ids=this.#order(payload,set);if(new Set(ids).size!==ids.length||ids.length!==set.images.length)throw new AppStoreError('stalePlan','The final order must contain exactly the current approved membership.');
  await this.api.request(`/v1/appScreenshotSets/${set.id}/relationships/appScreenshots`,{method:'PATCH',body:{data:ids.map(id=>({type:'appScreenshots',id}))},...(signal?{signal}:{})});
 }
 verify(operation:Readonly<Operation>,snapshot:Snapshot):boolean{
  const payload=operation.payload as unknown as ScreenshotPayload;const set=snapshot.remote['set:'+payload.locale] as unknown as RemoteSet|null;
  if(payload.action==='set')return !!set&&set.localeId===snapshot.remote['locale:'+payload.locale]&&set.images.length===0;
  if(!set)return false;
  const before=this.#before.get(operation.id);
  if(payload.action==='delete')return !!before&&set.id===payload.setId&&canonical(set.images)===canonical(before.images.filter(image=>image.id!==payload.removeId));
  if(payload.action==='upload'){const receipt=this.#receipts.get(operation.id);return !!before&&!!receipt?.screenshotId&&set.id===receipt.setId&&set.images.length===before.images.length+1&&canonical(set.images.filter(image=>image.id!==receipt.screenshotId))===canonical(before.images)&&set.images.some(remote=>remote.id===receipt.screenshotId&&equivalent(remote,payload.image!));}
  try{return canonical(this.#order(payload,set))===canonical(set.images.map(image=>image.id))&&!!before&&set.images.every(image=>image.state==='COMPLETE'&&canonical(image)===canonical(before.images.find(previous=>previous.id===image.id)));}catch{return false;}
 }
 remoteIds(operation:Readonly<Operation>,snapshot:Snapshot):string[]{const payload=operation.payload as unknown as ScreenshotPayload;const set=snapshot.remote['set:'+payload.locale] as unknown as RemoteSet|null;return set?[set.id,...set.images.map(image=>image.id)]:[];}
}
