import test from 'node:test';
import assert from 'node:assert/strict';
import {LedgerDrive} from './ledger-drive.mjs';
const fixture=()=>{
 const rows={session:[{id:'captain',role:'captain',name:'Captain',createdAt:'2026-10-21T10:00:00.000Z'}],task:[{id:'task-one',title:'Check fixture',objective:'Verify data',status:'Ready for review',priority:2,criteria:['Two rows'],evidence:['Read fixture: two rows'],updatedAt:'2026-10-21T10:01:00.000Z'}],question:[],decision:[],report:[{id:'report-one',date:'2026-10-21',title:'Daily report',text:'# Daily report\n\nNothing accepted.',createdAt:'2026-10-21T10:02:00.000Z'}],volumeSnapshot:[]};
 const store={list:k=>rows[k]||[],get:(k,id)=>(rows[k]||[]).find(x=>x.id===id),put:(k,value)=>{rows[k].push(value);return value;}};
 return {rows,drive:new LedgerDrive(store)};
};
const url=path=>new URL('http://127.0.0.1/orgs/org_swan_local/drive'+path);
test('native Drive contract serves ledger and report content without fabricating accepted work',()=>{
 const {drive}=fixture();const list=drive.route('GET',url('?captainJamId=captain'));
 assert.equal(list.status,200);assert.equal(list.body.length,1);
 const volume=list.body[0],base='/'+volume.id+'/versions/'+volume.headVersionId;
 const manifest=drive.route('GET',url(base));assert.equal(manifest.status,200);assert.equal(manifest.body.fileCount,3);
 const notes=manifest.body.entries.find(e=>e.path==='NOTES.md');
 const file=drive.route('GET',url(base+'/files/'+notes.sha256));
 assert.equal(file.status,200);assert.match(file.body.content,/Ready for review/);assert.match(file.body.content,/tasks\/task-one.md/);const taskEntry=manifest.body.entries.find(e=>e.path==='tasks/task-one.md');assert.match(drive.route('GET',url(base+'/files/'+taskEntry.sha256)).body.content,/Not accepted/);assert.match(file.body.content,/reports\/2026-10-21-report-one.md/);
 assert.equal(drive.route('GET',url('?projectId=other')).body.length,0);
 assert.equal(drive.route('GET',url(base+'/files/'+'0'.repeat(64))).status,404);
 assert.equal(drive.route('GET',url('/vol_OTHER/versions/'+volume.headVersionId)).status,404);
});
test('old content stays immutable when the authoritative ledger changes',()=>{
 const {drive,rows}=fixture();const first=drive.snapshot();const original=first.files['NOTES.md'];
 assert.equal(drive.snapshot().manifest.versionId,first.manifest.versionId);assert.equal(rows.volumeSnapshot.length,1);
 rows.task[0].status='Needs me';rows.task[0].updatedAt='2026-10-21T11:00:00.000Z';
 const second=drive.snapshot();assert.notEqual(second.manifest.versionId,first.manifest.versionId);
 const entry=first.manifest.entries.find(e=>e.path==='NOTES.md');
 const historical=drive.route('GET',url('/'+first.volume.id+'/versions/'+first.manifest.versionId+'/files/'+entry.sha256));
 assert.equal(historical.body.content,original);assert.match(second.files['NOTES.md'],/Needs me/);
 assert.equal(drive.snapshot('missing'),null);
});

test('workspace Drive lists every Captain while scoped files remain separate',()=>{
 const {drive,rows}=fixture();rows.session.push({id:'second',role:'captain',name:'Second Captain',createdAt:'2026-10-21T10:00:00.000Z'});
 rows.task.push({id:'second-task',captainId:'second',title:'Second private task',status:'Inbox',priority:1});
 const all=drive.route('GET',url('')).body;assert.equal(all.length,1);const workspace=drive.workspaceSnapshot();assert.ok(workspace.files['captains/captain/NOTES.md']);assert.ok(workspace.files['captains/second/NOTES.md']);assert.match(workspace.files['WORKSPACE.md'],/Second Captain/);assert.equal(new Set(workspace.manifest.entries.map(entry=>entry.path)).size,workspace.manifest.entries.length);
 const scoped=drive.route('GET',url('?captainJamId=second')).body;assert.equal(scoped.length,1);assert.notEqual(scoped[0].id,all[0].id);
 assert.match(drive.snapshot('second').files['NOTES.md'],/Second private task/);assert.doesNotMatch(drive.snapshot('captain').files['NOTES.md'],/Second private task/);
 assert.equal(drive.route('GET',url('?captainJamId=missing')).body.length,0);
});

test('original workspace scope directory reports actual ledger totals and disk capacity',()=>{
 const {drive}=fixture();const response=drive.route('GET',new URL('http://127.0.0.1/orgs/org_swan_local/drive-scopes'));
 assert.equal(response.status,200);assert.equal(response.body.items.length,1);assert.equal(response.body.items[0].fileCount,3);assert.ok(response.body.items[0].totalBytes>0);assert.ok(response.body.storage.limitBytes>0);assert.ok(response.body.storage.usedBytes<=response.body.storage.limitBytes);
});
