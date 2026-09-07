import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {AppStoreError} from '../errors.js';

export interface CsrFacts {pem:string;sha256:string;algorithm:'RSA'|'EC';bits?:number;curve?:string}

function runOpenSSL(der:Buffer,signal?:AbortSignal):Promise<string> {
  return new Promise((resolve,reject)=>{
    execFile('/usr/bin/openssl',['req','-inform','DER','-noout','-verify','-text'],{timeout:10_000,maxBuffer:64*1024,...(signal?{signal}:{})},(error,stdout,stderr)=>{
      if(error||!/verify OK/i.test(stderr+stdout))reject(new AppStoreError('invalidCsr','CSR signature and public key could not be verified with the native OpenSSL tool.'));
      else resolve(stdout+stderr);
    }).stdin?.end(der);
  });
}

export async function validateCsr(bytes:Buffer,signal?:AbortSignal):Promise<CsrFacts> {
  signal?.throwIfAborted();
  if(bytes.length===0||bytes.length>64*1024)throw new AppStoreError('invalidCsr','CSR must contain 1–65536 bytes.');
  let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replaceAll('\r\n','\n').trim();}catch{throw new AppStoreError('invalidCsr','CSR must use valid UTF-8 PEM text.');}
  if(/PRIVATE KEY/.test(text))throw new AppStoreError('privateKeyForbidden','Supply only a public certificate signing request; private signing keys are never accepted.');
  const match=/^-----BEGIN (?:NEW )?CERTIFICATE REQUEST-----\n([A-Za-z0-9+/=\n\r]+)\n-----END (?:NEW )?CERTIFICATE REQUEST-----$/.exec(text);
  if(!match)throw new AppStoreError('invalidCsr','CSR must be a single PEM PKCS#10 certificate request.');
  const compact=match[1]!.replace(/[\r\n]/g,'');
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)||compact.length%4!==0)throw new AppStoreError('invalidCsr','CSR PEM base64 is malformed.');
  const der=Buffer.from(compact,'base64');
  if(!der.length||der.toString('base64')!==compact)throw new AppStoreError('invalidCsr','CSR PEM is not canonical base64.');
  const details=await runOpenSSL(der,signal);
  const rsa=/Public-Key:\s*\((\d+) bit\)/i.exec(details);
  const curve=/(?:ASN1 OID|NIST CURVE):\s*([^\s]+)/i.exec(details)?.[1];
  if(rsa){const bits=Number(rsa[1]);if(bits<2048||bits>8192)throw new AppStoreError('unsupportedCsrKey','RSA CSR keys must contain 2048–8192 bits.');return {pem:text+'\n',sha256:createHash('sha256').update(der).digest('hex'),algorithm:'RSA',bits};}
  if(curve){if(!['prime256v1','secp384r1'].includes(curve))throw new AppStoreError('unsupportedCsrKey','EC CSR keys must use P-256 or P-384.');return {pem:text+'\n',sha256:createHash('sha256').update(der).digest('hex'),algorithm:'EC',curve};}
  throw new AppStoreError('unsupportedCsrKey','CSR public key must be RSA or an approved named EC curve.');
}
