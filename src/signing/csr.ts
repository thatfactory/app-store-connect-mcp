import {execFile} from 'node:child_process';
import {createHash,createPublicKey} from 'node:crypto';
import {AppStoreError} from '../errors.js';

export interface CsrFacts {pem:string;sha256:string;publicKeySha256:string;algorithm:'RSA'|'EC';bits?:number;curve?:string}

function runOpenSSL(arguments_:string[],der:Buffer,signal?:AbortSignal):Promise<string> {
  return new Promise((resolve,reject)=>{
    const child=execFile('/usr/bin/openssl',arguments_,{timeout:10_000,maxBuffer:64*1024,...(signal?{signal}:{})},(error,stdout,stderr)=>error?reject(new AppStoreError('invalidCsr','CSR signature and public key could not be verified with the native OpenSSL tool.')):resolve(stdout+stderr));
    child.stdin?.end(der);
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
  const details=await runOpenSSL(['req','-inform','DER','-noout','-verify','-text'],der,signal);if(!/verify OK/i.test(details))throw new AppStoreError('invalidCsr','CSR signature and public key could not be verified with the native OpenSSL tool.');
  const publicPem=await runOpenSSL(['req','-inform','DER','-noout','-pubkey'],der,signal);let key;try{key=createPublicKey(publicPem);}catch{throw new AppStoreError('invalidCsr','CSR public key could not be decoded.');}
  const publicKeySha256=createHash('sha256').update(key.export({format:'der',type:'spki'})).digest('hex');const sha256=createHash('sha256').update(der).digest('hex');
  if(key.asymmetricKeyType==='rsa'){const bits=key.asymmetricKeyDetails?.modulusLength;if(!bits||bits<2048||bits>8192)throw new AppStoreError('unsupportedCsrKey','RSA CSR keys must contain 2048–8192 bits.');return {pem:text+'\n',sha256,publicKeySha256,algorithm:'RSA',bits};}
  if(key.asymmetricKeyType==='ec'){const curve=key.asymmetricKeyDetails?.namedCurve;if(!curve||!['prime256v1','secp384r1'].includes(curve))throw new AppStoreError('unsupportedCsrKey','EC CSR keys must use P-256 or P-384.');return {pem:text+'\n',sha256,publicKeySha256,algorithm:'EC',curve};}
  throw new AppStoreError('unsupportedCsrKey','CSR public key must be RSA or an approved named EC curve.');
}
