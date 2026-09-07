import {createHash} from 'node:crypto';
import {AppStoreError} from '../errors.js';
import type {Operation,Json} from '../planning/model.js';
export interface ImageIntent{path:string;sha256:string;md5:string;size:number}
export interface SetIntent{mode:'merge'|'replace';images:ImageIntent[]}
export interface RemoteScreenshot{id:string;name:string;size:number;md5:string|null;state:string}
export interface RemoteSet{id:string;localeId:string;images:RemoteScreenshot[]}
export interface ScreenshotPayload{action:'set'|'upload'|'delete'|'order';locale:string;image?:ImageIntent;removeId?:string;order?:({id:string}|ImageIntent)[];setId?:string}
const id=(locale:string,action:string)=>'screenshot-'+createHash('sha256').update(locale+':'+action).digest('hex').slice(0,24);
export const equivalent=(remote:RemoteScreenshot,image:ImageIntent)=>remote.state==='COMPLETE'&&remote.size===image.size&&remote.md5===image.md5;
export function planSet(locale:string,intent:SetIntent,set:RemoteSet|null,localeId:string):Operation[]{
 const key='set:'+locale;const operations:Operation[]=[];const dependencies:string[]=[];
 const add=(action:ScreenshotPayload,kind:Operation['kind'],before:Json,after:Json,tag:string,depends=dependencies)=>{
  const operation:Operation={id:id(locale,tag),domain:'screenshots',kind,key,scope:`${locale}/APP_DESKTOP`,before,after,dependencies:[...depends],affects:[key],sensitive:false,payload:action as unknown as Json};operations.push(operation);return operation.id;
 };
 if(new Set(intent.images.map(image=>image.md5)).size!==intent.images.length)throw new AppStoreError('duplicateScreenshotBytes','A set must not repeat identical source bytes under different paths.');
 if(!set){if(!intent.images.length)return [];dependencies.push(add({action:'set',locale},'create',null,{localeId,display:'APP_DESKTOP'},'set'));}
 const current=set?.images??[];const desired:({id:string}|ImageIntent)[]=[];const selected=new Set<string>();const missing:ImageIntent[]=[];
 for(const image of intent.images){const matches=current.filter(remote=>equivalent(remote,image));if(matches.length>1)throw new AppStoreError('ambiguousScreenshot','Multiple existing screenshots match these bytes; choose the retained resource explicitly outside this plan.');const match=matches[0];if(match){selected.add(match.id);desired.push({id:match.id});}else{missing.push(image);desired.push(image);}}
 const extra=current.filter(remote=>!selected.has(remote.id));
 if(intent.mode==='merge'&&extra.some(remote=>remote.state!=='COMPLETE'||remote.md5===null))throw new AppStoreError('screenshotEquivalenceUnknown','An existing screenshot has pending or unverifiable bytes. Resolve its upload or explicitly use replace before reserving more.');
 if(intent.mode==='merge')desired.push(...extra.map(remote=>({id:remote.id})));
 if(desired.length>10)throw new AppStoreError('setFull','The complete merge order exceeds ten screenshots; explicitly approve replacement or reduce the manifest.');
 const removals=intent.mode==='replace'?extra:[];const early=Math.max(0,current.length+missing.length-10);
 const remove=(remote:RemoteScreenshot,gap:boolean)=>add({action:'delete',locale,removeId:remote.id,setId:set!.id},'remove',remote as unknown as Json,{removed:true,temporaryGap:gap,restoration:'Requires original bytes; no rollback is available.'},'delete:'+remote.id);
 for(const remote of removals.slice(0,early))dependencies.push(remove(remote,true));
 for(const image of missing)dependencies.push(add({action:'upload',locale,image},'create',null,image as unknown as Json,'upload:'+image.sha256));
 for(const remote of removals.slice(early))dependencies.push(remove(remote,false));
 const unchanged=desired.length===current.length&&desired.every((target,index)=>'id'in target&&target.id===current[index]?.id);
 if(!unchanged||operations.length)add({action:'order',locale,order:desired},'update',current.map(image=>image.id),desired as unknown as Json,'order');
 return operations;
}
