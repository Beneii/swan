// Acceptance covers the reviewed scope and evidence, not later edits to them.
const reviewedFields=['objective','criteria','evidence','summary','components','dependencies','branch','worktree','projectId'];
export function patchTask(store,id,changes){
 const task=store.get('task',id);if(!task)throw Error('Task not found');
 const changed=reviewedFields.filter(key=>Object.hasOwn(changes,key)&&JSON.stringify(changes[key])!==JSON.stringify(task[key]));
 const reopened=Object.hasOwn(changes,'status')&&changes.status!=='Done';
 if(task.status!=='Done'||!changed.length&&!reopened)return store.patch('task',id,changes);
 return store.transaction(()=>{
  const reason=changed.length?'Reviewed fields changed: '+changed.join(', '):'Accepted task reopened';
  const history=[...(task.acceptanceHistory||[]),{verifiedAt:task.verifiedAt,acceptedBy:task.acceptedBy,acceptedReviewId:task.acceptedReviewId,invalidatedAt:new Date().toISOString(),reason}];
  const status=changes.status??((changes.evidence??task.evidence)?.length?'Ready for review':'Inbox');
  const deliveryHistory=[...(task.deliveryHistory||[]),...(task.integratedAt||task.deployedAt?[{integratedAt:task.integratedAt||null,deployedAt:task.deployedAt||null,integrationDeliveryId:task.integrationDeliveryId||null,deploymentDeliveryId:task.deploymentDeliveryId||null,invalidatedAt:new Date().toISOString(),reason}]:[])];
  const result=store.patch('task',id,{...changes,status,verifiedAt:null,acceptedBy:null,acceptedReviewId:null,acceptanceHistory:history,deliveryHistory,integratedAt:null,deployedAt:null,integrationDeliveryId:null,deploymentDeliveryId:null});
  for(const q of store.list('question'))if(q.taskId===id&&q.kind==='review'&&q.status==='open')store.patch('question',q.id,{status:'expired',answer:reason});
  store.event('acceptance_invalidated',{taskId:id,sessionId:task.sessionId,summary:reason});return result;
 });
}
