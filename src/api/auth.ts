import { createPrivateKey, createHash, sign, type KeyObject } from 'node:crypto';
import { AppStoreError } from '../errors.js';
export type Environment = Readonly<Record<string, string | undefined>>;
const names = [
  ['APPSTORE_CONNECT_API_KEY_ID', 'APP_STORE_KEY_ID'],
  ['APPSTORE_CONNECT_API_ISSUER_ID', 'APP_STORE_ISSUER_ID'],
  ['APPSTORE_CONNECT_API_KEY_CONTENT', 'APP_STORE_PRIVATE_KEY'],
] as const;
function value(env: Environment, primary: string, alias: string): string {
  const raw = Object.hasOwn(env, primary) ? env[primary] : env[alias];
  if (!raw?.trim()) throw new AppStoreError('invalidCredentials', `Missing or empty ${primary}.`);
  return raw.trim();
}
function pem(input: string): string {
  let result = input;
  if ((result.startsWith('"') && result.endsWith('"')) || (result.startsWith("'") && result.endsWith("'"))) result = result.slice(1, -1);
  return result.replaceAll('\\n', '\n').replaceAll('\r\n', '\n').trim();
}
export class AuthManager {
  #key: KeyObject | undefined;
  #keyId = '';
  #issuerId = '';
  #identity = '';
  #cached: {token: string; expiresAt: number; issuedAt: number} | undefined;
  constructor(private readonly environment: Environment = process.env, private readonly now: () => number = Date.now) {}
  #load(): void {
    if (this.#key) return;
    const keyId = value(this.environment, ...names[0]);
    const issuerId = value(this.environment, ...names[1]);
    const content = pem(value(this.environment, ...names[2]));
    if (!/^[A-Za-z0-9]{1,64}$/.test(keyId) || !/^[A-Za-z0-9-]{1,128}$/.test(issuerId)) throw new AppStoreError('invalidCredentials', 'Invalid key or issuer identifier.');
    let key: KeyObject;
    try {
      key = createPrivateKey(content);
      if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new Error();
    } catch { throw new AppStoreError('invalidCredentials', 'API key must be a valid unencrypted P-256 EC private key.'); }
    this.#keyId = keyId; this.#issuerId = issuerId; this.#key = key;
    this.#identity = createHash('sha256').update(JSON.stringify([keyId, issuerId, key.export({type: 'pkcs8', format: 'der'}).toString('base64')])).digest('hex');
  }
  identity(): string { this.#load(); return this.#identity; }
  token(): string {
    this.#load();
    const now = Math.floor(this.now() / 1000);
    if (this.#cached && this.#cached.expiresAt > now + 60 && now >= this.#cached.issuedAt) return this.#cached.token;
    const encode = (data: unknown): string => Buffer.from(JSON.stringify(data)).toString('base64url');
    const expiresAt = now + 1200;
    const input = `${encode({alg: 'ES256', kid: this.#keyId, typ: 'JWT'})}.${encode({iss: this.#issuerId, iat: now, exp: expiresAt, aud: 'appstoreconnect-v1'})}`;
    const token = `${input}.${sign('sha256', Buffer.from(input), {key: this.#key!, dsaEncoding: 'ieee-p1363'}).toString('base64url')}`;
    this.#cached = {token, expiresAt, issuedAt: now};
    return token;
  }
}
