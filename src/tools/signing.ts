import {constants} from 'node:fs';
import {lstat,open,realpath,unlink} from 'node:fs/promises';
import path from 'node:path';
import {createHash,X509Certificate} from 'node:crypto';
import {z} from 'zod';
import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {Configuration} from '../config.js';
import {contains} from '../repository/files.js';
import {AuthManager} from '../api/auth.js';
import {ApiClient} from '../api/client.js';
import {AppStoreError,publicError} from '../errors.js';
import type {PlanEngine} from '../planning/engine.js';
import {SigningAdapter,signingSelection} from '../domains/signing.js';
import {downloadContent,provisioningInventory} from '../signing/inventory.js';
import type {CertificateRecord,DeviceRecord,ProfileRecord} from '../signing/inventory.js';

const exactId=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const artifact=z.object({family:z.enum(['certificate','profile']),id:exactId,destination:z.string().min(1)}).strict();

export function isDerEnvelope(bytes:Buffer):boolean {
  if(bytes.length<2||bytes[0]!==0x30)return false;const first=bytes[1]!;if(first<0x80)return first+2===bytes.length;const count=first&0x7f;if(count===0||count>4||2+count>bytes.length||bytes[2]===0)return false;let length=0;for(let index=0;index<count;index++)length=length*256+bytes[2+index]!;return 2+count+length===bytes.length;
}

export async function writeSigningArtifact(api:ApiClient,args:z.infer<typeof artifact>,allowedRoots:readonly string[],signal?:AbortSignal):Promise<{path:string;type:string;size:number;sha256:string}> {
  if(!path.isAbsolute(args.destination))throw new AppStoreError('unsafePath','Artifact destination must be an absolute path.');const requestedParent=path.dirname(args.destination);const parent=await realpath(requestedParent);if(parent!==requestedParent||!allowedRoots.some(root=>contains(root,parent)))throw new AppStoreError('unsafePath','Artifact destination parent must be a canonical directory inside an approved root.');const parentEntry=await lstat(parent);if(!parentEntry.isDirectory()||parentEntry.isSymbolicLink())throw new AppStoreError('unsafePath','Artifact destination parent must be a real directory.');const destination=path.join(parent,path.basename(args.destination));
  const bytes=await downloadContent(api,args.family,args.id,signal);if(args.family==='certificate'){try{new X509Certificate(bytes);}catch{throw new AppStoreError('invalidArtifact','Downloaded certificate is not a valid DER X.509 certificate.');}}else if(!isDerEnvelope(bytes))throw new AppStoreError('invalidArtifact','Downloaded provisioning profile is not a complete DER CMS envelope.');
  const handle=await open(destination,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);let complete=false;try{const entry=await handle.stat();if(!entry.isFile())throw new AppStoreError('unsafePath','Artifact destination must be a new regular file.');await handle.writeFile(bytes);await handle.sync();complete=true;}finally{await handle.close();if(!complete)await unlink(destination).catch(()=>{});}
  return {path:destination,type:args.family,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}

export function publicProvisioningInventory(inventory:{certificates:CertificateRecord[];devices:DeviceRecord[];profiles:ProfileRecord[]},family:'certificates'|'devices'|'profiles'|'all',ids:readonly string[]=[]):Record<string,unknown> {
  const selected=new Set(ids);const include=(id:string)=>!selected.size||selected.has(id);const fingerprint=(value:string)=>createHash('sha256').update(value).digest('hex');
  const output={
    ...(family==='all'||family==='certificates'?{certificates:inventory.certificates.filter(item=>include(item.id)).map(({serialFingerprint,...item})=>({...item,serialFingerprint:fingerprint(serialFingerprint)}))}:{}),
    ...(family==='all'||family==='devices'?{devices:inventory.devices.filter(item=>include(item.id)).map(({udid,...item})=>({...item,udidFingerprint:fingerprint(udid)}))}:{}),
    ...(family==='all'||family==='profiles'?{profiles:inventory.profiles.filter(item=>include(item.id)).map(({uuid,...item})=>({...item,uuidFingerprint:fingerprint(uuid)}))}:{}),
  };
  if(selected.size){const found=new Set(Object.values(output).flat().map(item=>item.id));if([...selected].some(id=>!found.has(id)))throw new AppStoreError('resourceNotFound','One or more selected provisioning resources were not found in the requested family.');}
  return output;
}

export function registerSigning(server:McpServer,config:Configuration,plans:PlanEngine):void {
  const auth=new AuthManager();const api=new ApiClient(auth);
  const result=(data:Record<string,unknown>)=>{const text=JSON.stringify(data);if(text.length>128_000)throw new AppStoreError('resultTooLarge','Select fewer exact provisioning resource IDs.');return {content:[{type:'text' as const,text}],structuredContent:data};};
  const failure=(error:unknown)=>({isError:true,...result(publicError(error))});
  server.registerTool('get_provisioning_resources',{
    description:'Read bounded certificate, device and profile inventory without artifact contents. Exact IDs remain available for typed planning; serial numbers, UDIDs and profile UUIDs are fingerprinted in the response.',
    inputSchema:z.object({family:z.enum(['certificates','devices','profiles','all']).default('all'),ids:z.array(exactId).max(100).optional()}).strict(),
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true},
  },async(args,extra)=>{try{
    return result(publicProvisioningInventory(await provisioningInventory(api,extra.signal),args.family,args.ids));
  }catch(error){return failure(error);}});
  server.registerTool('plan_signing_changes',{
    description:'Plan one explicit sensitive certificate, device or profile lifecycle action. CSR files stay under an approved root; private keys are rejected. Destructive revocation/deletion is separate and shows affected profile counts. Apply requires the exact approved operation.',
    inputSchema:signingSelection,
    annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:true},
  },async(args,extra)=>{try{return result(await plans.create(new SigningAdapter(args,config.allowedRoots,api,()=>auth.identity()),extra.signal));}catch(error){return failure(error);}});
  server.registerTool('download_signing_artifact',{
    description:'Download one exact certificate or provisioning profile to a new approved local file with mode 0600. Raw contents never appear in the MCP response and existing paths are never overwritten.',
    inputSchema:artifact,
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true},
  },async(args,extra)=>{try{
    return result(await writeSigningArtifact(api,args,config.allowedRoots,extra.signal));
  }catch(error){return failure(error);}});
}
