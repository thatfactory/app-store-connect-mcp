import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { AuthManager } from '../../src/api/auth.js';
import { publicError } from '../../src/errors.js';
const {privateKey, publicKey} = generateKeyPairSync('ec', {namedCurve: 'prime256v1'});
const pem = privateKey.export({type: 'pkcs8', format: 'pem'}).toString();
const env = {APPSTORE_CONNECT_API_KEY_ID: 'KEY123', APPSTORE_CONNECT_API_ISSUER_ID: 'issuer-123', APPSTORE_CONNECT_API_KEY_CONTENT: pem};
test('credentials are lazy and missing team issuer never selects individual-key auth', () => {
  const auth = new AuthManager({});
  assert.throws(() => auth.token(), /Missing or empty/);
  assert.throws(() => new AuthManager({...env, APPSTORE_CONNECT_API_ISSUER_ID: ''}).token(), /ISSUER/);
});
test('team JWT has valid ES256 signature and refreshes at the safety margin', () => {
  let now = 1_800_000_000_000;
  const auth = new AuthManager(env, () => now);
  const token = auth.token(); const [header, payload, signature] = token.split('.') as [string,string,string];
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString()), {alg: 'ES256', kid: 'KEY123', typ: 'JWT'});
  const body = JSON.parse(Buffer.from(payload, 'base64url').toString());
  assert.equal(body.aud, 'appstoreconnect-v1'); assert.equal(body.iss, 'issuer-123'); assert.equal(body.exp - body.iat, 1200);
  assert.ok(verify('sha256', Buffer.from(`${header}.${payload}`), {key: publicKey, dsaEncoding: 'ieee-p1363'}, Buffer.from(signature, 'base64url')));
  now += 1139_000; assert.equal(auth.token(), token);
  now += 1000; assert.notEqual(auth.token(), token);
});
test('all aliases work while any present primary wins, including blank or invalid values', () => {
  const alias = {APP_STORE_KEY_ID: 'ALIAS', APP_STORE_ISSUER_ID: 'alias-issuer', APP_STORE_PRIVATE_KEY: pem};
  assert.ok(new AuthManager(alias).token());
  const token = new AuthManager({...alias, ...env}).token();
  assert.equal(JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString()).kid, 'KEY123');
  for (const primary of Object.keys(env)) assert.throws(() => new AuthManager({...alias, ...env, [primary]: ''}).token());
});
test('quoted escaped PEM and CRLF normalize without leaking errors', () => {
  for (const text of [`"${pem.replaceAll('\n', '\\n')}"`, `'${pem}'`, pem.replaceAll('\n', '\r\n')]) assert.ok(new AuthManager({...env, APPSTORE_CONNECT_API_KEY_CONTENT: text}).token());
  for (const text of ['secret-do-not-print', generateKeyPairSync('ec', {namedCurve: 'secp384r1'}).privateKey.export({type: 'pkcs8', format: 'pem'}).toString()]) {
    try { new AuthManager({...env, APPSTORE_CONNECT_API_KEY_CONTENT: text}).token(); assert.fail(); }
    catch(error) { assert.ok(!JSON.stringify(publicError(error)).includes(text)); }
  }
  assert.ok(!JSON.stringify(publicError(new Error(pem))).includes(pem));
});
