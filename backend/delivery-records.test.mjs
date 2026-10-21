import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from './server/store.mjs';
import {DeliveryRecords} from './delivery-records.mjs';
import {PermissionSurface} from './permission-surface.mjs';
import {patchTask} from './task-changes.mjs';
import {dailyReport} from './daily-report.mjs';
function fixture(){const store=new Store(':memory:');store.add('session',{id:'captain',role:'captain'});store.add('task',{id:'task',captainId:'captain',projectId:'project',title:'Fixture',objective:'Fixture',status:'Done',verifiedAt:new Date().toISOString(),acceptedReviewId:'accepted-fixture',criteria:['Outcome'],evidence:['Accepted test evidence'],branch:'fixture'});const deliveries=new DeliveryRecords(store),surface=new PermissionSurface(store,{deliveries,approvals:new Map()});const input={taskIds:['task'],kind:'integration',revision:'fixture-commit-123',evidence:['Git integration checked in isolated fixture']};return {store,deliveries,surface,input};}
const action=(id,choice)=>new URL(`http://localhost/orgs/org_swan_local/devices/swan-local-device/agent-access/${id}/${choice}`);
test('delivery claim needs a human card and records only confirmed evidence',()=>{const {store,deliveries,surface,input}=fixture();try{
 const question=deliveries.request('captain',input);assert.equal(deliveries.request('captain',input).id,question.id);assert.equal(store.get('task','task').integratedAt,undefined);assert.equal(store.list('delivery').length,0);
 const rows=surface.route('GET',new URL('http://localhost/orgs/org_swan_local/threads/captain/agent-access')).body;assert.equal(rows.length,1);assert.match(rows[0].toolInput.scope,/does not run/);
 assert.equal(surface.route('POST',action(question.id,'grant')).status,200);assert.ok(store.get('task','task').integratedAt);assert.equal(store.get('task','task').deployedAt,undefined);assert.equal(store.list('delivery').length,1);assert.equal(surface.route('POST',action(question.id,'grant')).status,409);
 const date=new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Sydney'});const report=dailyReport(store,date,'captain');assert.match(report.text,/Integration confirmed today/);assert.match(report.text,/fixture-commit-123/);assert.match(report.text,/Git integration checked/);assert.doesNotMatch(report.text,/No integration or deployment evidence confirmed today/);
}finally{store.close();}});
test('denied, foreign, unaccepted and changed tasks cannot become delivered',()=>{const {store,deliveries,surface,input}=fixture();try{
 assert.throws(()=>deliveries.request('other',input),/human-accepted tasks/);assert.throws(()=>deliveries.request('captain',{...input,evidence:[]}),/evidence/);
 let question=deliveries.request('captain',input);assert.equal(surface.route('POST',action(question.id,'deny')).status,200);assert.equal(store.list('delivery').length,0);
 question=deliveries.request('captain',input);patchTask(store,'task',{criteria:['Changed scope']});assert.equal(surface.route('POST',action(question.id,'grant')).status,409);assert.equal(store.get('question',question.id).status,'expired');assert.equal(store.list('delivery').length,0);
 assert.throws(()=>deliveries.request('captain',input),/human-accepted tasks/);
}finally{store.close();}});
test('reopened scope clears current delivery markers while preserving history',()=>{const {store,deliveries,input}=fixture();try{
 const question=deliveries.request('captain',input);deliveries.settle(question.id,true);const id=store.get('task','task').integrationDeliveryId;patchTask(store,'task',{objective:'New scope'});const task=store.get('task','task');assert.equal(task.integratedAt,null);assert.equal(task.deliveryHistory[0].integrationDeliveryId,id);assert.equal(store.list('delivery').length,1);
}finally{store.close();}});
