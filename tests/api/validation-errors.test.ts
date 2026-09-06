import test from 'node:test';
import assert from 'node:assert/strict';
import {ApiClient} from '../../src/api/client.js';
import {AppStoreError} from '../../src/errors.js';
test('Apple validation preserves only known code and field, excluding echoed secrets and arbitrary pointers',async()=>{
  const api=new ApiClient({token:()=> 'token'},{fetch:async()=>Response.json({errors:[{code:'ENTITY_ERROR.ATTRIBUTE.INVALID',title:'secret-value',detail:'secret-value',source:{pointer:'/data/attributes/demoAccountPassword'}},{code:'SECRET_VALUE',source:{pointer:'/data/attributes/secretValue'}},{code:'ENTITY_ERROR.ATTRIBUTE.REQUIRED',source:{pointer:'/data/attributes/name'}}]},{status:422})});
  try{await api.request('/v1/appStoreReviewDetails',{method:'POST',body:{}});assert.fail('should reject');}catch(error){assert.ok(error instanceof AppStoreError);assert.deepEqual(error.validationErrors,[{code:'ENTITY_ERROR.ATTRIBUTE.INVALID',field:'demoAccountPassword'},{code:'UNCLASSIFIED_APPLE_ERROR'},{code:'ENTITY_ERROR.ATTRIBUTE.REQUIRED',field:'name'}]);assert.ok(!JSON.stringify(error).includes('secret-value'));assert.ok(!JSON.stringify(error).includes('SECRET_VALUE'));assert.equal(error.executionDisposition,'rejected');}
});
test('oversized or invalid Apple error bodies remain bounded and preserve known HTTP rejection',async()=>{
  let cancelled=false;const api=new ApiClient({token:()=> 'token'},{fetch:async()=>new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(70_000));},cancel(){cancelled=true;}}),{status:400})});
  await assert.rejects(api.request('/v1/apps',{method:'POST',body:{}}),(error:unknown)=>error instanceof AppStoreError&&error.status===400&&error.executionDisposition==='rejected'&&error.validationErrors?.length===0);assert.equal(cancelled,true);
});
