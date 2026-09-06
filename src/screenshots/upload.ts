import {randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import type {ApiClient,ApiDocument} from '../api/client.js';
import type {AssetTransfer} from '../api/asset-transfer.js';
import {resource} from '../api/resources/discovery.js';
import {AppStoreError} from '../errors.js';
import type {JournalStore} from '../planning/journal.js';
import {validateImage,nativeDecode,type ImageIdentity} from './validate.js';
import {uploadOperations} from './operations.js';
import {segment} from './transfer.js';
export interface ImageSource{name:string;read(signal?:AbortSignal):Promise<Buffer>}
export interface UploadReceipt{
  sessionId:string;setId:string;fileName:string;sourceName:string;sha256:string;md5:string;size:number;
  stage:'reserving'|'reserveUnknown'|'reserved'|'transferring'|'transferFailed'|'committing'|'commitUnknown'|'processing'|'complete'|'failed'|'cancelled';
  screenshotId?:string;diagnosticCodes?:string[];transferredOffsets:number[];code?:string;updatedAt:string;
}
interface RemoteImage{id:string;fileName:string;fileSize:number;checksum?:string;state:string;operations:unknown;diagnosticCodes:string[]}
export class ScreenshotUploader{
  constructor(private readonly api:ApiClient,private readonly transfer:AssetTransfer,private readonly journal:JournalStore,private readonly allowWrites:boolean,private readonly options:{decode?:typeof nativeDecode;pollMs?:number;pollTimeoutMs?:number;partRetries?:number}={}){
    for(const [value,maximum] of [[options.pollMs??1000,5000],[options.pollTimeoutMs??30000,60000],[options.partRetries??1,2]])if(!Number.isSafeInteger(value)||value!<0||value!>maximum!)throw new AppStoreError('invalidConfiguration','Screenshot retry and polling options must stay within their bounded budgets.');
  }
  async #save(receipt:UploadReceipt):Promise<void>{receipt.updatedAt=new Date().toISOString();await this.journal.save(receipt.sessionId,'journal',receipt);}
  #image(raw:unknown,receipt:UploadReceipt):RemoteImage{
    const entry=resource(raw,'appScreenshots',['fileName','fileSize','sourceFileChecksum']);const attrs=(raw as {attributes:Record<string,unknown>}).attributes;
    if(entry.attributes.fileName!==receipt.fileName||entry.attributes.fileSize!==receipt.size)throw new AppStoreError('reservationMismatch','Screenshot reservation does not match its recorded source.');
    const parent=(raw as {relationships?:{appScreenshotSet?:{data?:{id?:unknown}}}}).relationships?.appScreenshotSet?.data?.id;
    if(parent!==undefined&&parent!==receipt.setId)throw new AppStoreError('wrongParent','Screenshot belongs to another set.');
    const state=(attrs.assetDeliveryState as {state?:unknown})?.state;
    if(typeof state!=='string'||!['AWAITING_UPLOAD','UPLOAD_COMPLETE','COMPLETE','FAILED'].includes(state))throw new AppStoreError('unknownAssetState','Apple returned an unsupported asset-processing state.');
    const checksum=entry.attributes.sourceFileChecksum;if(checksum!==undefined&&checksum!==null&&(typeof checksum!=='string'||!/^[0-9a-fA-F]{32}$/.test(checksum)))throw new AppStoreError('invalidChecksum','Apple returned an invalid source checksum.');
    const errors=(attrs.assetDeliveryState as {errors?:unknown})?.errors;
    const recognized=new Set(['INVALID_IMAGE','IMAGE_TOO_LARGE','INVALID_IMAGE_SIZE','INVALID_IMAGE_DIMENSIONS','UPLOAD_FAILED','INVALID_FILE','FILE_SIZE_MISMATCH']);
    const diagnosticCodes=Array.isArray(errors)?errors.slice(0,20).map(error=>error&&typeof error.code==='string'&&recognized.has(error.code)?error.code as string:'UNCLASSIFIED_ASSET_ERROR'):[];
    return {diagnosticCodes,id:entry.id,fileName:receipt.fileName,fileSize:receipt.size,state,operations:attrs.uploadOperations,...(typeof checksum==='string'?{checksum:checksum.toLowerCase()}: {})};
  }
  async #members(setId:string,signal?:AbortSignal):Promise<unknown[]>{const result=await this.api.list<unknown>(`/v1/appScreenshotSets/${setId}/appScreenshots`,signal);if(new Set(result.map(raw=>resource(raw,'appScreenshots',[]).id)).size!==result.length)throw new AppStoreError('incompleteSnapshot','Duplicate screenshot membership.');if(result.length>10)throw new AppStoreError('incompleteSnapshot','Screenshot set exceeds the supported count limit.');return result;}
  async #read(receipt:UploadReceipt,signal?:AbortSignal):Promise<RemoteImage>{
    if(!receipt.screenshotId)throw new AppStoreError('reservationUnknown','Resolve the uncertain reservation before transfer.');
    const doc=await this.api.request<ApiDocument>(`/v1/appScreenshots/${receipt.screenshotId}?include=appScreenshotSet`,signal?{signal}:{});
    const image=this.#image(doc?.data,receipt);if(image.id!==receipt.screenshotId)throw new AppStoreError('reservationMismatch','Screenshot identity changed.');
    const parent=(doc?.data as {relationships?:{appScreenshotSet?:{data?:{id?:unknown}}}})?.relationships?.appScreenshotSet?.data?.id;
    if(parent===undefined){const members=await this.#members(receipt.setId,signal);if(members.filter(raw=>resource(raw,'appScreenshots',[]).id===image.id).length!==1)throw new AppStoreError('wrongParent','Screenshot membership could not be verified.');}
    return image;
  }
  async #bytes(source:ImageSource,identity:Pick<ImageIdentity,'sha256'|'size'>,signal?:AbortSignal):Promise<Buffer>{const bytes=await source.read(signal);if(bytes.length!==identity.size||createHash('sha256').update(bytes).digest('hex')!==identity.sha256)throw new AppStoreError('sourceChanged','Screenshot bytes changed after approval; no further transfer or commit was sent.');return bytes;}
  async start(setId:string,source:ImageSource,approvedSha256:string,signal?:AbortSignal):Promise<UploadReceipt>{
    if(!this.allowWrites)throw new AppStoreError('readOnly','Screenshot transfer requires the authorized write gate.');
    if(!/^[A-Za-z0-9_-]{1,128}$/.test(setId)||path.basename(source.name)!==source.name||/[\x00-\x1f]/.test(source.name)||Buffer.byteLength(source.name)>160)throw new AppStoreError('invalidScreenshotTarget','Select an exact set and a bounded plain source filename.');
    const sourceName=source.name;
    const bytes=await source.read(signal);const identity=await validateImage(bytes,sourceName,signal,this.options.decode??nativeDecode);
    if(identity.sha256!==approvedSha256)throw new AppStoreError('sourceChanged','Screenshot hash differs from the approved source.');
    const setDoc=await this.api.request<ApiDocument>(`/v1/appScreenshotSets/${setId}`,signal?{signal}:{});const set=resource(setDoc?.data,'appScreenshotSets',['screenshotDisplayType']);if(set.id!==setId||set.attributes.screenshotDisplayType!=='APP_DESKTOP')throw new AppStoreError('displayMismatch','The exact destination set must be APP_DESKTOP.');
    const prior=await this.#members(setId,signal);if(prior.length>=10)throw new AppStoreError('setFull','Approve necessary removals before uploading into a full set.');
    const priorIds=new Set(prior.map(raw=>resource(raw,'appScreenshots',[]).id));const sessionId=randomUUID();
    const receipt:UploadReceipt={sessionId,setId,fileName:`mcp-${sessionId}-${sourceName}`,sourceName,sha256:identity.sha256,md5:identity.md5,size:identity.size,stage:'reserving',transferredOffsets:[],updatedAt:new Date().toISOString()};await this.#save(receipt);
    try{
      try{
        const response=await this.api.request<ApiDocument>('/v1/appScreenshots',{method:'POST',body:{data:{type:'appScreenshots',attributes:{fileName:receipt.fileName,fileSize:receipt.size},relationships:{appScreenshotSet:{data:{type:'appScreenshotSets',id:setId}}}}},...(signal?{signal}:{})});
        try{receipt.screenshotId=this.#image(response?.data,receipt).id;}catch{throw new AppStoreError('invalidReservation','Reservation response could not be verified.','outcomeUnknown');}
      }catch(error){
        if(!(error instanceof AppStoreError)||error.executionDisposition==='outcomeUnknown'){
          receipt.stage='reserveUnknown';receipt.code=error instanceof AppStoreError?error.code:'reservationInterrupted';await this.#save(receipt);
          try{const candidates=(await this.#members(setId,signal)).filter(raw=>{const value=resource(raw,'appScreenshots',['fileName','fileSize']);return !priorIds.has(value.id)&&value.attributes.fileName===receipt.fileName&&value.attributes.fileSize===receipt.size;});if(candidates.length!==1)return receipt;receipt.screenshotId=this.#image(candidates[0],receipt).id;}
          catch{return receipt;}
        }else throw error;
      }
      receipt.stage='reserved';delete receipt.code;await this.#save(receipt);const remote=await this.#read(receipt,signal);
      const operations=uploadOperations(remote.operations,receipt.size);
      for(const operation of operations){
        signal?.throwIfAborted();receipt.stage='transferring';await this.#save(receipt);
        const fresh=await this.#bytes(source,identity,signal);
        for(let attempt=0;;attempt++){
          try{await this.transfer.transfer(operation,segment(fresh,operation.offset,operation.length),signal??new AbortController().signal);break;}
          catch(error){const retry=error instanceof AppStoreError&&(error.code==='uploadTransportFailed'||error.code==='uploadRateLimited'||(error.status??0)>=500);if(!retry||attempt>=(this.options.partRetries??1))throw error;await this.#bytes(source,identity,signal);await delay(100*(attempt+1),undefined,signal?{signal}:{});}
        }
        receipt.transferredOffsets.push(operation.offset);await this.#save(receipt);
      }
      await this.#bytes(source,identity,signal);receipt.stage='committing';await this.#save(receipt);
      try{await this.api.request(`/v1/appScreenshots/${receipt.screenshotId}`,{method:'PATCH',body:{data:{type:'appScreenshots',id:receipt.screenshotId,attributes:{uploaded:true,sourceFileChecksum:receipt.md5}}},...(signal?{signal}:{})});receipt.stage='processing';}
      catch(error){if(error instanceof AppStoreError&&error.executionDisposition!=='outcomeUnknown')throw error;receipt.stage='commitUnknown';receipt.code=error instanceof AppStoreError?error.code:'commitInterrupted';}
      await this.#save(receipt);return await this.poll(receipt,signal);
    }catch(error){receipt.code=error instanceof AppStoreError?error.code:'uploadInterrupted';receipt.stage=signal?.aborted?'cancelled':receipt.stage==='transferring'?'transferFailed':'failed';await this.#save(receipt);return receipt;}
  }
  async reconcileReservation(original:UploadReceipt,signal?:AbortSignal):Promise<UploadReceipt>{
    const receipt=structuredClone(original);if(receipt.screenshotId)return this.poll(receipt,signal);
    const candidates=(await this.#members(receipt.setId,signal)).filter(raw=>{const value=resource(raw,'appScreenshots',['fileName','fileSize']);return value.attributes.fileName===receipt.fileName&&value.attributes.fileSize===receipt.size;});
    if(candidates.length===1){receipt.screenshotId=this.#image(candidates[0],receipt).id;receipt.stage='reserved';delete receipt.code;await this.#save(receipt);}
    return receipt;
  }
  async poll(original:UploadReceipt,signal?:AbortSignal):Promise<UploadReceipt>{
    const receipt=structuredClone(original);if(!receipt.screenshotId)return receipt;
    const timeout=this.options.pollTimeoutMs??30000;const deadline=Date.now()+timeout;let reads=0;
    const pollSignal=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(timeout===0?30000:timeout)]);
    do{
      if(signal?.aborted){receipt.stage='cancelled';await this.#save(receipt);return receipt;}
      try{const current=await this.#read(receipt,pollSignal);
        if(current.state==='FAILED'){receipt.stage='failed';receipt.code='assetProcessingFailed';receipt.diagnosticCodes=current.diagnosticCodes;await this.#save(receipt);return receipt;}
        if(current.state==='COMPLETE'){if(current.checksum!==receipt.md5){receipt.stage='failed';receipt.code='checksumMismatch';}else{receipt.stage='complete';delete receipt.code;}await this.#save(receipt);return receipt;}
        if(current.state==='UPLOAD_COMPLETE'&&current.checksum===receipt.md5){receipt.stage='processing';delete receipt.code;}
      }catch(error){receipt.code=error instanceof AppStoreError?error.code:'processingReadFailed';break;}
      if(Date.now()>=deadline)break;await delay(Math.min(this.options.pollMs??1000,Math.max(0,deadline-Date.now())),undefined,signal?{signal}:{}).catch(()=>{});
    }while(Date.now()<deadline&&++reads<60);
    await this.#save(receipt);return receipt;
  }
}
