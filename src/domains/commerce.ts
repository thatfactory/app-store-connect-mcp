import {z} from 'zod';
import {realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import type {ApiClient,ApiDocument} from '../api/client.js';
import {resource} from '../api/resources/discovery.js';
import {AppStoreError} from '../errors.js';
import {validateRepository} from '../repository/validate.js';
import type {AppManifest} from '../repository/schemas.js';
import {canonical,type Adapter,type Snapshot,type Operation,type Json} from '../planning/model.js';
export const commerceSelection=z.object({root:z.string().min(1),domains:z.array(z.enum(['price','availability'])).min(1).max(2)}).strict();
type Selection=z.infer<typeof commerceSelection>;
interface PriceIntent{mode:'free'|'paid';baseTerritory:string;customerPrice?:string}
interface AvailabilityIntent{territories:'all'|string[];availableInNewTerritories?:boolean}
interface Intent{price?:PriceIntent;availability?:AvailabilityIntent}
interface PriceEntry{id:string;territory:string;pointId:string;startDate:string|null;endDate:string|null}
interface PriceState{id:string;baseTerritory:string;manual:PriceEntry[];automatic:PriceEntry[];current:{pointId:string;customerPrice:string}|null}
interface AvailabilityState{id:string;availableInNewTerritories:boolean;territories:{id:string;territory:string;available:boolean;contentStatuses:string[]}[]}
interface CommerceSnapshot extends Snapshot{intent:Intent}
const object=(raw:unknown)=>raw as Record<string,unknown>;
function relation(raw:unknown,name:string,type:string):string{
 const data=(raw as {relationships?:Record<string,{data?:unknown}>}).relationships?.[name]?.data;
 return resource({...object(data),attributes:{}},type,[]).id;
}
function simpleSchedule(price:PriceState,baseTerritory:string,today=new Date().toISOString().slice(0,10)):boolean {
  return price.manual.length===1&&price.manual[0]!.territory===baseTerritory&&price.manual[0]!.endDate===null&&(!price.manual[0]!.startDate||price.manual[0]!.startDate<=today)&&price.automatic.every(entry=>entry.endDate===null&&(!entry.startDate||entry.startDate<=today));
}
export function decimal(value:string):string{if(value.length>40||!/^\d+(?:\.\d+)?$/.test(value))throw new AppStoreError('invalidPrice','Prices must be exact nonnegative decimal strings.');const [integer,fraction='']=value.split('.');const whole=integer!.replace(/^0+(?=\d)/,'');const tail=fraction.replace(/0+$/,'');return whole+(tail?'.'+tail:'');}
export class CommerceAdapter implements Adapter{
 readonly domain='commerce';#last:CommerceSnapshot|undefined;
 constructor(private readonly selection:Selection,private readonly roots:readonly string[],private readonly api:ApiClient,private readonly identity:()=>string){}
 async #document(url:string,signal?:AbortSignal):Promise<unknown>{return (await this.api.request<ApiDocument>(url,signal?{signal}:{}))?.data;}
 async #optional(url:string,signal?:AbortSignal):Promise<unknown>{try{return await this.#document(url,signal);}catch(error){if(error instanceof AppStoreError&&error.status===404)return null;throw error;}}
 async #prices(id:string,family:'manual'|'automatic',signal?:AbortSignal):Promise<PriceEntry[]>{
  const raw=await this.api.list<unknown>(`/v1/appPriceSchedules/${id}/${family}Prices?include=appPricePoint,territory`,signal);if(raw.length>1000)throw new AppStoreError('complexPriceSchedule','Price schedule exceeds the supported read budget.');
  const entries=raw.map(raw=>{const value=resource(raw,'appPrices',['startDate','endDate']);const date=(name:string)=>{const item=value.attributes[name];if(item!=null&&(typeof item!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(item)))throw new AppStoreError('invalidPriceSchedule','Price schedule contains an invalid date.');return item as string|null|undefined??null;};return {id:value.id,territory:relation(raw,'territory','territories'),pointId:relation(raw,'appPricePoint','appPricePoints'),startDate:date('startDate'),endDate:date('endDate')};});
  if(new Set(entries.map(item=>item.id)).size!==entries.length)throw new AppStoreError('incompleteSnapshot','Duplicate price schedule entries.');return entries.sort((a,b)=>a.id.localeCompare(b.id,'en'));
 }
 async capture(signal?:AbortSignal):Promise<CommerceSnapshot>{
  const selected=commerceSelection.parse(this.selection);if(new Set(selected.domains).size!==selected.domains.length)throw new AppStoreError('invalidSelection','Select each commerce domain once.');
  const local=await validateRepository({root:selected.root,domains:['commerce']},this.roots,process.env,signal);if(!local.valid)throw new AppStoreError('invalidRepository','Validate the explicitly managed commerce manifest first.');const app=local.desired['app.json'] as AppManifest;if(!app.app.appStoreId)throw new AppStoreError('appSelectionRequired','Commerce requires an exact existing App Store app ID.');
  const manifest=(local.desired['commerce.json']??{}) as Intent;const intent:Intent={};if(selected.domains.includes('price')&&manifest.price)intent.price=manifest.price;if(selected.domains.includes('availability')&&manifest.availability)intent.availability=manifest.availability;
  const current=resource(await this.#document(`/v1/apps/${app.app.appStoreId}`,signal),'apps',['bundleId']);if(current.id!==app.app.appStoreId||current.attributes.bundleId!==app.app.bundleId)throw new AppStoreError('identityMismatch','App and bundle IDs do not match this account.');
  const territories=(await this.api.list<unknown>('/v1/territories',signal)).map(raw=>{const item=resource(raw,'territories',['currency']);if(!/^[A-Z]{3}$/.test(item.id)||typeof item.attributes.currency!=='string'||!/^[A-Z]{3}$/.test(item.attributes.currency))throw new AppStoreError('invalidTerritory','Territory catalog must supply exact IDs and currencies.');return {id:item.id,currency:item.attributes.currency};}).sort((a,b)=>a.id.localeCompare(b.id,'en'));if(!territories.length||new Set(territories.map(item=>item.id)).size!==territories.length)throw new AppStoreError('incompleteSnapshot','Territory catalog must be complete and unique.');
  const remote:Record<string,Json>={app:{id:current.id,bundleId:app.app.bundleId},territories};
  if(selected.domains.includes('price')){
   const raw=await this.#optional(`/v1/apps/${current.id}/appPriceSchedule`,signal);let schedule:PriceState|null=null;
   if(raw){const item=resource(raw,'appPriceSchedules',[]);const base=resource(await this.#document(`/v1/appPriceSchedules/${item.id}/baseTerritory`,signal),'territories',[]).id;const manual=await this.#prices(item.id,'manual',signal);const automatic=await this.#prices(item.id,'automatic',signal);const today=new Date().toISOString().slice(0,10);const active=manual.filter(price=>price.territory===base&&(!price.startDate||price.startDate<=today)&&(!price.endDate||price.endDate>today));if(active.length>1)throw new AppStoreError('ambiguousPriceSchedule','Multiple active base prices require manual inspection.');let currentPrice:PriceState['current']=null;
    if(active[0]){const rawPoint=await this.#document(`/v3/appPricePoints/${active[0].pointId}?include=territory,app`,signal);if(relation(rawPoint,'territory','territories')!==base||relation(rawPoint,'app','apps')!==current.id)throw new AppStoreError('wrongParent','Current price point belongs to another app or base territory.');const point=resource(rawPoint,'appPricePoints',['customerPrice']);if(point.id!==active[0].pointId||typeof point.attributes.customerPrice!=='string')throw new AppStoreError('invalidPrice','Current price point could not be verified.');currentPrice={pointId:point.id,customerPrice:decimal(point.attributes.customerPrice)};}
    schedule={id:item.id,baseTerritory:base,manual,automatic,current:currentPrice};
   }remote.price=schedule as unknown as Json;
   if(intent.price){const desired=intent.price;if(!territories.some(item=>item.id===desired.baseTerritory))throw new AppStoreError('unknownTerritory','Base territory must be an exact current catalog ID.');const amount=desired.mode==='free'?'0':decimal(desired.customerPrice!);if(desired.mode==='paid'&&amount==='0')throw new AppStoreError('invalidPrice','Use free mode for a zero price.');
    const query=new URLSearchParams({'filter[territory]':desired.baseTerritory,include:'territory,app'});const points=(await this.api.list<unknown>(`/v1/apps/${current.id}/appPricePoints?${query}`,signal)).map(raw=>{const item=resource(raw,'appPricePoints',['customerPrice']);if(relation(raw,'territory','territories')!==desired.baseTerritory||relation(raw,'app','apps')!==current.id||typeof item.attributes.customerPrice!=='string')throw new AppStoreError('wrongParent','Price point does not belong to the requested app and territory.');return {id:item.id,customerPrice:decimal(item.attributes.customerPrice)};});if(new Set(points.map(item=>item.id)).size!==points.length)throw new AppStoreError('incompleteSnapshot','Duplicate price point IDs.');const matches=points.filter(point=>point.customerPrice===amount);if(matches.length!==1)throw new AppStoreError('ambiguousPrice','Exactly one catalog point must match the desired amount; no nearest-price approximation is allowed.');remote.desiredPrice={baseTerritory:desired.baseTerritory,currency:territories.find(item=>item.id===desired.baseTerritory)!.currency,customerPrice:amount,pointId:matches[0]!.id};
   }
  }
  if(selected.domains.includes('availability')){
   const raw=await this.#optional(`/v1/apps/${current.id}/appAvailabilityV2`,signal);let available:AvailabilityState|null=null;
   if(raw){const item=resource(raw,'appAvailabilities',['availableInNewTerritories']);if(typeof item.attributes.availableInNewTerritories!=='boolean')throw new AppStoreError('incompleteSnapshot','Future-territory behavior is unavailable.');const entries=(await this.api.list<unknown>(`/v2/appAvailabilities/${item.id}/territoryAvailabilities?include=territory`,signal)).map(raw=>{const entry=resource(raw,'territoryAvailabilities',['available']);const territory=relation(raw,'territory','territories');const statuses=object(object(raw).attributes).contentStatuses;if(!territories.some(item=>item.id===territory)||typeof entry.attributes.available!=='boolean'||!Array.isArray(statuses)||statuses.some(value=>typeof value!=='string'||!/^[A-Z_]{1,100}$/.test(value)))throw new AppStoreError('incompleteSnapshot','Territory availability fields are incomplete.');return {id:entry.id,territory,available:entry.attributes.available,contentStatuses:statuses as string[]};}).sort((a,b)=>a.territory.localeCompare(b.territory,'en'));if(new Set(entries.map(item=>item.territory)).size!==entries.length||new Set(entries.map(item=>item.id)).size!==entries.length)throw new AppStoreError('incompleteSnapshot','Duplicate territory availability.');available={id:item.id,availableInNewTerritories:item.attributes.availableInNewTerritories,territories:entries};}remote.availability=available as unknown as Json;
   if(intent.availability){const ids=intent.availability.territories==='all'?territories.map(item=>item.id):intent.availability.territories;if(ids.some(id=>!territories.some(item=>item.id===id)))throw new AppStoreError('unknownTerritory','Availability must use current territory catalog IDs, not locale codes.');remote.desiredAvailability={territories:[...ids].sort(),...(intent.availability.availableInNewTerritories===undefined?{}:{availableInNewTerritories:intent.availability.availableInNewTerritories})};}
  }
  const snapshot:CommerceSnapshot={root:await realpath(selected.root),target:{appId:current.id,bundleId:app.app.bundleId,scope:'app-wide commerce'},credentialContext:this.identity(),inputs:local.hashes,secretFingerprint:local.secretFingerprint,rulesVersion:'commerce-1',intent,remote};this.#last=structuredClone(snapshot);return snapshot;
 }
 summary(snapshot:Snapshot):Json{
  const actual=snapshot.remote.availability as unknown as AvailabilityState|null|undefined;const desired=snapshot.remote.desiredAvailability as {territories:string[];availableInNewTerritories?:boolean}|undefined;
  const configured=actual?.territories.filter(item=>item.available).map(item=>item.territory)??[];
  const additions=desired?.territories.filter(id=>!configured.includes(id))??[];const removals=desired?configured.filter(id=>!desired.territories.includes(id)):[];
  const futureChange=desired?.availableInNewTerritories!==undefined&&desired.availableInNewTerritories!==actual?.availableInNewTerritories;
  const unknown=desired?.territories.filter(id=>!actual?.territories.some(item=>item.territory===id))??[];
  return {scope:'app-wide',price:snapshot.remote.price??null,desiredPrice:snapshot.remote.desiredPrice??null,availability:actual as unknown as Json??null,availabilityComparison:desired?{requestedTerritories:desired.territories,additions,removals,unreportedTerritories:unknown,...(desired.availableInNewTerritories===undefined?{}:{requestedFutureTerritories:desired.availableInNewTerritories}),manualActionRequired:additions.length>0||removals.length>0||futureChange,explanation:'Generic availability writes are disabled: audited mutation routes are pre-order-specific. Review differences in App Store Connect. Configured availability does not prove effective distribution or fulfill owner obligations.'}:null};
 }
 propose(snapshot:Snapshot):Operation[]{
  const desired=snapshot.remote.desiredPrice as {baseTerritory:string;customerPrice:string;pointId:string}|undefined;if(!desired)return [];const before=snapshot.remote.price as unknown as PriceState|null;
  if(before?.baseTerritory===desired.baseTerritory&&before.current?.customerPrice===desired.customerPrice)return [];
  if(before&&!simpleSchedule(before,before.baseTerritory))throw new AppStoreError('complexPriceSchedule','Existing overrides or future schedules require manual preservation; v1 only replaces a simple current base price.');
  return [{id:'commerce-'+createHash('sha256').update(snapshot.target.appId!+':price').digest('hex').slice(0,24),domain:this.domain,kind:before?'update':'create',key:'price',scope:'APP-WIDE; immediate base price replacement and Apple-generated territorial equalization',before:snapshot.remote.price??null,after:{...desired,start:'immediate',affectedTerritories:snapshot.remote.territories!,scheduleImpact:'Replaces the simple current base schedule; no future scheduling supported.'},dependencies:[],affects:['price'],sensitive:false}];
 }
 async execute(operation:Readonly<Operation>,signal?:AbortSignal):Promise<void>{
  const prior=this.#last;const current=await this.capture(signal);if(!prior||canonical(prior)!==canonical(current))throw new AppStoreError('stalePlan','Commerce changed immediately before dispatch.');const desired=operation.after as {baseTerritory:string;pointId:string};
  const priceId='${newprice-0}';
  await this.api.request('/v1/appPriceSchedules',{method:'POST',body:{data:{type:'appPriceSchedules',relationships:{app:{data:{type:'apps',id:current.target.appId}},baseTerritory:{data:{type:'territories',id:desired.baseTerritory}},manualPrices:{data:[{type:'appPrices',id:priceId}]}}},included:[{type:'appPrices',id:priceId,attributes:{startDate:null,endDate:null},relationships:{appPricePoint:{data:{type:'appPricePoints',id:desired.pointId}}}}]},...(signal?{signal}:{})});
 }
 verify(operation:Readonly<Operation>,snapshot:Snapshot):boolean{const desired=operation.after as {baseTerritory:string;pointId:string;customerPrice:string};const price=snapshot.remote.price as unknown as PriceState|null;return !!price&&price.baseTerritory===desired.baseTerritory&&price.current?.pointId===desired.pointId&&price.current.customerPrice===desired.customerPrice&&simpleSchedule(price,desired.baseTerritory);}
 remoteIds(_operation:Readonly<Operation>,snapshot:Snapshot):string[]{const state=snapshot.remote.price as unknown as PriceState|null;return state?[state.id,...state.manual.map(item=>item.id)]:[];}
}
