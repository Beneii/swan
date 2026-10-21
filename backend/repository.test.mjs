import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {writerBase,repositoryIdentity,verifyWriterWorkspace} from './server/repository.mjs';
import {Store} from './server/store.mjs';
import {Engine} from './server/engine.mjs';
const git=(cwd,args)=>execFileSync('git',['-C',cwd,...args],{windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'swan-repository-'));t.after(()=>{const absolute=path.resolve(root),parent=fs.realpathSync(os.tmpdir());assert.equal(path.dirname(absolute),parent);assert.ok(path.basename(absolute).startsWith('swan-repository-'));fs.rmSync(absolute,{recursive:true,force:true});});const repo=path.join(root,'repo');fs.mkdirSync(repo);git(repo,['init']);git(repo,['config','core.autocrlf','false']);fs.writeFileSync(path.join(repo,'README.md'),'Committed baseline\n');git(repo,['add','README.md']);git(repo,['-c','user.name=Swan fixture','-c','user.email=fixture@example.invalid','commit','-m','Fixture baseline']);return {root,repo};}
test('writer refuses an accidental parent repository while read-only project folders remain usable',t=>{const {repo}=fixture(t);const child=path.join(repo,'subfolder');fs.mkdirSync(child);assert.throws(()=>writerBase(child),/Choose the repository root/);assert.equal(repositoryIdentity(child).repositoryRoot,fs.realpathSync(repo));assert.equal(git(repo,['worktree','list','--porcelain']).split('worktree ').length-1,1);});
test('writer records repository/base identity and preserves dirty base changes',async t=>{const {root,repo}=fixture(t),store=new Store(':memory:');try{
 fs.writeFileSync(path.join(repo,'README.md'),'User uncommitted changes\n');
 store.add('project',{id:'project',path:repo});store.add('task',{id:'task',title:'Fixture writer',projectId:'project',status:'Ready',dependencies:[],components:[],criteria:['Verify baseline']});
 const engine=Object.assign(Object.create(Engine.prototype),{store,root,maxWorkers:3,send:async()=>{}});
 const session=await engine.delegate({taskId:'task',instruction:'Fixture only',isolation:'worktree'});
 assert.equal(session.repositoryRoot,fs.realpathSync(repo));assert.equal(session.baseCommit,git(repo,['rev-parse','HEAD']));assert.match(session.baseDirtyEntries.join('\n'),/README.md/);
 assert.equal(fs.readFileSync(path.join(repo,'README.md'),'utf8'),'User uncommitted changes\n');assert.equal(fs.readFileSync(path.join(session.cwd,'README.md'),'utf8'),'Committed baseline\n');
 assert.equal(repositoryIdentity(session.cwd).repositoryCommonDir,session.repositoryCommonDir);assert.equal(repositoryIdentity(session.cwd).branch,session.branch);assert.equal(store.get('task','task').baseCommit,session.baseCommit);assert.equal(session.started,false);
 }finally{store.close();}});
test('worktree verification rejects another repository even when files and commit contents match',t=>{const {root,repo}=fixture(t);const second=path.join(root,'other');git(root,['clone',repo,second]);const base=writerBase(repo);assert.throws(()=>verifyWriterWorkspace(second,base),/does not match/);assert.ok(fs.existsSync(path.join(second,'README.md')),'No workspace is discarded after identity failure');});
