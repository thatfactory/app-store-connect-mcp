import test from 'node:test';
import assert from 'node:assert/strict';
import {planSet,type RemoteSet,type ImageIntent} from '../../src/screenshots/planner.js';
const image=(id:number):ImageIntent=>({path:`assets/en-US/${id}.png`,size:100+id,sha256:String(id).padStart(64,'0'),md5:String(id).padStart(32,'0')});
const set=(ids:number[]):RemoteSet=>({id:'SET',localeId:'LOCALE',images:ids.map(id=>({id:String(id),name:'same.png',size:image(id).size,md5:image(id).md5,state:'COMPLETE'}))});
test('complete checksum and size prove no-op even without cached filenames',()=>{
 assert.deepEqual(planSet('en-US',{mode:'merge',images:[image(1)]},set([1]),'LOCALE'),[]);
 const unknown=set([1]);unknown.images[0]!.md5=null;assert.throws(()=>planSet('en-US',{mode:'merge',images:[image(1)]},unknown,'LOCALE'),/unverifiable/);
});
test('reordering sends only the exact complete relationship order',()=>{
 const plan=planSet('en-US',{mode:'merge',images:[image(2),image(1)]},set([1,2,3]),'LOCALE');assert.equal(plan.length,1);assert.equal(plan[0]!.kind,'update');assert.deepEqual(plan[0]!.after,[{id:'2'},{id:'1'},{id:'3'}]);
});
test('same filenames with different bytes upload a distinct resource and preserve unowned images',()=>{
 const plan=planSet('en-US',{mode:'merge',images:[image(2)]},set([1]),'LOCALE');assert.equal(plan.filter(op=>op.kind==='create').length,1);assert.deepEqual(plan.at(-1)!.after,[image(2),{id:'1'}]);assert.equal(plan.filter(op=>op.kind==='remove').length,0);
});
test('five locales get separate resources even when sharing original source bytes',()=>{
 const plans=['en-US','de-DE','fr-FR','ja','pt-BR'].flatMap(locale=>planSet(locale,{mode:'merge',images:[image(1)]},null,locale));assert.equal(plans.length,15);assert.equal(new Set(plans.map(op=>op.id)).size,15);assert.ok(plans.filter(op=>op.kind==='update').every(op=>op.dependencies.length===2));
});
test('full replacement exposes an approved removal dependency before first upload',()=>{
 const plan=planSet('en-US',{mode:'replace',images:[image(20)]},set([1,2,3,4,5,6,7,8,9,10]),'LOCALE');assert.equal(plan[0]!.kind,'remove');assert.equal((plan[0]!.after as any).temporaryGap,true);assert.equal(plan[1]!.kind,'create');assert.ok(plan[1]!.dependencies.includes(plan[0]!.id));assert.equal(plan.filter(op=>op.kind==='remove').length,10);
 const spare=planSet('en-US',{mode:'replace',images:[image(2)]},set([1]),'LOCALE');assert.equal(spare[0]!.kind,'create');assert.equal(spare[1]!.kind,'remove');assert.ok(spare[1]!.dependencies.includes(spare[0]!.id));
});
test('explicit empty replacement clears only the selected set; empty merge preserves it',()=>{
 const cleared=planSet('en-US',{mode:'replace',images:[]},set([1,2]),'LOCALE');assert.equal(cleared.filter(op=>op.kind==='remove').length,2);assert.deepEqual(cleared.at(-1)!.after,[]);assert.deepEqual(planSet('en-US',{mode:'merge',images:[]},set([1]),'LOCALE'),[]);assert.deepEqual(planSet('en-US',{mode:'replace',images:[]},null,'LOCALE'),[]);
});
test('pending images block merge duplicates and capacity is never exceeded',()=>{
 const pending=set([1]);pending.images[0]!.state='AWAITING_UPLOAD';assert.throws(()=>planSet('en-US',{mode:'merge',images:[image(2)]},pending,'LOCALE'),/pending/);
 assert.throws(()=>planSet('en-US',{mode:'merge',images:[image(20)]},set([1,2,3,4,5,6,7,8,9,10]),'LOCALE'),/ten/);
 assert.throws(()=>planSet('en-US',{mode:'replace',images:[image(1),image(1)]},null,'LOCALE'),/repeat/);
});
