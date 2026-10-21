import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from './server/store.mjs';
import {CapyRuntime} from './runtime.mjs';
import {threadCollection} from './thread-collection.mjs';
function fixture(){const store=new Store(':memory:');const runtime=Object.assign(Object.create(CapyRuntime.prototype),{store});for(const session of [{id:'captain',role:'captain',name:'Coordinator',runtime:'idle',projectId:'one'},{id:'one-worker',role:'worker',captainId:'captain',name:'Parser',runtime:'working',projectId:'one'},{id:'other',role:'captain',name:'Other Captain',runtime:'idle',projectId:'two'},{id:'queued-worker',role:'worker',captainId:'other',name:'Writer',runtime:'queued',projectId:'two'}])store.add('session',{...session,createdAt:'2026-10-21T10:00:00.000Z'});store.add('message',{sessionId:'one-worker',text:'Investigated separator escaping'});return {store,runtime};}
test('thread search, runtime, project and Captain filters select recorded conversations',()=>{const {store,runtime}=fixture();try{
 const query=input=>threadCollection(runtime,{pages:[{key:'result'}],...input}).body.pages[0].items.map(item=>item.id);
 assert.deepEqual(query({search:'separator'}),['one-worker']);assert.deepEqual(query({statuses:['waiting']}),['queued-worker']);assert.deepEqual(query({statuses:['working'],projectIds:['one']}),['one-worker']);
 assert.deepEqual(new Set(query({captainIds:['captain']})),new Set(['captain','one-worker']));assert.deepEqual(query({projectIds:['missing']}),[]);assert.deepEqual(query({archived:'only'}),[]);
}finally{store.close();}});
test('thread keyset pagination has no duplicates and rejects a changed-filter cursor',()=>{const {store,runtime}=fixture();try{
 const input={pages:[{key:'all',limit:2}],sort:'createdAt'};const first=threadCollection(runtime,input).body.pages[0];assert.equal(first.items.length,2);assert.ok(first.cursor);assert.ok(first.cursor.length<=128);
 const second=threadCollection(runtime,{...input,pages:[{key:'all',limit:2,cursor:first.cursor}]}).body.pages[0];assert.equal(second.items.length,2);assert.equal(second.cursor,null);assert.equal(new Set([...first.items,...second.items].map(card=>card.id)).size,4);
 assert.throws(()=>threadCollection(runtime,{...input,search:'changed',pages:[{key:'all',cursor:first.cursor}]}),/another filter/);
}finally{store.close();}});
test('original grouped thread pages reflect group membership rather than repeating all threads',()=>{const {store,runtime}=fixture();try{
 const result=threadCollection(runtime,{pages:[{key:'one',group:{by:'project',key:'one'}}],groups:{by:'project'},counts:true}).body;
 assert.equal(result.pages[0].items.length,2);assert.deepEqual(new Set(result.groups.map(group=>group.key)),new Set(['one','two']));assert.ok(result.groups.every(group=>group.count===2));assert.deepEqual(result.counts,{pinned:0,folders:[]});
}finally{store.close();}});
