import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,realpath,rm,stat,symlink,writeFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {ApiClient} from '../../src/api/client.js';
import {SigningAdapter} from '../../src/domains/signing.js';
import {PlanEngine} from '../../src/planning/engine.js';
import {validateCsr} from '../../src/signing/csr.js';
import {provisioningInventory} from '../../src/signing/inventory.js';
import {isDerEnvelope,publicProvisioningInventory,writeSigningArtifact} from '../../src/tools/signing.js';

const native={skip:process.platform!=='darwin'};
const certificate=(id:string,type='IOS_DEVELOPMENT',expiration='2999-01-01T00:00:00Z',certificateContent?:string)=>({id,type:'certificates',attributes:{name:'Development certificate',certificateType:type,platform:'IOS',expirationDate:expiration,activated:true,serialNumber:'01',...(certificateContent?{certificateContent}:{})}});
const device=(id:string,udid='00008110-001234567890001E')=>({id,type:'devices',attributes:{name:'Owner device',platform:'IOS',udid,deviceClass:'IPHONE',status:'ENABLED',model:'iPhone',addedDate:'2026-01-01T00:00:00Z'}});
const profile=(id:string,name='Development profile',certs=['CERT'],devices=['DEVICE'])=>({id,type:'profiles',attributes:{name,platform:'IOS',profileType:'IOS_APP_DEVELOPMENT',profileState:'ACTIVE',uuid:'11111111-1111-1111-1111-111111111111',createdDate:'2026-01-01T00:00:00Z',expirationDate:'2999-01-01T00:00:00Z'},relationships:{bundleId:{data:{type:'bundleIds',id:'BUNDLE'}},certificates:{data:certs.map(id=>({type:'certificates',id}))},devices:{data:devices.map(id=>({type:'devices',id}))}}});

