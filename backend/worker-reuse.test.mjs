import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {Store} from './server/store.mjs';
import {Engine} from './server/engine.mjs';
import {reuseAssignment} from './worker-reuse.mjs';
import {repositoryIdentity} from './server/repository.mjs';
function fixture(){const store=new Store(':memory:');store.add('task',{id:'old',captainId:'captain',projectId:'project',status:'Done'});const task=store.add('task',{id:'next',captainId:'captain',projectId:'project',status:'Ready',components:[],dependencies:[]});const worker={id:'worker',role:'worker',captainId:'captain',projectId:'project',taskId:'old',runtime:'idle',isolation:'read-only',cwd:process.cwd(),queue:[]};return {store,task,worker};}
test('reassignment preserves isolation and refuses active or pending previous work',()=>{const {store,task,worker}=fixture();try{
 assert.throws(()=>reuseAssignment(store,new Map(),task,worker,{isolation:'worktree'}),/isolation mode/);
 assert.throws(()=>reuseAssignment(store,new Map([['worker',{}]]),task,worker),/previous worker run/);
 assert.throws(()=>reuseAssignment(store,new Map(),task,{...worker,queue:['old instruction']}),/previous worker run/);
 assert.throws(()=>reuseAssignment(store,new Map(),task,{...worker,captainId:'other'}),/another project or Captain/);
 store.patch('task','old',{status:'Ready for review'});
 assert.throws(()=>reuseAssignment(store,new Map(),task,worker),/unfinished task/);
}finally{store.close();}});
test('reused writer records actual workspace metadata and detects branch drift',async()=>{const {store,task,worker}=fixture();const root=fs.mkdtempSync(path.join(os.tmpdir(),'swan-reuse-'));const git=args=>execFileSync('git',['-C',root,...args],{windowsHide:true,stdio:'pipe'});try{
 git(['init']);git(['-c','user.name=Fixture','-c','user.email=fixture@localhost','commit','--allow-empty','-m','fixture']);
 const identity=repositoryIdentity(root);Object.assign(worker,{isolation:'worktree',cwd:root,...identity});store.add('session',worker);
 const engine=Object.assign(Object.create(Engine.prototype),{store,active:new Map(),project:()=>({id:'project',path:root}),send:async()=>({})});
 await engine.delegate({taskId:task.id,sessionId:worker.id,instruction:'Next bounded task',isolation:'worktree'});
 const recorded=store.get('task',task.id);assert.equal(recorded.worktree,root);assert.equal(recorded.branch,identity.branch);assert.equal(recorded.baseCommit,identity.baseCommit);assert.equal(recorded.repositoryCommonDir,identity.repositoryCommonDir);
 git(['checkout','-b','unexpected']);assert.throws(()=>reuseAssignment(store,new Map(),task,worker),/repository or branch changed/);
}finally{store.close();fs.rmSync(root,{recursive:true,force:true});}});
