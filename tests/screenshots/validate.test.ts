import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateImage,imageFormat,crc32} from '../../src/screenshots/validate.js';
import {png,decoded} from './fixture.js';
test('PNG CRC, boundaries, extension and Mac dimensions fail before native decoding',()=>{
  const valid=png();assert.equal(imageFormat(valid,'screen.png'),'png');assert.throws(()=>imageFormat(valid,'screen.jpg'));assert.throws(()=>imageFormat(valid.subarray(0,valid.length-1),'screen.png'));
  const corrupt=Buffer.from(valid);corrupt[corrupt.length-5]^=1;assert.throws(()=>imageFormat(corrupt,'screen.png'));
  assert.throws(()=>imageFormat(png(640,400),'screen.png'),/documented/);assert.throws(()=>imageFormat(Buffer.from('RIFFnot a PNG'),'screen.webp'));assert.throws(()=>imageFormat(Buffer.from('version https://git-lfs.github.com/spec/v1\n'),'screen.png'),/Materialize/);
});
test('local SHA256 and Apple MD5 remain separate algorithms',async()=>{
  const facts=await validateImage(png(),'screen.png',undefined,decoded);assert.equal(facts.sha256.length,64);assert.equal(facts.md5.length,32);assert.equal(facts.width,1280);assert.notEqual(facts.sha256,facts.md5);
});
test('native ImageIO fully decodes valid RGB PNG and rejects alpha',{skip:process.platform!=='darwin'},async()=>{
  const facts=await validateImage(png(),'screen.png');assert.equal(facts.format,'png');assert.equal(facts.alpha,false);
  await assert.rejects(validateImage(png(1280,800,true),'alpha.png'),/Native/);
});

test('PNG checksum matches an independent standard vector',()=>{assert.equal(crc32(Buffer.from('123456789')),0xcbf43926);});
test('native JPEG decoding verifies complete RGB bytes and rejects truncation',{skip:process.platform!=='darwin'},async()=>{
 const bytes=await readFile(new URL('./rgb.jpg',import.meta.url));assert.equal((await validateImage(bytes,'image.jpeg')).format,'jpeg');
 await assert.rejects(validateImage(bytes.subarray(0,bytes.length-10),'image.jpg'));
 const damaged=Buffer.concat([bytes.subarray(0,100),Buffer.from([255,217])]);await assert.rejects(validateImage(damaged,'image.jpg'));
});