async function fixture(t:test.TestContext){
  const checkout=await realpath(await mkdtemp(path.join(os.tmpdir(),'asc-signing-')));t.after(()=>rm(checkout,{recursive:true,force:true}));const root=path.join(checkout,'AppStore');await mkdir(root);
  const key=path.join(checkout,'test-key.pem');const csrPath=path.join(root,'request.csr');execFileSync('/usr/bin/openssl',['req','-new','-newkey','rsa:2048','-nodes','-subj','/CN=Test Signing','-keyout',key,'-out',csrPath],{stdio:'ignore'});const matchingPath=path.join(checkout,'matching.der');execFileSync('/usr/bin/openssl',['req','-x509','-key',key,'-in',csrPath,'-outform','DER','-out',matchingPath,'-days','1'],{stdio:'ignore'});const matchingContent=(await readFile(matchingPath)).toString('base64');const otherKey=path.join(checkout,'other-key.pem');const otherCsr=path.join(checkout,'other.csr');const otherPath=path.join(checkout,'other.der');execFileSync('/usr/bin/openssl',['req','-new','-newkey','rsa:2048','-nodes','-subj','/CN=Other','-keyout',otherKey,'-out',otherCsr],{stdio:'ignore'});execFileSync('/usr/bin/openssl',['req','-x509','-key',otherKey,'-in',otherCsr,'-outform','DER','-out',otherPath,'-days','1'],{stdio:'ignore'});const otherContent=(await readFile(otherPath)).toString('base64');
  const state={certificates:[certificate('CERT')],devices:[device('DEVICE')],profiles:[profile('PROFILE')],unknown:false,forbidden:false,accountLimit:false,concurrentExtra:false,mismatchedCertificate:false};const calls:{method:string;url:string;body?:any}[]=[];
  const api=new ApiClient({token:()=> 'api-secret'},{readRetries:0,fetch:async(input,options)=>{
    const url=new URL(String(input));const method=options?.method??'GET';const body=options?.body?JSON.parse(String(options.body)):undefined;calls.push({method,url:url.pathname,body});
    if(method==='GET'){
      if(url.pathname==='/v1/certificates')return Response.json({data:state.certificates});if(url.pathname==='/v1/devices')return Response.json({data:state.devices});if(url.pathname==='/v1/profiles')return Response.json({data:state.profiles});
      if(url.pathname==='/v1/bundleIds/BUNDLE')return Response.json({data:{id:'BUNDLE',type:'bundleIds',attributes:{platform:'IOS'}}});
      const family=url.pathname.split('/')[2];const id=url.pathname.split('/')[3];const collection=family==='certificates'?state.certificates:state.profiles;const found=collection.find(item=>item.id===id);return Response.json({data:found});
    }
    if(state.forbidden)return Response.json({errors:[{code:'FORBIDDEN',detail:'api-secret'}]},{status:403});if(state.accountLimit)return Response.json({errors:[{code:'ENTITY_ERROR.CERTIFICATE.CREATE_LIMIT_EXCEEDED',detail:'private account state'}]},{status:409});
    if(method==='POST'&&url.pathname==='/v1/certificates')state.certificates.push(certificate('NEW-CERT',body.data.attributes.certificateType,'2999-01-01T00:00:00Z',state.mismatchedCertificate?otherContent:matchingContent));
    else if(method==='DELETE'&&url.pathname.startsWith('/v1/certificates/')){const revoked=url.pathname.split('/').at(-1)!;state.certificates.splice(state.certificates.findIndex(item=>item.id===revoked),1);for(const item of state.profiles)if(item.relationships.certificates.data.some(certificate=>certificate.id===revoked))item.attributes.profileState='INVALID';}
    else if(method==='POST'&&url.pathname==='/v1/devices'){state.devices.push({id:'NEW-DEVICE',type:'devices',attributes:{...body.data.attributes,deviceClass:'IPHONE',status:'ENABLED',model:'iPhone',addedDate:'2026-01-01T00:00:00Z'}});if(state.concurrentExtra)state.devices.push(device('CONCURRENT','00008110-007777777777001E'));}
    else if(method==='PATCH'&&url.pathname.startsWith('/v1/devices/'))Object.assign(state.devices.find(item=>url.pathname.endsWith('/'+item.id))!.attributes,body.data.attributes);
    else if(method==='POST'&&url.pathname==='/v1/profiles'){const value=body.data;state.profiles.push({id:'NEW-PROFILE',type:'profiles',attributes:{...value.attributes,platform:'IOS',profileState:'ACTIVE',uuid:'22222222-2222-2222-2222-222222222222',createdDate:'2026-01-01T00:00:00Z',expirationDate:'2999-01-01T00:00:00Z'},relationships:value.relationships});}
    else if(method==='DELETE'&&url.pathname.startsWith('/v1/profiles/'))state.profiles.splice(state.profiles.findIndex(item=>url.pathname.endsWith('/'+item.id)),1);
    if(state.unknown)throw new Error('response lost');return Response.json({data:{id:'result',type:'result'}},{status:201});
  }});
  const plan=async(action:any)=>{const engine=new PlanEngine([checkout],true);const value=await engine.create(new SigningAdapter({root,action},[checkout],api,()=> 'account'));return {engine,value,apply:()=>engine.apply({planId:value.planId as string,digest:value.digest as string,operationIds:(value.operations as any[]).map(item=>item.id),authorization:{confirmedByHost:true}})};};
  return {checkout,root,key,csrPath,state,calls,api,plan};
}

