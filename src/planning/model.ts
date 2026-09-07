import { createHash } from 'node:crypto';
export type Json = null | boolean | number | string | Json[] | {[key:string]:Json};
export interface Snapshot {
  root:string;
  target:Record<string,string>;
  credentialContext:string;
  inputs:Record<string,string>;
  secretFingerprint:string;
  rulesVersion:string;
  remote:Record<string,Json>;
}
export interface Operation {
  id:string;
  domain:string;
  kind:'create'|'update'|'remove'|'submission';
  key:string;
  scope:string;
  before?:Json;
  after?:Json;
  dependencies:string[];
  affects:string[];
  sensitive:boolean;
  payload?:Json;
}
export interface Adapter {
  readonly domain:string;
  capture(signal?:AbortSignal):Promise<Snapshot>;
  propose(snapshot:Snapshot):Operation[];
  execute(operation:Readonly<Operation>,signal?:AbortSignal):Promise<void>;
  summary?(snapshot:Snapshot):Json;
  remoteIds?(operation:Readonly<Operation>,snapshot:Snapshot):string[];
  verify(operation:Readonly<Operation>,snapshot:Snapshot):boolean;
}
export function canonical(value:unknown):string {
  if(value===undefined)return 'undefined';
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(',')}}`;
  throw new Error('Not a serializable plan value');
}
export function diffManaged(domain:string,desired:Record<string,Json>,remote:Record<string,Json>,scope:string,sensitive=false):Operation[] {
  return Object.keys(desired).sort().flatMap(key=>{
    const before=remote[key];const after=desired[key]!;
    if(Object.hasOwn(remote,key)&&canonical(before)===canonical(after))return [];
    const id=`op-${createHash('sha256').update(canonical([domain,scope,key])).digest('hex').slice(0,24)}`;
    return [{id,domain,kind:Object.hasOwn(remote,key)?'update':'create',key,scope,...(before===undefined?{}:{before}),after,dependencies:[],affects:[key],sensitive}];
  });
}
export function freeze<T>(value:T):T {
  if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}
  return value;
}
