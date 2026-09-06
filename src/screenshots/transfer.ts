import {request as httpsRequest} from 'node:https';
import {once} from 'node:events';
import {AppStoreError} from '../errors.js';
import type {AssetTransfer,AssetUploadOperation} from '../api/asset-transfer.js';
import {storageUrl,resolveStorage,uploadOperations} from './operations.js';
export class HttpsAssetTransfer implements AssetTransfer{
  constructor(private readonly dependencies:{resolve?:typeof resolveStorage;request?:typeof httpsRequest}={}){}
  async transfer(operation:AssetUploadOperation,bytes:AsyncIterable<Uint8Array>,signal:AbortSignal):Promise<void>{
    uploadOperations([{...operation,offset:0,requestHeaders:Object.entries(operation.headers).map(([name,value])=>({name,value}))}],operation.length);
    signal=AbortSignal.any([signal,AbortSignal.timeout(30000)]);
    const url=storageUrl(operation.url);const addresses=await (this.dependencies.resolve??resolveStorage)(url,signal);signal.throwIfAborted();
    const address=addresses[0]!;
    await new Promise<void>((resolve,reject)=>{
      // Pin the checked address for this connection, while TLS still validates the hostname.
      let sourceComplete=false;
      const request=(this.dependencies.request??httpsRequest)(url,{method:operation.method,agent:false,servername:url.hostname,headers:{...operation.headers,'content-length':String(operation.length)},lookup:(_hostname,_options,callback)=>{if(_options.all)callback(null,[address]);else callback(null,address.address,address.family);},signal},response=>{
        response.destroy();const status=response.statusCode??0;
        if(status>=200&&status<300){if(sourceComplete)resolve();else{request.destroy();reject(new AppStoreError('uploadIncomplete','Storage replied before the complete source was dispatched.','outcomeUnknown'));}}else{request.destroy();reject(new AppStoreError(status>=300&&status<400?'uploadRedirect':status===403?'uploadUrlExpired':status===429?'uploadRateLimited':'uploadRejected',`Storage transfer returned HTTP ${status}.`,'rejected',status));}
      });
      request.setTimeout(30000,()=>request.destroy(new Error('deadline')));
      request.on('error',()=>reject(new AppStoreError('uploadTransportFailed','Storage transfer was interrupted; the reservation is retained.','outcomeUnknown')));
      void (async()=>{let count=0;try{for await(const chunk of bytes){signal.throwIfAborted();if(request.destroyed)throw new Error('stopped');count+=chunk.byteLength;if(count>operation.length)throw new Error('range exceeded');if(!request.write(chunk))await once(request,'drain',{signal});}if(count!==operation.length)throw new Error('range incomplete');sourceComplete=true;request.end();}catch{request.destroy();reject(new AppStoreError('uploadSourceChanged','Source stream did not match the approved byte range.','outcomeUnknown'));}})();
    });
  }
}
export async function* segment(bytes:Buffer,offset:number,length:number):AsyncIterable<Uint8Array>{for(let position=offset;position<offset+length;position+=65536)yield bytes.subarray(position,Math.min(position+65536,offset+length));}
