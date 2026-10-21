import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import {Store} from './server/store.mjs';
import {Engine} from './server/engine.mjs';
import {CapyRuntime} from './runtime.mjs';
import {scopedRecords} from './ownership.mjs';
import {PermissionSurface} from './permission-surface.mjs';

function fixture(){
 const store=new Store(':memory:');
 store.add('project',{id:'project',name:'Fixture',path:os.tmpdir()});
 for(const id of ['captain','second'])store.add('session',{id,name:id,role:'captain',runtime:'idle',queue:[]});
 store.add('session',{id:'old-worker',name:'Legacy worker',role:'worker',runtime:'idle',projectId:'project',taskId:'old-task'});
 store.add('task',{id:'old-task',title:'Legacy task',projectId:'project',status:'Ready',dependencies:[],components:[],criteria:['Original criteria']});
 store.add('task',{id:'second-task',captainId:'second',title:'Second task',projectId:'project',status:'Ready',dependencies:[],components:[],criteria:['Second criteria']});
 const engine=Object.assign(Object.create(Engine.prototype),{store,changed(){},active:new Map(),approvals:new Map(),maxWorkers:3,send:async()=>({queued:false})});
 const runtime=Object.assign(Object.create(CapyRuntime.prototype),{store,engine});
 return {store,engine,runtime};
}
test('editing Captain metadata preserves its conversation, crew and ownership',async()=>{
 const {store,runtime}=fixture();try{
  store.patch('session','second',{claudeSessionId:'unchanged-cli',queue:['Preserved instruction'],runtime:'paused'});
  const url=new URL('http://localhost/orgs/org_swan_local/captains/second');
  const result=await runtime.route('PATCH',url,{name:'Renamed Captain',alias:'local-name',crewDeviceId:'swan-local-device'});
  assert.equal(result.status,200);assert.equal(result.body.name,'Renamed Captain');assert.equal(result.body.alias,'local-name');
  const saved=store.get('session','second');assert.equal(saved.claudeSessionId,'unchanged-cli');assert.deepEqual(saved.queue,['Preserved instruction']);assert.equal(saved.runtime,'paused');
  await assert.rejects(()=>runtime.route('PATCH',url,{name:' '}),/name/);
  await assert.rejects(()=>runtime.route('PATCH',url,{crewDeviceId:'other-host'}),/Only this PC/);
  assert.equal(store.get('session','second').name,'Renamed Captain');
  assert.equal((await runtime.route('PATCH',new URL('http://localhost/orgs/org_swan_local/captains/old-worker'),{name:'Invalid'})).status,404);
 }finally{store.close();}
});
test('new Captain uses the original response contract and creates no CLI process',async()=>{
 const {store,engine,runtime}=fixture();try{
  const result=await runtime.route('POST',new URL('http://localhost/orgs/org_swan_local/captains'),{name:'Project Captain',projectId:'project',visibility:'personal'});
  assert.equal(result.status,200);assert.equal(result.body.name,'Project Captain');assert.deepEqual(result.body.crew,[]);
  const saved=store.get('session',result.body.jamId);assert.equal(saved.role,'captain');assert.equal(saved.runtime,'idle');assert.equal(saved.projectId,'project');assert.deepEqual(saved.queue,[]);assert.equal(engine.active.size,0);
  await assert.rejects(()=>runtime.route('POST',new URL('http://localhost/orgs/org_swan_local/captains'),{name:'Bad',projectId:'missing'}),/Choose a project/);
 }finally{store.close();}
});
test('Captain tools cannot mutate or inspect another Captain records',async()=>{
 const {store,engine}=fixture();try{
  for(const name of ['update_task','delegate','request_review','snapshot'])await assert.rejects(()=>engine.tool('second',name,{taskId:'old-task'}),/another Captain/);
  for(const name of ['message_worker','control_worker','snapshot'])await assert.rejects(()=>engine.tool('second',name,{sessionId:'old-worker'}),/another Captain/);
  const snapshot=await engine.tool('second','snapshot',{});assert.deepEqual(snapshot.tasks.map(t=>t.id),['second-task']);assert.deepEqual(snapshot.sessions.map(s=>s.id),['second']);assert.deepEqual(snapshot.recentMessages,[]);
 }finally{store.close();}
});
test('delegation records ownership and routes product questions to the owning Captain',async()=>{
 const {store,engine,runtime}=fixture();try{
  const worker=await engine.tool('second','delegate',{taskId:'second-task',instruction:'Read only',isolation:'read-only'});
  assert.equal(worker.captainId,'second');assert.deepEqual(runtime.captain(store.get('session','second')).crew,[worker.id]);assert.deepEqual(runtime.captain(store.get('session','captain')).crew,['old-worker']);
  let notified;engine.wakeCaptain=async(text,id)=>{notified={text,id};};
  const question=await engine.tool(worker.id,'ask_question',{question:'Codes or symbols?'});
  assert.equal(notified.id,'second');assert.match(notified.text,new RegExp(question.id));
  await assert.rejects(()=>engine.tool('captain','answer_question',{questionId:question.id,answer:'Codes'}),/another Captain/);
  assert.equal(scopedRecords(store,'captain').questions.length,0);
 }finally{store.close();}
});
test('permission cards and daily reports stay with their owning Captain',()=>{
 const {store,engine}=fixture();try{
  store.add('question',{id:'permission',sessionId:'old-worker',kind:'permission',status:'open',toolName:'Write',input:{}});engine.approvals.set('permission',{});
  const surface=new PermissionSurface(store,engine);
  assert.equal(surface.route('GET',new URL('http://localhost/orgs/org_swan_local/threads/second/agent-access')).body.length,0);
  assert.equal(surface.route('GET',new URL('http://localhost/orgs/org_swan_local/threads/captain/agent-access')).body.length,1);
  const report=engine.report('2026-10-21','second');assert.match(report.text,/Second task/);assert.doesNotMatch(report.text,/Legacy task/);assert.equal(report.captainId,'second');
 }finally{store.close();}
});
