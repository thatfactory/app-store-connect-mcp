import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {AppStoreError} from '../errors.js';
export interface ImageFacts{width:number;height:number;format:'png'|'jpeg';colorModel:'RGB';alpha:false}
export interface ImageIdentity extends ImageFacts{size:number;sha256:string;md5:string}
export const macSizes=[[1280,800],[1440,900],[2560,1600],[2880,1800]] as const;
const crcTable=Uint32Array.from({length:256},(_,value)=>{for(let index=0;index<8;index++)value=(value&1)?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
export function crc32(bytes:Uint8Array):number{let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]!^(crc>>>8);return (crc^0xffffffff)>>>0;}
function invalid():never{throw new AppStoreError('invalidImage','Use complete, unchanged RGB PNG/JPEG screenshot bytes without alpha or orientation transforms.');}
export function imageFormat(bytes:Buffer,filename:string):'png'|'jpeg'{
  if(bytes.length===0||bytes.length>33_554_432)throw new AppStoreError('imageSize','Each image must contain between 1 byte and 32 MiB.');
  if(bytes.subarray(0,128).toString().startsWith('version https://git-lfs.github.com/spec/v1'))throw new AppStoreError('gitLfsPointer','Materialize original image bytes before upload.');
  const ext=path.extname(filename).toLowerCase();
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){
    if(ext!=='.png')invalid();let offset=8;let chunks=0;let header=false;let data=false;let ended=false;let leftData=false;
    while(offset<bytes.length){
      if(++chunks>10000||offset+12>bytes.length)invalid();const length=bytes.readUInt32BE(offset);const end=offset+12+length;if(end>bytes.length)invalid();
      const type=bytes.toString('ascii',offset+4,offset+8);if(!/^[A-Za-z]{4}$/.test(type)||crc32(bytes.subarray(offset+4,end-4))!==bytes.readUInt32BE(end-4))invalid();
      if(!header&&type!=='IHDR')invalid();
      if(type==='IHDR'){if(header||length!==13)invalid();header=true;const width=bytes.readUInt32BE(offset+8);const height=bytes.readUInt32BE(offset+12);if(!macSizes.some(size=>size[0]===width&&size[1]===height))throw new AppStoreError('imageDimensions','APP_DESKTOP requires a documented 16:10 Mac screenshot size.');}
      else if(type==='IDAT'){if(leftData)invalid();data=true;}
      else {if(data)leftData=true;if(type==='IEND'){if(length!==0||!data||end!==bytes.length)invalid();ended=true;}else if(type==='acTL'||(type[0]===type[0]!.toUpperCase()&&type!=='PLTE'))invalid();}
      offset=end;
    }
    if(!ended)invalid();return 'png';
  }
  if(bytes[0]===0xff&&bytes[1]===0xd8){if(!['.jpg','.jpeg'].includes(ext)||bytes.length<4||bytes[bytes.length-2]!==0xff||bytes[bytes.length-1]!==0xd9)invalid();return 'jpeg';}
  invalid();
}
export async function nativeDecode(bytes:Buffer,signal?:AbortSignal):Promise<ImageFacts>{
  if(process.platform!=='darwin')throw new AppStoreError('imageDecoderUnavailable','Decoded screenshot validation currently requires macOS with Apple Swift/ImageIO; other MCP features remain available.');
  const helper=fileURLToPath(new URL('../../resources/validate-image.swift',import.meta.url));
  return new Promise((resolve,reject)=>{
    const child=execFile('/usr/bin/swift',[helper],{timeout:30000,maxBuffer:4096,...(signal?{signal}:{})},(error,stdout,stderr)=>{
      if(error||stderr){reject(new AppStoreError('invalidImage','Native image decoding failed; verify a complete RGB image and an installed Apple Swift toolchain.'));return;}
      try{const facts=JSON.parse(stdout) as ImageFacts&{valid?:boolean};if(facts.valid!==true||!macSizes.some(size=>size[0]===facts.width&&size[1]===facts.height)||!['png','jpeg'].includes(facts.format)||facts.colorModel!=='RGB'||facts.alpha!==false)throw new Error();resolve({width:facts.width,height:facts.height,format:facts.format,colorModel:'RGB',alpha:false});}
      catch{reject(new AppStoreError('invalidImage','Native decoder did not verify the required screenshot properties.'));}
    });child.stdin?.on('error',()=>{});child.stdin?.end(bytes);
  });
}
const decodedCache=new Map<string,ImageFacts>();
export async function validateImage(bytes:Buffer,filename:string,signal?:AbortSignal,decode=nativeDecode):Promise<ImageIdentity>{
  signal?.throwIfAborted();const format=imageFormat(bytes,filename);const sha256=createHash('sha256').update(bytes).digest('hex');
  const facts=(decode===nativeDecode?decodedCache.get(sha256):undefined)??await decode(bytes,signal);if(facts.format!==format)invalid();
  if(decode===nativeDecode){if(decodedCache.size>=100)decodedCache.delete(decodedCache.keys().next().value!);decodedCache.set(sha256,facts);}
  signal?.throwIfAborted();return {...facts,size:bytes.length,sha256,md5:createHash('md5').update(bytes).digest('hex')};
}
