import {taskVersion} from './task-reviews.mjs';
import {ownerId} from './ownership.mjs';
export class DeliveryRecords {
 constructor(store,changed=()=>{}){this.store=store;this.changed=changed;}
 request(captainId,input){
  if(!['integration','deployment'].includes(input.kind))throw Error('Choose integration or deployment');
  if(typeof input.revision!=='string'||!input.revision.trim()||input.revision.length>2000)throw Error('Identify the exact delivered revision or artifact');
  if(!Array.isArray(input.evidence)||!input.evidence.length||input.evidence.some(value=>typeof value!=='string'||!value.trim()))throw Error('Delivery evidence is required');
  if(!Array.isArray(input.taskIds)||!input.taskIds.length||input.taskIds.length>20)throw Error('Choose one to twenty accepted tasks');
  const ids=[...new Set(input.taskIds)],tasks=ids.map(id=>this.store.get('task',id));
  if(tasks.some(task=>!task||ownerId(task)!==captainId||task.status!=='Done'||!task.verifiedAt))throw Error('Delivery records require human-accepted tasks owned by this Captain');
  if(new Set(tasks.map(task=>task.projectId)).size!==1)throw Error('Choose tasks from one project');
  const versions=tasks.map(task=>({id:task.id,version:taskVersion(task)}));
  const payload={kind:input.kind,revision:input.revision.trim(),evidence:input.evidence,taskIds:ids,versions};
  const old=this.store.list('question').find(question=>question.kind==='delivery'&&question.status==='open'&&question.sessionId===captainId&&JSON.stringify(question.delivery)===JSON.stringify(payload));if(old)return old;
  const question=this.store.add('question',{sessionId:captainId,taskId:ids[0],kind:'delivery',status:'open',question:`Record ${input.kind} for ${ids.length} accepted task(s)?`,toolName:`Record ${input.kind} evidence`,delivery:payload,input:{action:`Record already completed ${input.kind}; do not execute it`,revision:payload.revision,evidence:payload.evidence,tasks:tasks.map(task=>({id:task.id,title:task.title,acceptedReviewId:task.acceptedReviewId})),scope:'This confirms the supplied delivery evidence only. It does not run a merge, deploy, publish or cleanup command.'}});
  this.changed();return question;
 }
 settle(id,accept){
  const question=this.store.get('question',id);if(!question||question.kind!=='delivery'||question.status!=='open')throw Error('Delivery review expired or already resolved');
  const tasks=question.delivery.versions.map(record=>({record,task:this.store.get('task',record.id)}));
  if(tasks.some(({record,task})=>!task||task.status!=='Done'||!task.verifiedAt||taskVersion(task)!==record.version)){
   this.store.patch('question',id,{status:'expired',answer:'Accepted task changed after delivery review was requested'});this.changed();throw Error('Task changed. Request a fresh delivery review.');
  }
  const result=this.store.transaction(()=>{
   const at=new Date().toISOString();this.store.patch('question',id,{status:accept?'approved':'denied',reviewedAt:at,answer:accept?'Human confirmed supplied delivery evidence':'Delivery evidence not confirmed'});
   if(!accept)return null;
   const delivery=this.store.add('delivery',{captainId:question.sessionId,kind:question.delivery.kind,revision:question.delivery.revision,evidence:question.delivery.evidence,taskIds:question.delivery.taskIds,taskVersions:question.delivery.versions,confirmedAt:at,confirmedBy:'user_swan_local',reviewQuestionId:id});
   for(const {task}of tasks)this.store.patch('task',task.id,delivery.kind==='integration'?{integratedAt:at,integrationDeliveryId:delivery.id}:{deployedAt:at,deploymentDeliveryId:delivery.id});
   this.store.event('delivery_confirmed',{sessionId:question.sessionId,taskId:question.taskId,deliveryId:delivery.id,summary:`${delivery.kind}: ${delivery.revision}`});return delivery;
  });this.changed();return result;
 }
}
