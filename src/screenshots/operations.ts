import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {AppStoreError} from '../errors.js';
import type {AssetUploadOperation} from '../api/asset-transfer.js';
export function uploadOperations(raw:unknown,size:number):AssetUploadOperation[]{
  if(!Array.isArray(raw)||raw.length===0||raw.length>100)throw new AppStoreError('invalidUploadOperations','Apple must provide a bounded, complete list of upload byte ranges.');
  const result:AssetUploadOperation[]=raw.map(item=>{
    if(!item||item.method!=='PUT'||typeof item.url!=='string'||!Number.isSafeInteger(item.offset)||!Number.isSafeInteger(item.length)||item.offset<0||item.length<=0||item.offset+item.length>size||!Array.isArray(item.requestHeaders)||item.requestHeaders.length>32)throw new AppStoreError('invalidUploadOperations','Upload method, range or headers do not match the supported transfer contract.');
    const headers:Record<string,string>={};
    for(const header of item.requestHeaders){
      if(!header||typeof header.name!=='string'||typeof header.value!=='string'||!/^[-A-Za-z0-9]+$/.test(header.name)||/[\r\n\0]/.test(header.value)||header.value.length>8192)throw new AppStoreError('invalidUploadHeaders','Upload headers are malformed.');
      const name=header.name.toLowerCase();if(Object.hasOwn(headers,name)||['authorization','proxy-authorization','cookie','host','connection','transfer-encoding'].includes(name))throw new AppStoreError('invalidUploadHeaders','Credential forwarding, routing headers and duplicate headers are forbidden.');
      headers[name]=header.value;
    }
    if(headers['content-length']!==undefined&&headers['content-length']!==String(item.length))throw new AppStoreError('invalidUploadHeaders','Content-Length must equal the exact byte range length.');
    storageUrl(item.url);return {method:'PUT',url:item.url,offset:item.offset,length:item.length,headers};
  });
  let offset=0;for(const operation of [...result].sort((a,b)=>a.offset-b.offset)){if(operation.offset!==offset)throw new AppStoreError('invalidUploadOperations','Upload ranges overlap or leave gaps.');offset+=operation.length;}
  if(offset!==size)throw new AppStoreError('invalidUploadOperations','Upload ranges do not cover the entire source.');return result;
}
export function storageUrl(input:string):URL{
  let url:URL;try{url=new URL(input);}catch{throw new AppStoreError('unsafeUploadUrl','Invalid storage destination.');}
  const host=url.hostname.toLowerCase();
  const appleStorageHost=['blobstore.apple.com','object-storage.apple.com'].some(suffix=>host===suffix||host.endsWith(`.${suffix}`));
  if(url.protocol!=='https:'||url.username||url.password||url.hash||url.port||isIP(host)||!appleStorageHost)throw new AppStoreError('unsafeUploadUrl','Storage URL must use an audited Apple storage HTTPS host family; other families require a separate audit.');
  return url;
}
export function isPublicAddress(address:string):boolean{
  if(isIP(address)===4){const octets=address.split('.').map(Number);const a=octets[0]!,b=octets[1]!,c=octets[2]!;
    return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&((b===0&&(c===0||c===2))||b===168||(b===88&&c===99)))||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113));
  }
  if(isIP(address)===6&&!address.includes('.')){
    const halves=address.split('::');const left=halves[0]!.split(':').filter(Boolean);const right=halves[1]?.split(':').filter(Boolean)??[];
    const groups=halves.length===2?[...left,...Array(8-left.length-right.length).fill('0'),...right]:left;
    const first=parseInt(groups[0]!,16),second=parseInt(groups[1]!,16);
    return first>=0x2000&&first<=0x3fff&&!(first===0x2001&&(second<0x200||second===0xdb8))&&first!==0x2002&&!(first===0x3fff&&second<0x1000);
  }
  return false;
}
export async function resolveStorage(url:URL,signal?:AbortSignal):Promise<{address:string;family:4|6}[]>{
  signal?.throwIfAborted();
  let abort:(()=>void)|undefined;
  const cancelled=new Promise<never>((_,reject)=>{abort=()=>reject(new AppStoreError('uploadCancelled','Storage lookup cancelled.'));signal?.addEventListener('abort',abort,{once:true});});
  let addresses;try{addresses=await Promise.race([lookup(url.hostname,{all:true,verbatim:true}),cancelled]);}finally{if(abort)signal?.removeEventListener('abort',abort);}
  if(addresses.length===0||addresses.length>16||addresses.some(item=>!isPublicAddress(item.address)))throw new AppStoreError('unsafeUploadDestination','Storage DNS must resolve only to public addresses.');
  return addresses.map(item=>({address:item.address,family:item.family as 4|6}));
}
