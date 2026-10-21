import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from './server/engine.mjs';
import {Store} from './server/store.mjs';
import {LedgerDrive} from './ledger-drive.mjs';

test('daily report groups accepted outcomes and decisions by Sydney date',()=>{
  const store=new Store(':memory:');
  try {
    store.add('task',{title:'Sydney morning',status:'Done',verifiedAt:'2026-10-20T15:30:00Z'});
    store.add('task',{title:'Following day',status:'Done',verifiedAt:'2026-10-21T15:30:00Z'});
    store.add('task',{title:'Missing verification',status:'Done'});
    store.add('decision',{createdAt:'2026-10-20T15:30:00Z',answer:'Use currency codes',rationale:'Avoid ambiguity'});
    store.add('decision',{createdAt:'2026-10-21T15:30:00Z',answer:'Tomorrow decision'});
    const report=Engine.prototype.report.call({store,emit(){}},'2026-10-21');
    assert.match(report.text,/Sydney morning/);
    assert.match(report.text,/Use currency codes — Avoid ambiguity/);
    assert.doesNotMatch(report.text,/Following day|Missing verification|Tomorrow decision/);
    assert.equal(store.get('report',report.id).text,report.text);
  } finally {store.close();}
});

test('report tool describes automatic Drive delivery and its saved bytes are actually projected',async()=>{const store=new Store(':memory:');try{store.add('session',{id:'captain',role:'captain',name:'Fixture'});const engine=Object.assign(Object.create(Engine.prototype),{store,changed(){}});const result=await engine.tool('captain','report',{date:'2026-10-22'});assert.equal(result.delivery.automatic,true);assert.match(result.delivery.message,/No separate Drive tool/);const drive=new LedgerDrive(store).snapshot('captain');assert.equal(drive.files['reports/'+result.date+'-'+result.id+'.md'],result.text);assert.equal(store.list('report').length,1);}finally{store.close();}});

test('accepted but unintegrated work remains visible and yields a proposed next-day decision',()=>{const store=new Store(':memory:');try{store.add('task',{id:'combined',title:'Combined checked tree',status:'Done',verifiedAt:'2026-10-22T00:00:00Z',branch:'swan/combined',worktree:'C:/fixture/combined',kind:'integration',evidence:['Combined tests: 3 passed'],priority:1});const engine=Object.assign(Object.create(Engine.prototype),{store,changed(){}});const report=engine.report('2026-10-22');assert.match(report.text,/Accepted work awaiting integration/);assert.match(report.text,/C:\/fixture\/combined/);assert.match(report.text,/Tomorrow — prioritized starting point/);assert.match(report.text,/Recommendations for discussion, not approved work/);assert.equal(report.nextSteps[0].taskId,'combined');assert.match(report.nextSteps[0].action,/decide whether to authorize integration/);assert.equal(store.list('task').length,1);assert.equal(store.list('session').length,0);}finally{store.close();}});

test('conversation recommendations persist in priority order and restore in the Captain snapshot without creating tasks',async()=>{const store=new Store(':memory:');try{store.add('session',{id:'captain',role:'captain',name:'Fixture'});const engine=Object.assign(Object.create(Engine.prototype),{store,changed(){}});const report=await engine.tool('captain','report',{date:'2026-10-22',nextSteps:[{action:'Discuss visual polish',priority:3,rationale:'Candidate only'},{action:'Choose tomorrow priority',priority:1,rationale:'No implementation authorized'}]});assert.equal(report.nextSteps[0].action,'Choose tomorrow priority');assert.match(report.text,/Captain recommendation/);const snapshot=engine.contextSnapshot(store.get('session','captain'));assert.deepEqual(snapshot.reports[0].nextSteps,report.nextSteps);assert.equal(store.list('task').length,0);assert.equal(store.list('session').length,1);}finally{store.close();}});

test('recommendations cannot attach another Captain task and invalid dates cannot create reports',async()=>{const store=new Store(':memory:');try{store.add('session',{id:'captain',role:'captain'});store.add('task',{id:'private',captainId:'other',title:'Other work'});const engine=Object.assign(Object.create(Engine.prototype),{store,changed(){}});await assert.rejects(()=>engine.tool('captain','report',{date:'2026-10-22',nextSteps:[{action:'Read other task',taskId:'private'}]}),/another Captain/);assert.throws(()=>engine.report('2026-02-30'),/valid report date/);assert.equal(store.list('report').length,0);}finally{store.close();}});
