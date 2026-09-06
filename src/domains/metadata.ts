import { z } from 'zod';
import { realpath } from 'node:fs/promises';
import { createHmac,randomBytes,createHash } from 'node:crypto';
import type { ApiClient,ApiDocument } from '../api/client.js';
import { resource,type Resource } from '../api/resources/discovery.js';
import { editableAppInfoStates,editableVersionStates,knownAppInfoStates } from '../api/resources/states.js';
import { AppStoreError } from '../errors.js';
import { validateRepository } from '../repository/validate.js';
import { localeSchema,platforms,reviewEnvironment,type AppManifest } from '../repository/schemas.js';
import { canonical,type Adapter,type Snapshot,type Operation,type Json } from '../planning/model.js';
export const metadataSelection=z.object({root:z.string().min(1),platform:z.enum(['macOS','iOS','tvOS','visionOS']),version:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/),locales:z.array(localeSchema).min(1).max(5),domains:z.array(z.enum(['appInfo','versionMetadata','version','review'])).min(1).max(4),manageCategories:z.boolean().default(false)}).strict();
type Selection=z.infer<typeof metadataSelection>;
interface Intent{attributes:Record<string,Json>;sensitive:boolean;parent?:string}
interface MetadataSnapshot extends Snapshot{intent:Record<string,Intent>}
const reviewKey=randomBytes(32);const secretHash=(value:unknown)=>createHmac('sha256',reviewKey).update(canonical(value)).digest('hex');
const infoFields=['locale','name','subtitle','privacyPolicyUrl'] as const;
const textFields=['locale','description','keywords','supportUrl','marketingUrl','promotionalText','whatsNew'] as const;
const versionFields=['platform','versionString','appVersionState','appStoreState','copyright','releaseType'] as const;
const reviewFields=[...Object.keys(reviewEnvironment),'demoAccountRequired','notes'];
const categoryFields=['primaryCategory','secondaryCategory','primarySubcategoryOne','primarySubcategoryTwo','secondarySubcategoryOne','secondarySubcategoryTwo'];
const object=(value:unknown):Record<string,Json>|undefined=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,Json>:undefined;
const state=(item:Resource)=>String(item.attributes.state??item.attributes.appVersionState??item.attributes.appStoreState??'UNKNOWN');
const idFor=(key:string)=>`metadata-${createHash('sha256').update(key).digest('hex').slice(0,24)}`;
function equalManaged(actual:Json|undefined,desired:Record<string,Json>):boolean{const value=object(actual);return !!value&&Object.entries(desired).every(([key,after])=>canonical(value[key])===canonical(after));}
function pick(source:Record<string,unknown>,fields:readonly string[]):Record<string,Json>{const result:Record<string,Json>={};for(const key of fields)if(Object.hasOwn(source,key))result[key]=source[key] as Json;return result;}
export class MetadataAdapter implements Adapter{
  readonly domain='metadata';
  constructor(private readonly selection:Selection,private readonly roots:readonly string[],private readonly api:ApiClient,private readonly identity:()=>string,private readonly environment:Readonly<Record<string,string|undefined>>=process.env){}
  async #local(signal?:AbortSignal){
    const selected=metadataSelection.parse(this.selection);
    if(new Set(selected.domains).size!==selected.domains.length||new Set(selected.locales).size!==selected.locales.length||(selected.manageCategories&&!selected.domains.includes('appInfo')))throw new AppStoreError('invalidSelection','Use unique domains/locales; category management requires appInfo.');
    const validation=await validateRepository({root:selected.root,platform:selected.platform,version:selected.version,locales:selected.locales,domains:selected.domains},this.roots,this.environment,signal);
    if(!validation.valid)throw new AppStoreError('invalidRepository','Validate selected metadata and environment references before planning.');
    const app=validation.desired['app.json'] as AppManifest;
    if(!app.app.appStoreId)throw new AppStoreError('appSelectionRequired','Set the verified existing appStoreId before metadata planning.');
    const prefix=`versions/${selected.platform}/${selected.version}`;
    const manifest=object(validation.desired[`${prefix}/version.json`])??{};
    const intent:Record<string,Intent>={};
    if(selected.domains.includes('version'))intent.version={attributes:{platform:platforms[selected.platform],versionString:selected.version,...pick(manifest,['copyright','releaseType'])},sensitive:false};
    for(const locale of selected.locales){
      if(selected.domains.includes('appInfo')){
        const attributes=pick(object(validation.desired[`info/${locale}.json`])??{},infoFields.filter(key=>key!=='locale'));
        if(!Object.hasOwn(attributes,'privacyPolicyUrl')&&app.defaults?.privacyPolicyUrl)attributes.privacyPolicyUrl=app.defaults.privacyPolicyUrl;
        if(Object.keys(attributes).length)intent[`info:${locale}`]={attributes:{locale,...attributes},sensitive:false,parent:'appInfo'};
      }
      if(selected.domains.includes('versionMetadata')){
        const local=`${prefix}/localizations/${locale}`;const attributes=pick(object(validation.desired[`${local}/metadata.json`])??{},['supportUrl','marketingUrl']);
        const defaults=object(manifest.defaults);if(!Object.hasOwn(attributes,'supportUrl')&&typeof defaults?.supportUrl==='string')attributes.supportUrl=defaults.supportUrl;
        for(const [filename,field] of Object.entries({'description.txt':'description','keywords.txt':'keywords','promotional-text.txt':'promotionalText','whats-new.txt':'whatsNew'}))if(Object.hasOwn(validation.desired,`${local}/${filename}`))attributes[field]=validation.desired[`${local}/${filename}`] as string;
        if(Object.keys(attributes).length)intent[`text:${locale}`]={attributes:{locale,...attributes},sensitive:false,parent:'version'};
      }
    }
    const reviewValues:Record<string,Json>={};
    if(selected.domains.includes('review')){
      const review=object(validation.desired[`${prefix}/review.json`])??{};
      for(const field of reviewFields)if(Object.hasOwn(review,field)){const value=review[field];const reference=object(value);reviewValues[field]=reference?this.environment[String(reference.env)]!:value!;}
      if(Object.hasOwn(validation.desired,`${prefix}/review-notes.txt`))reviewValues.notes=validation.desired[`${prefix}/review-notes.txt`] as string;
      if(Object.keys(reviewValues).length)intent.review={attributes:Object.fromEntries(Object.entries(reviewValues).map(([key,value])=>[key,secretHash(value)])),sensitive:true,parent:'version'};
    }
    if(selected.manageCategories&&app.categories){const attributes:Record<string,Json>={primaryCategory:app.categories.primary};if(Object.hasOwn(app.categories,'secondary'))attributes.secondaryCategory=app.categories.secondary!;intent.categories={attributes,sensitive:false,parent:'appInfo'};}
    return {selected,validation,app,manifest,intent,reviewValues};
  }
  async #list(url:string,type:string,fields:readonly string[],signal?:AbortSignal):Promise<Resource[]>{
    const list=(await this.api.list<unknown>(url,signal)).map(item=>resource(item,type,fields));if(new Set(list.map(item=>item.id)).size!==list.length)throw new AppStoreError('incompleteSnapshot','Duplicate resources in metadata snapshot.');return list;
  }
  async capture(signal?:AbortSignal):Promise<MetadataSnapshot>{
    const local=await this.#local(signal);const {selected,app,intent}=local;const platform=platforms[selected.platform];
    const appDoc=await this.api.request<ApiDocument>(`/v1/apps/${app.app.appStoreId}`,signal?{signal}:{});const currentApp=resource(appDoc?.data,'apps',['bundleId','primaryLocale']);
    if(currentApp.id!==app.app.appStoreId||currentApp.attributes.bundleId!==app.app.bundleId)throw new AppStoreError('identityMismatch','App Store ID and bundle ID do not agree in this account.');
    const versions=await this.#list(`/v1/apps/${currentApp.id}/appStoreVersions`,'appStoreVersions',versionFields,signal);
    const matches=versions.filter(version=>version.attributes.platform===platform&&version.attributes.versionString===selected.version);
    if(matches.length>1)throw new AppStoreError('ambiguousVersion','Multiple exact platform/version matches.');const version=matches[0];
    if(version&&!editableVersionStates.has(state(version)))throw new AppStoreError('noneditableVersion','Selected version is not in a supported editable state.');
    if(!version){
      if(!selected.domains.includes('version'))throw new AppStoreError('versionNotFound','Version creation requires the explicitly selected shared version domain.');
      if(versions.some(item=>item.attributes.platform===platform&&!['READY_FOR_DISTRIBUTION','READY_FOR_SALE'].includes(state(item))))throw new AppStoreError('versionCreationBlocked','Resolve the existing platform version before creating another.');
      if(!Object.hasOwn(local.manifest,'releaseType'))throw new AppStoreError('creationIncomplete','New versions require an explicit releaseType in version.json.');
    }
    const hasPriorRelease=versions.some(item=>item.attributes.platform===platform&&item.id!==version?.id&&['READY_FOR_DISTRIBUTION','READY_FOR_SALE'].includes(state(item)));
    if(!hasPriorRelease&&Object.entries(intent).some(([key,value])=>key.startsWith('text:')&&Object.hasOwn(value.attributes,'whatsNew')))throw new AppStoreError('initialReleaseNotes','The initial release uses description text; omit whats-new.txt until an update to a released version.');
    const appInfos=await this.#list(`/v1/apps/${currentApp.id}/appInfos`,'appInfos',['state','appStoreState'],signal);
    if(appInfos.some(info=>!(knownAppInfoStates as readonly string[]).includes(state(info))))throw new AppStoreError('unknownAppInfoState','App information contains an unknown state.');
    const infos=appInfos.filter(info=>editableAppInfoStates.has(state(info)));if(infos.length>1)throw new AppStoreError('ambiguousAppInfo','Multiple editable AppInfo records.');const info=infos[0];
    if(version&&!info&&selected.domains.includes('appInfo'))throw new AppStoreError('noneditableAppInfo','No unique editable AppInfo record is available.');
    const remote:Record<string,Json>={app:{id:currentApp.id,...currentApp.attributes},versions:versions.map(item=>({id:item.id,...item.attributes})).sort((a,b)=>a.id.localeCompare(b.id,'en')),appInfos:appInfos.map(item=>({id:item.id,...item.attributes})).sort((a,b)=>a.id.localeCompare(b.id,'en')),version:version?{id:version.id,...version.attributes}:null,appInfo:info?{id:info.id,...info.attributes}:null};
    async function storeLocales(items:Resource[],family:string):Promise<void>{const seen=new Set<string>();for(const item of items){const locale=item.attributes.locale;if(typeof locale!=='string'||!/^[A-Za-z0-9-]{2,20}$/.test(locale)||seen.has(locale))throw new AppStoreError('incompleteSnapshot','Localization identity is missing or ambiguous.');seen.add(locale);remote[`${family}:${locale}`]={id:item.id,...item.attributes};}}
    if(selected.domains.includes('appInfo')&&info)await storeLocales(await this.#list(`/v1/appInfos/${info.id}/appInfoLocalizations`,'appInfoLocalizations',infoFields,signal),'info');
    if(selected.domains.includes('versionMetadata')&&version)await storeLocales(await this.#list(`/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`,'appStoreVersionLocalizations',textFields,signal),'text');
    for(const key of Object.keys(intent))if(!Object.hasOwn(remote,key))remote[key]=null;
    if(selected.domains.includes('review')&&version){
      let doc:ApiDocument|undefined;try{doc=await this.api.request<ApiDocument>(`/v1/appStoreVersions/${version.id}/appStoreReviewDetail`,signal?{signal}:{});}catch(error){if(!(error instanceof AppStoreError&&error.status===404))throw error;}
      if(doc?.data){const review=resource(doc.data,'appStoreReviewDetails',reviewFields);remote.review={id:review.id,...Object.fromEntries(Object.entries(review.attributes).map(([key,value])=>[key,secretHash(value)]))};}
    }
    if(intent.categories){
      const query=new URLSearchParams({'filter[platforms]':platform,'exists[parent]':'false'});const catalog=await this.#list(`/v1/appCategories?${query}`,'appCategories',[],signal);remote.categoryCatalog=catalog.map(item=>item.id).sort();
      for(const category of Object.values(intent.categories.attributes)){if(category===null)throw new AppStoreError('categoryClearUnsupported','The pinned category update contract does not establish null clearing; use manual category removal.');if(typeof category!=='string'||!catalog.some(item=>item.id===category))throw new AppStoreError('unknownCategory','Use an exact top-level category ID returned by Apple for this platform.');}
      if(info){const doc=await this.api.request<ApiDocument>(`/v1/appInfos/${info.id}?include=primaryCategory,secondaryCategory,primarySubcategoryOne,primarySubcategoryTwo,secondarySubcategoryOne,secondarySubcategoryTwo`,signal?{signal}:{});const relationships=(doc?.data as {relationships?:Record<string,{data?:{id?:unknown;type?:unknown}|null}>})?.relationships;
        const categories:Record<string,Json>={};for(const field of categoryFields){const value=relationships?.[field]?.data;if(value===undefined)throw new AppStoreError('incompleteSnapshot','Category relationships were not returned.');if(value===null)categories[field]=null;else {if(value.type!=='appCategories'||typeof value.id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value.id))throw new AppStoreError('invalidResponse','Category relationship identity is invalid.');categories[field]=value.id;}}remote.categories={id:info.id,...categories};}
    }
    return {root:await realpath(selected.root),target:{appStoreId:currentApp.id,bundleId:app.app.bundleId,platform,version:selected.version,domains:selected.domains.join(','),locales:selected.locales.join(','),manageCategories:String(selected.manageCategories)},credentialContext:this.identity(),inputs:local.validation.hashes,secretFingerprint:local.validation.secretFingerprint,rulesVersion:'metadata-1',remote,intent};
  }
  propose(snapshot:Snapshot):Operation[]{
    const {intent}=snapshot as MetadataSnapshot;const ops:Operation[]=[];const createsVersion=snapshot.remote.version===null;
    for(const [key,wanted] of Object.entries(intent)){
      const before=snapshot.remote[key]??null;if(equalManaged(before,wanted.attributes)||Object.keys(wanted.attributes).length===0)continue;
      if(key.startsWith('info:')&&before===null&&typeof wanted.attributes.name!=='string')throw new AppStoreError('creationIncomplete','Missing app-information localizations require an explicit name.');
      if(key==='categories'){const existing=object(before);for(const parent of ['primary','secondary'])if(wanted.attributes[`${parent}Category`]!==undefined&&existing?.[`${parent}Category`]!==wanted.attributes[`${parent}Category`]&&(existing?.[`${parent}SubcategoryOne`]!=null||existing?.[`${parent}SubcategoryTwo`]!=null))throw new AppStoreError('subcategoryImpact','Changing this category can clear unmanaged subcategories; resolve that broader change manually.');}
      const dependencies=createsVersion&&key!=='version'?[idFor('version')]:[];const affects=[key];
      let payload:Json|undefined;let scope=key.includes(':')?key:'shared';
      const locale=key.split(':')[1];
      if(key.startsWith('info:')&&before===null){
        scope=`${key}; Apple may initialize an empty version localization`;
        if(intent[`text:${locale}`]&&snapshot.remote[`text:${locale}`]===null)affects.push(`text:${locale}`);
      }
      if(key.startsWith('text:')&&before===null&&snapshot.remote[`info:${locale}`]===null&&intent[`info:${locale}`]){
        dependencies.push(idFor(`info:${locale}`));payload={initializerKey:`info:${locale}`,initializerAfter:intent[`info:${locale}`]!.attributes};
        scope=`${key}; create or populate the empty companion initialized by the approved app-info operation`;
      }
      if(key==='version')affects.push('versions');
      if(key==='version'&&createsVersion)affects.push('appInfo','appInfos',...Object.keys(snapshot.remote).filter(item=>item.startsWith('info:')||item.startsWith('text:')||['review','categories'].includes(item)));
      ops.push({id:idFor(key),domain:this.domain,kind:before===null?'create':'update',key,scope,before,after:wanted.attributes,dependencies,affects,sensitive:wanted.sensitive,...(payload?{payload}:{})});
    }
    return ops;
  }
  async execute(operation:Operation,signal?:AbortSignal):Promise<void>{
    const current=await this.capture(signal);if(this.verify(operation,current))return;
    const existing=object(current.remote[operation.key]);
    if(existing&&existing.id!==object(operation.before)?.id){
      const initialization=object(operation.payload);const initializerKey=initialization?.initializerKey;const initializerAfter=object(initialization?.initializerAfter);
      const emptyCompanion=operation.key.startsWith('text:')&&operation.before===null&&typeof initializerKey==='string'&&initializerAfter&&equalManaged(current.remote[initializerKey],initializerAfter)&&Object.entries(existing).every(([key,value])=>['id','locale'].includes(key)||value===null||value==='');
      if(!emptyCompanion)throw new AppStoreError('conflict','Resource identity appeared or changed after planning; create a fresh plan.');
    }
    const attributes=object(operation.after)!;let url:string;let type:string;let body:unknown;
    if(operation.key==='categories'){
      const info=object(current.remote.appInfo);if(typeof info?.id!=='string')throw new AppStoreError('missingDependency','Editable AppInfo is required.');url=`/v1/appInfos/${info.id}`;type='appInfos';body={data:{type,id:info.id,relationships:Object.fromEntries(Object.entries(attributes).map(([key,id])=>[key,{data:{type:'appCategories',id}}]))}};
    }else{
      const family=operation.key.split(':')[0]!;type=family==='info'?'appInfoLocalizations':family==='text'?'appStoreVersionLocalizations':family==='review'?'appStoreReviewDetails':'appStoreVersions';
      const payload=family==='review'?pick((await this.#local(signal)).reviewValues,Object.keys(attributes)):attributes;
      if(existing){if(typeof existing.id!=='string')throw new AppStoreError('invalidResponse','Missing resource identity.');url=`/v1/${type}/${existing.id}`;const {locale:_,platform:__,versionString:___,...patch}=payload;body={data:{type,id:existing.id,attributes:family==='version'?pick(payload,['copyright','releaseType']):patch}};}
      else{
        url=`/v1/${type}`;const relationship=family==='version'?'app':family==='info'?'appInfo':'appStoreVersion';const parent=object(current.remote[family==='version'?'app':family==='info'?'appInfo':'version']);const parentType=family==='version'?'apps':family==='info'?'appInfos':'appStoreVersions';if(typeof parent?.id!=='string')throw new AppStoreError('missingDependency','The localization parent must exist and be editable.');body={data:{type,attributes:payload,relationships:{[relationship]:{data:{type:parentType,id:parent.id}}}}};
      }
    }
    try{await this.api.request(url,{method:existing||operation.key==='categories'?'PATCH':'POST',body,...(signal?{signal}:{})});}
    catch(error){if(error instanceof AppStoreError)throw new AppStoreError(error.code,`Apple rejected or could not confirm ${operation.key}; inspect the operation and request ID.`,error.executionDisposition,error.status,error.requestId,error.validationErrors);throw error;}
  }
  verify(operation:Operation,snapshot:Snapshot):boolean{return equalManaged(snapshot.remote[operation.key],object(operation.after)!);}
  remoteIds(operation:Operation,snapshot:Snapshot):string[]{const id=object(snapshot.remote[operation.key])?.id;return typeof id==='string'?[id]:[];}
}
