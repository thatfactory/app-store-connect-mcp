import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient } from '../../src/api/client.js';
import { AppStoreError, publicError } from '../../src/errors.js';
const auth = {token: () => 'TEST-BEARER'};
const json = (value: unknown): Response => Response.json(value);
function client(handler: (input: string | URL | Request, init?: RequestInit) => Promise<Response>, options = {}): ApiClient {
  return new ApiClient(auth, {fetch: handler as typeof fetch, readRetries: 0, ...options});
}
test('pagination collects all pages and authenticates only exact Apple origin', async () => {
  let count = 0;
  const api = client(async (_url, init) => {
    assert.equal((init?.headers as Record<string,string>).Authorization, 'Bearer TEST-BEARER');
    assert.equal(init?.redirect, 'error'); count++;
    return json({data: [count], links: {next: count === 1 ? '/v1/apps?cursor=two' : null}});
  });
  assert.deepEqual(await api.list('/v1/apps'), [1,2]);
  for (const url of ['http://api.appstoreconnect.apple.com/v1/apps', 'https://evil.test/v1/apps', 'https://api.appstoreconnect.apple.com.evil.test/v1/apps', 'https://user@api.appstoreconnect.apple.com/v1/apps']) await assert.rejects(api.request(url), /exact public/);
  assert.equal(count, 2);
});
test('cyclic, cross-origin, malformed and truncated collections fail instead of returning partial state', async () => {
  await assert.rejects(client(async () => json({data: [], links: {next: '/v1/apps'}})).list('/v1/apps'), /Pagination/);
  await assert.rejects(client(async () => json({data: [], links: {next: 'https://evil.test/v1/apps'}})).list('/v1/apps'), /exact public/);
  await assert.rejects(client(async () => json({data: {}})).list('/v1/apps'), /collection/);
  await assert.rejects(client(async () => json({data: [1,2]}), {maxItems: 1}).list('/v1/apps'), /item limit/);
});
test('204 is empty success and non-JSON or oversized success fails safely', async () => {
  assert.equal(await client(async () => new Response(null, {status: 204})).request('/v1/apps/1', {method:'DELETE'}), undefined);
  await assert.rejects(client(async () => new Response('secret-body')).request('/v1/apps'), /invalid JSON/);
  await assert.rejects(client(async () => json({large:'123456789'}), {maxBytes: 4}).request('/v1/apps'), /byte limit/);
});
for (const status of [401,403,409,429,500]) test(`HTTP ${status} returns redacted structured errors without replaying a write`, async () => {
  let calls = 0;
  const api = client(async () => {calls++; return new Response('secret-response-url-token', {status});}, {readRetries:2});
  await assert.rejects(api.request('/v1/apps', {method:'POST', body:{data:{}}}), (error: unknown) => {
    assert.ok(error instanceof AppStoreError); assert.equal(error.status,status);
    assert.equal(error.executionDisposition,status>=500?'outcomeUnknown':'rejected');
    assert.ok(!JSON.stringify(publicError(error)).includes('secret-response')); assert.ok(error.requestId);return true;
  }); assert.equal(calls,1);
});
test('reads retry within a bounded budget and respect excessive retry-after by stopping', async () => {
  let calls=0;
  const api=client(async()=>++calls<3?new Response(null,{status:429,headers:{'Retry-After':'0'}}):json({data:[]}),{readRetries:2});
  await api.request('/v1/apps');assert.equal(calls,3);
  await assert.rejects(client(async()=>new Response(null,{status:429,headers:{'Retry-After':'600'}}),{readRetries:2}).request('/v1/apps'),/budget/);
});
test('write network failures remain outcomeUnknown and cancellation before dispatch makes no call', async()=>{
  let calls=0;const api=client(async()=>{calls++;throw new Error('secret-network-error');});
  await assert.rejects(api.request('/v1/apps',{method:'POST'}),(error:unknown)=>error instanceof AppStoreError && error.executionDisposition==='outcomeUnknown');
  assert.equal(calls,1);
  await assert.rejects(api.request('/v1/apps',{signal:AbortSignal.abort()}),/before dispatch/);assert.equal(calls,1);
});
test('timeout aborts a pending response body and bounds reads after headers', async()=>{
  const controller=new AbortController();
  const api=client(async()=>{setTimeout(()=>controller.abort(),10);return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));}}));});
  await assert.rejects(api.request('/v1/apps',{signal:controller.signal}),/cancelled or timed out/);
});
test('audited v3 price points reach transport without weakening URL isolation',async()=>{
  let calls=0;
  const api=client(async url=>{calls++;assert.equal(new URL(String(url)).pathname,'/v3/appPricePoints/123');return json({data:{id:'123'}});});
  await api.request('/v3/appPricePoints/123');assert.equal(calls,1);
  for(const url of ['https://evil.test/v3/appPricePoints/123','https://user@api.appstoreconnect.apple.com/v3/appPricePoints/123','https://api.appstoreconnect.apple.com/v3/appPricePoints/123#secret']) await assert.rejects(api.request(url),/exact public/);
  assert.equal(calls,1);
});
