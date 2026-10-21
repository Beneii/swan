import {ownerId} from './ownership.mjs';
import {createHash} from 'node:crypto';
const sourceVersion=task=>createHash('sha256').update(JSON.stringify({id:task.id,captainId:ownerId(task),projectId:task.projectId,objective:task.objective,criteria:task.criteria,evidence:task.evidence,summary:task.summary,status:task.status,branch:task.branch,worktree:task.worktree,verifiedAt:task.verifiedAt,acceptedReviewId:task.acceptedReviewId})).digest('hex');
export function assertIntegrationSources(store,task){
 if(task.kind!=='integration')return;
 if(!Array.isArray(task.sourceVersions)||task.sourceVersions.length<2)throw Error('Integration source versions are missing. Prepare a fresh assignment.');
 for(const recorded of task.sourceVersions){const source=store.get('task',recorded.taskId);if(!source||ownerId(source)!==ownerId(task)||source.projectId!==task.projectId||source.status!=='Done'||!source.verifiedAt||!recorded.version||sourceVersion(source)!==recorded.version)throw Error('Integration source changed after planning. Review current sources and prepare a fresh integration assignment.');}
}
export function createIntegration(engine,captainId,input){
 const ids=[...new Set(input.taskIds||[])];if(ids.length<2)throw Error('Choose at least two reviewed source tasks');
 const tasks=ids.map(id=>engine.task(id));
 if(tasks.some(t=>ownerId(t)!==captainId))throw Error('Source task belongs to another Captain');
 if(tasks.some(t=>t.status!=='Done'||!t.verifiedAt))throw Error('Source tasks require human acceptance before preparing integration');
 if(new Set(tasks.map(t=>t.projectId)).size!==1)throw Error('Integration tasks must belong to one project');
 if(!input.title?.trim()||!input.criteria?.length)throw Error('Integration objective and acceptance criteria are required');
 const task=engine.createTask({captainId,projectId:tasks[0].projectId,title:input.title,objective:input.objective||input.title,status:input.status==='Ready'?'Ready':'Inbox',priority:input.priority||2,dependencies:ids,components:[...new Set(tasks.flatMap(t=>t.components||[]))],criteria:[...input.criteria,'Identify the exact combined revision, repository and worktree that were checked.','Verify the combined result against its acceptance criteria; separate branch checks alone are insufficient.','Record outstanding conflicts and unverified behavior. Integration and deployment require separate evidence and authorization.']});
 return engine.store.patch('task',task.id,{kind:'integration',integrationOf:ids,sourceVersions:tasks.map(t=>({taskId:t.id,branch:t.branch||null,worktree:t.worktree||null,acceptedAt:t.verifiedAt,updatedAt:t.updatedAt,version:sourceVersion(t)})),integrationOwnerSessionId:null,nextAction:'Assign one integration owner to prepare and verify the combined result. This plan does not merge branches or authorize publication.'});
}
