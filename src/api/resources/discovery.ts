import { createHash, createHmac, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { knownAppInfoStates, editableAppInfoStates as editableInfo, editableVersionStates as editableVersion } from './states.js';
import { AppStoreError } from '../../errors.js';
import type { ApiClient, ApiDocument } from '../client.js';
export type Attributes=Record<string,string|number|boolean|null>;
export interface Resource {id:string;type:string;attributes:Attributes}
interface RawResource {id?:unknown;type?:unknown;attributes?:unknown}
export const targetSchema=z.object({appStoreId:z.string().regex(/^[0-9]+$/),bundleId:z.string().regex(/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/),platform:z.enum(['MAC_OS','IOS','TV_OS','VISION_OS']),version:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/).optional()}).strict();
export type Target=z.infer<typeof targetSchema>;
export const prepareSchema=z.object({bundleId:targetSchema.shape.bundleId,appStoreId:targetSchema.shape.appStoreId.optional(),name:z.string().min(2).max(30).optional(),sku:z.string().min(1).max(100).optional(),primaryLocale:z.enum(['en-US','de-DE','fr-FR','ja','pt-BR']).optional(),platform:targetSchema.shape.platform.optional()}).strict();
const reviewKey=randomBytes(32);
export interface ScreenshotSet {resource:Resource;screenshots:Resource[]}
export interface StoreState {
  app:Resource;credentialContext:string;versions:Resource[];appInfos:Resource[];
  version?:Resource;appInfo?:Resource;appInfoLocalizations:Resource[];versionLocalizations:Resource[];
  screenshotSets:Record<string,ScreenshotSet[]>;review?:{id:string;valueFingerprint:string;presentFields:string[];demoAccountRequired?:boolean};
  selectionRequired:boolean;editable:boolean;unavailable:string[];fingerprint:string;
}
const appFields=['name','bundleId','sku','primaryLocale'];
const versionFields=['platform','versionString','appVersionState','appStoreState','copyright','releaseType','earliestReleaseDate'];
const infoFields=['state','appStoreState'];
const infoLocalizationFields=['locale','name','subtitle','privacyPolicyUrl'];
const localizationFields=['locale','description','keywords','supportUrl','marketingUrl','promotionalText','whatsNew'];
export function resource(raw:unknown,type:string,fields:readonly string[]):Resource {
  if(!raw||typeof raw!=='object')throw new AppStoreError('invalidResponse','Expected an Apple resource.');
  const value=raw as RawResource;
  if(value.type!==type||typeof value.id!=='string'||!/^[A-Za-z0-9-]{1,128}$/.test(value.id))throw new AppStoreError('invalidResponse','Apple resource type or identity is invalid.');
  const attributes:Attributes={};
  if(value.attributes!==undefined){
    if(!value.attributes||typeof value.attributes!=='object'||Array.isArray(value.attributes))throw new AppStoreError('invalidResponse','Apple attributes are malformed.');
    for(const field of fields){const item=(value.attributes as Record<string,unknown>)[field];if(item===undefined)continue;if(item!==null&&!['string','boolean','number'].includes(typeof item))throw new AppStoreError('invalidResponse','Apple attribute has an unexpected type.');attributes[field]=item as string|number|boolean|null;}
  }
  return {id:value.id,type,attributes};
}
export function fingerprint(value:unknown):string{return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
const observedState=(item:Resource):string=>String(item.attributes.state??item.attributes.appVersionState??item.attributes.appStoreState??'UNKNOWN');
export class Discovery {
  constructor(private readonly api:ApiClient,private readonly identity:()=>string){}
  async #one(path:string,type:string,fields:readonly string[],signal?:AbortSignal):Promise<Resource>{
    const document=await this.api.request<ApiDocument>(path,signal?{signal}:{});return resource(document?.data,type,fields);
  }
  async #list(path:string,type:string,fields:readonly string[],signal?:AbortSignal):Promise<Resource[]>{
    const list=(await this.api.list<unknown>(path,signal)).map(item=>resource(item,type,fields));
    if(new Set(list.map(item=>item.id)).size!==list.length)throw new AppStoreError('incompleteSnapshot','Duplicate resource IDs in paginated snapshot.');
    return list;
  }
  async apps(bundleId?:string,signal?:AbortSignal):Promise<Resource[]>{
    const query=new URLSearchParams({'fields[apps]':appFields.join(',')});if(bundleId)query.set('filter[bundleId]',bundleId);
    const apps=await this.#list(`/v1/apps?${query}`,'apps',appFields,signal);
    return bundleId?apps.filter(app=>app.attributes.bundleId===bundleId):apps;
  }
  async state(input:Target,signal?:AbortSignal):Promise<StoreState>{
    const target=targetSchema.parse(input);
    const app=await this.#one(`/v1/apps/${target.appStoreId}`,'apps',appFields,signal);
    if(app.id!==target.appStoreId||app.attributes.bundleId!==target.bundleId)throw new AppStoreError('identityMismatch','App Store ID and bundle ID do not agree in the authenticated account.');
    const versions=await this.#list(`/v1/apps/${app.id}/appStoreVersions`,'appStoreVersions',versionFields,signal);
    const appInfos=await this.#list(`/v1/apps/${app.id}/appInfos`,'appInfos',infoFields,signal);
    const base:StoreState={app,credentialContext:this.identity(),versions,appInfos,appInfoLocalizations:[],versionLocalizations:[],screenshotSets:{},selectionRequired:target.version===undefined,editable:false,unavailable:[],fingerprint:''};
    if(target.version===undefined){base.fingerprint=fingerprint(base);return base;}
    const candidates=versions.filter(version=>version.attributes.platform===target.platform&&version.attributes.versionString===target.version);
    if(candidates.length!==1)throw new AppStoreError(candidates.length?'ambiguousVersion':'versionNotFound','Select an existing unique platform/version explicitly.');
    const version=candidates[0]!;base.version=version;
    const versionState=observedState(version);
    const infoCandidates=appInfos.filter(info=>(knownAppInfoStates as readonly string[]).includes(observedState(info))&&(editableVersion.has(versionState)?editableInfo.has(observedState(info)):observedState(info)===versionState));
    if(infoCandidates.length>1)throw new AppStoreError('ambiguousAppInfo','Multiple applicable app-information records require explicit resolution.');
    if(infoCandidates.length===1)base.appInfo=infoCandidates[0]!;
    else base.unavailable.push('No unique app-information record compatible with the selected version state.');
    base.editable=editableVersion.has(observedState(version))&&!!base.appInfo&&editableInfo.has(observedState(base.appInfo));
    if(base.appInfo)base.appInfoLocalizations=await this.#list(`/v1/appInfos/${base.appInfo.id}/appInfoLocalizations`,'appInfoLocalizations',infoLocalizationFields,signal);
    base.versionLocalizations=await this.#list(`/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`,'appStoreVersionLocalizations',localizationFields,signal);
    if(base.versionLocalizations.length>100)throw new AppStoreError('incompleteSnapshot','Locale inventory exceeds the bounded snapshot size.');
    for(const localization of base.versionLocalizations){
      const sets=await this.#list(`/v1/appStoreVersionLocalizations/${localization.id}/appScreenshotSets`,'appScreenshotSets',['screenshotDisplayType'],signal);
      if(sets.length>20)throw new AppStoreError('incompleteSnapshot','Display inventory exceeds the bounded snapshot size.');
      const inventory:ScreenshotSet[]=[];
      for(const set of sets){
        const raw=await this.api.list<unknown>(`/v1/appScreenshotSets/${set.id}/appScreenshots`,signal);
        if(raw.length>10)throw new AppStoreError('incompleteSnapshot','Screenshot inventory exceeds the supported set limit.');
        const screenshots=raw.map(value=>{
          const item=resource(value,'appScreenshots',['fileName','fileSize','sourceFileChecksum']);
          const attributes=(value as {attributes?:{assetDeliveryState?:{state?:unknown}}}).attributes;
          const state=attributes?.assetDeliveryState?.state;
          if(typeof state==='string')item.attributes.processingState=state;
          return item;
        });
        inventory.push({resource:set,screenshots});
      }
      base.screenshotSets[localization.id]=inventory;
    }
    try{
      const document=await this.api.request<ApiDocument>(`/v1/appStoreVersions/${version.id}/appStoreReviewDetail`,signal?{signal}:{});
      if(document?.data){
        const review=resource(document.data,'appStoreReviewDetails',['contactFirstName','contactLastName','contactPhone','contactEmail','demoAccountName','demoAccountPassword','demoAccountRequired','notes']);
        base.review={id:review.id,valueFingerprint:createHmac('sha256',reviewKey).update(JSON.stringify(review.attributes)).digest('hex'),presentFields:Object.keys(review.attributes).filter(field=>review.attributes[field]!=null&&review.attributes[field]!==''),...(typeof review.attributes.demoAccountRequired==='boolean'?{demoAccountRequired:review.attributes.demoAccountRequired}:{})};
      }else base.unavailable.push('Review details absent.');
    }catch(error){if(error instanceof AppStoreError&&error.status===404)base.unavailable.push('Review details absent.');else throw error;}
    base.fingerprint=fingerprint({...base,fingerprint:undefined});return base;
  }
  async prepare(input:z.infer<typeof prepareSchema>,signal?:AbortSignal):Promise<Record<string,unknown>>{
    input=prepareSchema.parse(input);
    if(input.appStoreId){
      const app=await this.#one(`/v1/apps/${input.appStoreId}`,'apps',appFields,signal);
      if(app.id!==input.appStoreId||app.attributes.bundleId!==input.bundleId)throw new AppStoreError('identityMismatch','App Store ID and bundle ID do not agree.');
      return {status:'existing',app};
    }
    const matches=await this.apps(input.bundleId,signal);if(matches.length>1)throw new AppStoreError('ambiguousApp','Bundle discovery returned multiple apps.');if(matches.length===1)return {status:'existing',app:matches[0]};
    return {status:'manualActionRequired',reason:'Initial app creation requires the App Store Connect website; bundle registration does not create an app.',bootstrap:{bundleId:input.bundleId,...(input.name?{name:input.name}:{}),...(input.sku?{sku:input.sku}:{}),...(input.primaryLocale?{primaryLocale:input.primaryLocale}:{}),...(input.platform?{platform:input.platform}:{})},missing:['name','sku','primaryLocale','platform'].filter(key=>!input[key as keyof typeof input])};
  }
}
