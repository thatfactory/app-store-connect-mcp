import {deflateSync} from 'node:zlib';
import {crc32} from '../../src/screenshots/validate.js';
export function png(width=1280,height=800,alpha=false):Buffer{
  const chunk=(type:string,data:Buffer)=>{const bytes=Buffer.alloc(data.length+12);bytes.writeUInt32BE(data.length);bytes.write(type,4);data.copy(bytes,8);bytes.writeUInt32BE(crc32(bytes.subarray(4,bytes.length-4)),bytes.length-4);return bytes;};
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=alpha?6:2;
  const stride=width*(alpha?4:3)+1;const pixels=Buffer.alloc(stride*height);for(let row=0;row<height;row++)for(let column=1;column<stride;column++)pixels[row*stride+column]=(column%4===0&&alpha)?255:80;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
export const decoded=async()=>({width:1280,height:800,format:'png' as const,colorModel:'RGB' as const,alpha:false as const});
