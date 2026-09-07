import type { AppleValidationIssue } from '../errors.js';
const codes=new Set(['ENTITY_ERROR.ATTRIBUTE.INVALID','ENTITY_ERROR.ATTRIBUTE.REQUIRED','ENTITY_ERROR.ATTRIBUTE.INVALID.DUPLICATE','ENTITY_ERROR.RELATIONSHIP.INVALID','ENTITY_ERROR.RELATIONSHIP.REQUIRED','PARAMETER_ERROR.INVALID','PARAMETER_ERROR.MISSING','STATE_ERROR','FORBIDDEN_ERROR','NOT_FOUND','UNEXPECTED_ERROR']);
const fields=new Set(['name','subtitle','privacyPolicyUrl','description','keywords','supportUrl','marketingUrl','promotionalText','whatsNew','copyright','releaseType','versionString','platform','locale','contactFirstName','contactLastName','contactPhone','contactEmail','demoAccountName','demoAccountPassword','demoAccountRequired','notes','primaryCategory','secondaryCategory','app','appInfo','appStoreVersion','bundleId','identifier','capabilityType','settings','certificateType','csrContent','activated','udid','status','profileType','certificates','devices']);
// Only fixed enum-like codes and recognized field names leave the transport.
// Apple titles/details, arbitrary pointers and echoed values are never returned.
export async function validationErrors(response:Response,signal:AbortSignal):Promise<AppleValidationIssue[]>{
  const reader=response.body?.getReader();if(!reader)return [];const chunks:Uint8Array[]=[];let bytes=0;
  const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
  try{
    for(;;){signal.throwIfAborted();const item=await reader.read();signal.throwIfAborted();if(item.done)break;bytes+=item.value.byteLength;if(bytes>65_536)return [];chunks.push(item.value);}
    const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))) as {errors?:unknown};if(!Array.isArray(parsed.errors))return [];
    return parsed.errors.slice(0,20).flatMap(error=>{
      if(!error||typeof error!=='object')return [];
      const code=typeof error.code==='string'&&codes.has(error.code)?error.code:'UNCLASSIFIED_APPLE_ERROR';
      const pointer=typeof error.source?.pointer==='string'?error.source.pointer:'';
      const match=/^\/data\/(?:attributes|relationships)\/([A-Za-z]+)(?:\/(?:data|id|type|[0-9]{1,3}))*$/.exec(pointer);
      const field=match?.[1];return [{code,...(field&&fields.has(field)?{field}:{})}];
    });
  }catch{return [];}
  finally{signal.removeEventListener('abort',abort);await reader.cancel().catch(()=>{});reader.releaseLock();}
}