test('native CSR verification accepts owner public request and rejects private keys and weak keys',native,async t=>{
  const f=await fixture(t);const facts=await validateCsr(await readFile(f.csrPath));assert.equal(facts.algorithm,'RSA');assert.equal(facts.bits,2048);await assert.rejects(validateCsr(await readFile(f.key)),/private signing keys/);
  const weakKey=path.join(f.checkout,'weak.pem');const weakCsr=path.join(f.checkout,'weak.csr');execFileSync('/usr/bin/openssl',['req','-new','-newkey','rsa:1024','-nodes','-subj','/CN=Weak','-keyout',weakKey,'-out',weakCsr],{stdio:'ignore'});await assert.rejects(validateCsr(await readFile(weakCsr)),/2048/);
});
test('native CSR verification accepts P-256 and P-384 but rejects unsupported EC curves',native,async t=>{
  const f=await fixture(t);for(const [curve,expected] of [['prime256v1','prime256v1'],['secp384r1','secp384r1']] as const){const key=path.join(f.checkout,curve+'.key');const csr=path.join(f.checkout,curve+'.csr');execFileSync('/usr/bin/openssl',['ecparam','-name',curve,'-genkey','-noout','-out',key],{stdio:'ignore'});execFileSync('/usr/bin/openssl',['req','-new','-key',key,'-subj','/CN=EC','-out',csr],{stdio:'ignore'});const facts=await validateCsr(await readFile(csr));assert.equal(facts.algorithm,'EC');assert.equal(facts.curve,expected);}
  const key=path.join(f.checkout,'p521.key');const csr=path.join(f.checkout,'p521.csr');execFileSync('/usr/bin/openssl',['ecparam','-name','secp521r1','-genkey','-noout','-out',key],{stdio:'ignore'});execFileSync('/usr/bin/openssl',['req','-new','-key',key,'-subj','/CN=EC','-out',csr],{stdio:'ignore'});await assert.rejects(validateCsr(await readFile(csr)),/P-256 or P-384/);
});
test('certificate creation keeps CSR out of public plan and reconciles one uncertain POST',native,async t=>{
  const f=await fixture(t);f.state.unknown=true;const p=await f.plan({type:'createCertificate',certificateType:'IOS_DEVELOPMENT',csrPath:'request.csr'});const planText=await readFile(p.value.planPath as string,'utf8');assert.ok(!planText.includes('CERTIFICATE REQUEST'));assert.ok(!planText.includes('request.csr'));assert.equal((p.value.summary as any).activeSameType,1);const result=await p.apply();assert.equal(result.operations[0]!.state,'reconciled');assert.equal(f.calls.filter(call=>call.method==='POST').length,1);assert.match(f.calls.find(call=>call.method==='POST')!.body.data.attributes.csrContent,/CERTIFICATE REQUEST/);
});
test('Developer ID certificate creation is rejected and a different-key uncertain result is never accepted',native,async t=>{
  const f=await fixture(t);for(const certificateType of ['DEVELOPER_ID_APPLICATION','DEVELOPER_ID_APPLICATION_G2'])await assert.rejects(f.plan({type:'createCertificate',certificateType,csrPath:'request.csr'}));assert.equal(f.calls.filter(call=>call.method==='POST').length,0);
  f.state.unknown=true;f.state.mismatchedCertificate=true;const p=await f.plan({type:'createCertificate',certificateType:'IOS_DEVELOPMENT',csrPath:'request.csr'});const result=await p.apply();assert.equal(result.operations[0]!.state,'outcomeUnknown');assert.equal(f.calls.filter(call=>call.method==='POST').length,1);const polled=await p.engine.status(p.value.planId as string,true);assert.equal(polled.operations[0]!.state,'outcomeUnknown');assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
});
test('explicit certificate revocation exposes affected profiles and never creates replacement',native,async t=>{
  const f=await fixture(t);const p=await f.plan({type:'revokeCertificate',certificateId:'CERT'});assert.equal((p.value.summary as any).certificateId,'CERT');assert.deepEqual((p.value.summary as any).affectedProfileIds,['PROFILE']);assert.equal((await p.apply()).state,'complete');assert.equal(f.state.certificates.length,0);assert.equal(f.state.profiles.length,1);assert.equal(f.state.profiles[0]!.attributes.profileState,'INVALID');assert.equal(f.calls.filter(call=>call.method==='DELETE').length,1);assert.equal(f.calls.filter(call=>call.method==='POST').length,0);
});
test('device registration and exact allowed update reconcile without touching profiles',native,async t=>{
  const f=await fixture(t);let p=await f.plan({type:'registerDevice',name:'Second device',platform:'IOS',udid:'00008110-009999999999001E'});assert.equal((await p.apply()).state,'complete');assert.equal(f.state.devices.length,2);p=await f.plan({type:'updateDevice',deviceId:'NEW-DEVICE',name:'Renamed'});assert.equal((await p.apply()).state,'complete');assert.equal(f.state.devices[1]!.attributes.name,'Renamed');assert.equal(f.state.profiles.length,1);
  await assert.rejects(f.plan({type:'registerDevice',name:'Conflict',platform:'IOS',udid:'00008110-001234567890001E'}),/already exists/);
});
test('profile creation requires exact compatible relationships and does not attach visible extras',native,async t=>{
  const f=await fixture(t);f.state.devices.push(device('UNSELECTED','00008110-008888888888001E'));const p=await f.plan({type:'createProfile',name:'Exact profile',profileType:'IOS_APP_DEVELOPMENT',bundleId:'BUNDLE',certificateIds:['CERT'],deviceIds:['DEVICE']});assert.equal((p.value.summary as any).bundleId,'BUNDLE');assert.deepEqual((p.value.summary as any).certificateIds,['CERT']);assert.deepEqual((p.value.summary as any).deviceIds,['DEVICE']);assert.equal((await p.apply()).state,'complete');assert.deepEqual(f.state.profiles.at(-1)!.relationships.devices.data,[{type:'devices',id:'DEVICE'}]);
  f.state.certificates[0]!.attributes.expirationDate='2000-01-01T00:00:00Z';await assert.rejects(f.plan({type:'createProfile',name:'Expired',profileType:'IOS_APP_DEVELOPMENT',bundleId:'BUNDLE',certificateIds:['CERT'],deviceIds:['DEVICE']}),/active, unexpired/);
  f.state.certificates[0]!.attributes.expirationDate='2999-01-01T00:00:00Z';await assert.rejects(f.plan({type:'createProfile',name:'Store',profileType:'IOS_APP_STORE',bundleId:'BUNDLE',certificateIds:['CERT'],deviceIds:['DEVICE']}),/certificate|does not accept/);
});
test('profile deletion and denied roles stay exact and do not modify certificates',native,async t=>{
  const f=await fixture(t);let p=await f.plan({type:'deleteProfile',profileId:'PROFILE'});assert.equal((await p.apply()).state,'complete');assert.equal(f.state.profiles.length,0);assert.equal(f.state.certificates.length,1);
  f.state.forbidden=true;p=await f.plan({type:'updateDevice',deviceId:'DEVICE',status:'DISABLED'});const failed=await p.apply();assert.equal(failed.state,'partial');assert.equal(failed.operations[0]!.state,'failed');assert.equal(f.state.devices[0]!.attributes.status,'ENABLED');
});
test('inventory omits artifact bytes and secure download refuses overwrite and escapes',native,async t=>{
  const f=await fixture(t);const der=path.join(f.checkout,'certificate.der');execFileSync('/usr/bin/openssl',['req','-x509','-key',f.key,'-in',f.csrPath,'-outform','DER','-out',der,'-days','1'],{stdio:'ignore'});const bytes=await readFile(der);(f.state.certificates[0]!.attributes as any).certificateContent=bytes.toString('base64');const inventory=await provisioningInventory(f.api);assert.equal((inventory.certificates[0] as any).certificateContent,undefined);const publicText=JSON.stringify(publicProvisioningInventory(inventory,'all'));assert.ok(!publicText.includes('00008110-001234567890001E'));assert.ok(!publicText.includes('11111111-1111-1111-1111-111111111111'));assert.ok(!publicText.includes('"01"'));
  const destination=path.join(f.checkout,'downloaded.cer');const receipt=await writeSigningArtifact(f.api,{family:'certificate',id:'CERT',destination},[f.checkout]);assert.equal(receipt.size,bytes.length);assert.equal((await stat(destination)).mode&0o777,0o600);await assert.rejects(writeSigningArtifact(f.api,{family:'certificate',id:'CERT',destination},[f.checkout]),/exist/);await assert.rejects(writeSigningArtifact(f.api,{family:'certificate',id:'CERT',destination:path.join(os.tmpdir(),'escape.cer')},[f.checkout]),/approved root/);const alias=path.join(f.checkout,'alias');await symlink(f.checkout,alias);await assert.rejects(writeSigningArtifact(f.api,{family:'certificate',id:'CERT',destination:path.join(alias,'linked.cer')},[f.checkout]),/canonical/);
});
test('duplicate inventory and concurrent extra creation cannot satisfy a postcondition',native,async t=>{
  const f=await fixture(t);f.state.devices.push(structuredClone(f.state.devices[0]!));await assert.rejects(provisioningInventory(f.api),/duplicate/);f.state.devices.pop();f.state.concurrentExtra=true;const p=await f.plan({type:'registerDevice',name:'Second device',platform:'IOS',udid:'00008110-009999999999001E'});const result=await p.apply();assert.equal(result.state,'partial');assert.equal(result.operations[0]!.state,'outcomeUnknown');assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
});
test('account quota conflicts fail without revoking or retrying another certificate',native,async t=>{
  const f=await fixture(t);f.state.accountLimit=true;const p=await f.plan({type:'createCertificate',certificateType:'IOS_DEVELOPMENT',csrPath:'request.csr'});const result=await p.apply();assert.equal(result.state,'partial');assert.equal(result.operations[0]!.state,'failed');assert.equal(f.calls.filter(call=>call.method==='POST').length,1);assert.equal(f.calls.filter(call=>call.method==='DELETE').length,0);assert.equal(f.state.certificates.length,1);
});
test('DER envelope validation requires one complete bounded-length sequence',()=>{assert.equal(isDerEnvelope(Buffer.from([0x30,0x03,1,2,3])),true);assert.equal(isDerEnvelope(Buffer.from([0x30,0x03,1,2])),false);assert.equal(isDerEnvelope(Buffer.from([0x30,0x80,0,0])),false);});
