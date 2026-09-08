import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request as httpRequest} from 'node:http';
import type {request as httpsRequest} from 'node:https';
import {once} from 'node:events';
import {HttpsAssetTransfer,segment} from '../../src/screenshots/transfer.js';
import {uploadOperations,storageUrl,isPublicAddress} from '../../src/screenshots/operations.js';
const url='https://synthetic.blobstore.apple.com/upload?signature=PRIVATE-SIGNED-VALUE';
const raw=(offset:number,length:number)=>({method:'PUT',url,offset,length,requestHeaders:[{name:'Content-Type',value:'image/png'}]});
test('upload ranges require exact complete nonoverlapping coverage and safe headers/methods',()=>{
  assert.deepEqual(uploadOperations([raw(3,4),raw(0,3)],7).map(op=>op.offset),[3,0]);
  for(const ranges of [[raw(-1,8)],[raw(0,4),raw(3,4)],[raw(0,3),raw(4,3)],[raw(0,6)],[raw(0,8)],[{...raw(0,7),method:'POST'}],[{...raw(0,7),requestHeaders:[{name:'Authorization',value:'Bearer PRIVATE'}]}],[{...raw(0,7),requestHeaders:[{name:'Content-Length',value:'6'}]}]])assert.throws(()=>uploadOperations(ranges,7));
});
test('storage policy rejects redirects to unapproved hosts, local/IP destinations and special ranges',()=>{
  assert.equal(storageUrl('https://northamerica-1.object-storage.apple.com/upload?signature=PRIVATE').hostname,'northamerica-1.object-storage.apple.com');
  for(const candidate of ['http://synthetic.blobstore.apple.com','https://blobstore.apple.com.evil.test','https://object-storage.apple.com.evil.test','https://127.0.0.1','https://user:secret@synthetic.blobstore.apple.com','https://synthetic.blobstore.apple.com:444','https://synthetic.blobstore.apple.com/#x'])assert.throws(()=>storageUrl(candidate));
  for(const ip of ['127.0.0.1','10.2.3.4','100.64.0.1','169.254.1.1','172.16.0.1','192.168.1.1','198.18.0.1','198.51.100.9','203.0.113.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:0db8::1','2001:2::1','2002:a00::1','3fff::1'])assert.equal(isPublicAddress(ip),false,ip);
  for(const ip of ['17.1.2.3','93.184.216.34','2606:4700::1111','2a00:1450::1'])assert.equal(isPublicAddress(ip),true,ip);
});
test('local HTTP fixture receives exact nonzero-offset bytes and returned headers, never a bearer token',async t=>{
  const seen:{method?:string;headers:unknown;bytes:Buffer}[]=[];let status=200;
  const server=createServer(async(req,res)=>{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk);seen.push({method:req.method,headers:req.headers,bytes:Buffer.concat(chunks)});res.writeHead(status,{Location:'http://127.0.0.1/private'});res.end();});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
  const port=(server.address() as {port:number}).port;let pinned=false;
  const request=((destination:URL,options:any,callback:any)=>{assert.equal(destination.hostname,'synthetic.blobstore.apple.com');assert.equal(options.servername,destination.hostname);assert.equal(options.agent,false);options.lookup('synthetic.blobstore.apple.com',{all:true},(_error:unknown,addresses:unknown)=>{assert.deepEqual(addresses,[{address:'17.1.2.3',family:4}]);pinned=true;});return httpRequest({hostname:'127.0.0.1',port,method:options.method,headers:options.headers,signal:options.signal},callback);}) as unknown as typeof httpsRequest;
  const client=new HttpsAssetTransfer({resolve:async()=>[{address:'17.1.2.3',family:4}],request});const bytes=Buffer.from('0123456789');
  const operations=uploadOperations([raw(4,6),raw(0,4)],10);for(const op of operations)await client.transfer(op,segment(bytes,op.offset,op.length),new AbortController().signal);
  assert.equal(pinned,true);assert.deepEqual(seen.map(item=>item.bytes.toString()),['456789','0123']);assert.ok(seen.every(item=>item.method==='PUT'&&!JSON.stringify(item.headers).toLowerCase().includes('authorization')));
  status=302;await assert.rejects(client.transfer(operations[1]!,segment(bytes,0,4),new AbortController().signal),(error:any)=>error.code==='uploadRedirect');assert.equal(seen.length,3);
});
