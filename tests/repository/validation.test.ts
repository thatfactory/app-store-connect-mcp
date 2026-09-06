import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { validateRepository } from '../../src/repository/validate.js';
import { parseJson } from '../../src/repository/json.js';
import { locales, type Selection } from '../../src/repository/schemas.js';
async function fixture(run:(root:string,write:(file:string,value:unknown)=>Promise<void>)=>Promise<void>):Promise<void>{
  const root=await realpath(await mkdtemp(path.join(tmpdir(),'asc-format-')));
  const write=async(file:string,value:unknown):Promise<void>=>{await mkdir(path.dirname(path.join(root,file)),{recursive:true});await writeFile(path.join(root,file),typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value));};
  try{
    await write('app.json',{schemaVersion:1,app:{appStoreId:'123',bundleId:'com.example.synthetic',primaryLocale:'en-US'},platforms:['MAC_OS'],localizations:locales});
    await write('versions/macOS/1.0/version.json',{schemaVersion:1,platform:'MAC_OS',versionString:'1.0'});
    await run(root,write);
  }finally{await rm(root,{recursive:true,force:true});}
}
const select=(root:string,domains:Selection['domains']=['appInfo','versionMetadata']):Selection=>({root,domains:domains!,platform:'macOS',version:'1.0'});
test('all five storefront locales validate offline and normalized text preserves intentional whitespace',async()=>fixture(async(root,write)=>{
  for(const locale of locales){await write(`info/${locale}.json`,{name:'Synthetic app'});await write(`versions/macOS/1.0/localizations/${locale}/metadata.json`,{});await write(`versions/macOS/1.0/localizations/${locale}/description.txt`,'  Café 日本語 😀\r\nSecond line\r\n');}
  const result=await validateRepository(select(root),[root],{});assert.equal(result.valid,true);
  assert.equal(result.desired['versions/macOS/1.0/localizations/ja/description.txt'],'  Café 日本語 😀\nSecond line');
  assert.equal(await readFile(path.join(root,'versions/macOS/1.0/localizations/ja/description.txt'),'utf8'),'  Café 日本語 😀\r\nSecond line\r\n');
  const again=await validateRepository(select(root),[root],{});assert.deepEqual(again.diagnostics,result.diagnostics);assert.deepEqual(again.hashes,result.hashes);
}));
test('a German text selection ignores broken unrelated screenshots and review secrets',async()=>fixture(async(root,write)=>{
  await write('versions/macOS/1.0/localizations/ja/screenshots.json','invalid');
  await write('versions/macOS/1.0/review.json',{demoAccountPassword:{env:'APPSTORE_REVIEW_DEMO_PASSWORD'}});
  const result=await validateRepository({...select(root),locales:['de-DE']},[root],{});assert.equal(result.valid,true);assert.equal(result.hashes['versions/macOS/1.0/review.json'],undefined);
}));
test('duplicate keys, escaped duplicate keys, excessive nesting and trailing JSON are rejected',()=>{
  for(const input of ['{"a":1,"a":2}','{"a":1,"\\u0061":2}','{}{}','[1,]','{"a":NaN}','1e999','['.repeat(65)+'0'+']'.repeat(65)])assert.throws(()=>parseJson(input));
  assert.deepEqual(JSON.parse(JSON.stringify(parseJson('{"a":[true,null,"brace } in string"]}'))),{a:[true,null,'brace } in string']});
});
test('unknown writable keys, bad locales and unsupported versions fail closed',async()=>fixture(async(root,write)=>{
  await write('info/en-US.json',{name:'Fine',subtile:'typo'});assert.equal((await validateRepository(select(root),[root],{})).valid,false);
  await assert.rejects(validateRepository({...select(root),locales:['jp' as never]},[root],{}),/supported/);
  await write('app.json',{schemaVersion:2});assert.equal((await validateRepository(select(root),[root],{})).valid,false);
}));
test('omission, null and empty values are distinct; unrelated remote fields have no local defaults',async()=>fixture(async(root,write)=>{
  await write('info/en-US.json',{subtitle:null});await write('info/de-DE.json',{subtitle:''});
  const result=await validateRepository(select(root,['appInfo']),[root],{});assert.equal(result.valid,true);
  assert.deepEqual(result.desired['info/en-US.json'],{subtitle:null});assert.deepEqual(result.desired['info/de-DE.json'],{subtitle:''});assert.equal(result.desired['info/fr-FR.json'],undefined);
}));
test('keyword budgets count UTF-8 bytes and emoji name limits remain conservative',async()=>fixture(async(root,write)=>{
  await write('versions/macOS/1.0/localizations/ja/keywords.txt','日'.repeat(34));await write('info/en-US.json',{name:'😀'.repeat(16)});
  const result=await validateRepository(select(root),[root],{});assert.equal(result.valid,false);
  assert.equal(result.measurements['versions/macOS/1.0/localizations/ja/keywords.txt']?.utf8Bytes,102);
  assert.ok(result.diagnostics.some(item=>item.rule==='fieldLimit'));
}));
test('malformed UTF-8, placeholders and credentials in URLs produce actionable diagnostics',async()=>fixture(async(root,write)=>{
  await write('versions/macOS/1.0/localizations/en-US/description.txt',Buffer.from([0xff]));await write('info/de-DE.json',{name:'TODO app',privacyPolicyUrl:'https://secret@example.com'});
  const result=await validateRepository(select(root),[root],{});assert.equal(result.valid,false);assert.ok(result.diagnostics.some(item=>item.rule==='invalidUtf8'));assert.ok(!JSON.stringify(result.diagnostics).includes('secret'));
}));
test('traversal, URL and symlink screenshot escapes are rejected without reading outside data',async()=>fixture(async(root,write)=>{
  const outside=await mkdtemp(path.join(tmpdir(),'asc-outside-'));
  try{
    await writeFile(path.join(outside,'secret.png'),'do-not-read');await symlink(path.join(outside,'secret.png'),path.join(root,'escape.png'));
    for(const reference of ['../secret.png','https://evil.test/a.png','escape.png']){
      await write('versions/macOS/1.0/localizations/en-US/screenshots.json',{mode:'merge',sets:{APP_DESKTOP:[reference]}});
      const result=await validateRepository(select(root,['screenshots']),[root],{});assert.equal(result.valid,false);assert.ok(!Object.values(result.desired).includes('do-not-read'));assert.equal(result.hashes[reference],undefined);
    }
    await assert.rejects(validateRepository(select(outside),[root],{}),/outside/);
  }finally{await rm(outside,{recursive:true,force:true});}
}));
test('Git LFS pointers, missing referenced assets and duplicate screenshot references fail',async()=>fixture(async(root,write)=>{
  await write('assets/image.png','version https://git-lfs.github.com/spec/v1\noid sha256:synthetic\nsize 123\n');
  await write('versions/macOS/1.0/localizations/en-US/screenshots.json',{mode:'replace',sets:{APP_DESKTOP:['assets/image.png','assets/image.png','assets/missing.png']}});
  const result=await validateRepository(select(root,['screenshots']),[root],{});for(const rule of ['gitLfsPointer','missingFile','duplicateValue'])assert.ok(result.diagnostics.some(item=>item.rule===rule));
}));
test('review environment references are field-allowlisted and secret changes invalidate process fingerprint',async()=>fixture(async(root,write)=>{
  await write('versions/macOS/1.0/review.json',{demoAccountRequired:true,demoAccountPassword:{env:'APPSTORE_REVIEW_DEMO_PASSWORD'}});
  const selection=select(root,['review']);const missing=await validateRepository(selection,[root],{});assert.equal(missing.valid,false);
  const first=await validateRepository(selection,[root],{APPSTORE_REVIEW_DEMO_PASSWORD:'secret-one'});const second=await validateRepository(selection,[root],{APPSTORE_REVIEW_DEMO_PASSWORD:'secret-two'});
  assert.equal(first.valid,true);assert.notEqual(first.secretFingerprint,second.secretFingerprint);assert.ok(!JSON.stringify(first).includes('secret-one'));
  await write('versions/macOS/1.0/review.json',{demoAccountPassword:{env:'APPSTORE_CONNECT_API_KEY_CONTENT'}});assert.equal((await validateRepository(selection,[root],{})).valid,false);
  await write('versions/macOS/1.0/review.json',{demoAccountPassword:'literal-forbidden'});assert.equal((await validateRepository(selection,[root],{})).valid,false);
}));
test('oversized text and directory/version mismatch do not validate',async()=>fixture(async(root,write)=>{
  await write('versions/macOS/1.0/localizations/en-US/description.txt','a'.repeat(1_048_577));await write('versions/macOS/1.0/version.json',{schemaVersion:1,platform:'MAC_OS',versionString:'1.1'});
  const result=await validateRepository(select(root),[root],{});assert.ok(result.diagnostics.some(item=>item.rule==='inputLimit'));assert.ok(result.diagnostics.some(item=>item.rule==='versionMismatch'));
}));
test('the checked-in synthetic example passes offline validation',async()=>{
  const root=await realpath('examples/minimal/AppStore');assert.equal((await validateRepository({root},[root],{})).valid,true);
});
test('cancelled validation stops without returning an apparently valid report',async()=>fixture(async(root)=>{
  await assert.rejects(validateRepository(select(root),[root],{},AbortSignal.abort()),/cancelled/);
}));
test('directory enumeration stops at its shared threshold and closes the iterator',async()=>{
  const {collectDirectoryNames}=await import('../../src/repository/files.js');
  let consumed=0;let closed=false;
  async function* entries(){try{for(let i=0;i<1_000_000;i++){consumed++;yield {name:String(i),isDirectory:()=>true,isSymbolicLink:()=>false};}}finally{closed=true;}}
  await assert.rejects(collectDirectoryNames(entries(),{remaining:2000}),/Directory entry limit/);
  assert.equal(consumed,2001);assert.equal(closed,true);
  const shared={remaining:2};
  async function* one(){yield {name:'one',isDirectory:()=>true,isSymbolicLink:()=>false};}
  await collectDirectoryNames(one(),shared);await collectDirectoryNames(one(),shared);
  await assert.rejects(collectDirectoryNames(one(),shared),/across the validation request/);
});
test('directory cancellation closes a streaming iterator before collecting names',async()=>{
  const {collectDirectoryNames}=await import('../../src/repository/files.js');let closed=false;let consumed=0;
  async function* entries(){try{for(let i=0;i<100;i++){consumed++;yield {name:String(i),isDirectory:()=>true,isSymbolicLink:()=>false};}}finally{closed=true;}}
  await assert.rejects(collectDirectoryNames(entries(),{remaining:2000},AbortSignal.abort()));assert.equal(closed,true);assert.equal(consumed,1);
});
