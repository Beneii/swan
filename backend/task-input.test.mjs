import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from './server/store.mjs';
import {Engine} from './server/engine.mjs';
function fixture(){const store=new Store(':memory:');const engine=Object.assign(Object.create(Engine.prototype),{store,project:()=>({id:'project'})});const input={captainId:'captain',projectId:'project',title:'Bounded task',criteria:['Checked outcome'],dependencies:[],status:'Ready'};return {store,engine,input};}
test('runtime rejects forged completion and invalid task values before persistence',()=>{const {store,engine,input}=fixture();try{
 for(const changes of [{status:'Done'},{status:'Ready for review'},{priority:0},{priority:4},{criteria:[]},{criteria:[' ']},{components:'file'},{dependencies:['missing']}])assert.throws(()=>engine.createTask({...input,...changes}));
 assert.equal(store.list('task').length,0);
 const task=engine.createTask(input);assert.equal(task.status,'Ready');assert.equal(task.verifiedAt,null);
 assert.throws(()=>engine.updateTask({taskId:task.id,status:'Done'}),/human acceptance/);
 assert.throws(()=>engine.updateTask({taskId:task.id,priority:0}),/Priority/);
 assert.equal(store.get('task',task.id).status,'Ready');
}finally{store.close();}});
test('dependency ownership and cycles are enforced on creation and updates',()=>{const {store,engine,input}=fixture();try{
 const a=engine.createTask(input),b=engine.createTask({...input,title:'Dependent',dependencies:[a.id]});
 assert.throws(()=>engine.updateTask({taskId:a.id,dependencies:[b.id]}),/cycle/);
 assert.throws(()=>engine.updateTask({taskId:a.id,dependencies:[a.id]}),/cycle/);
 const foreign=store.add('task',{captainId:'other',projectId:'project',dependencies:[]});
 assert.throws(()=>engine.createTask({...input,dependencies:[foreign.id]}),/same project and Captain/);
 assert.deepEqual(store.get('task',a.id).dependencies,[]);
 assert.deepEqual(store.get('task',b.id).dependencies,[a.id]);
}finally{store.close();}});
