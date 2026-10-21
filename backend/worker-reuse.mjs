import fs from 'node:fs';
import {ownerId} from './ownership.mjs';
import {repositoryIdentity} from './server/repository.mjs';
export function reuseAssignment(store,active,task,worker,options={}){
 if(!worker||worker.role!=='worker'||worker.projectId!==task.projectId||ownerId(worker)!==ownerId(task))throw Error('Worker belongs to another project or Captain');
 if(options.isolation&&options.isolation!==worker.isolation)throw Error('A reused worker retains its isolation mode. Create another worker for a different mode.');
 const previous=worker.taskId&&store.get('task',worker.taskId);
 if(previous&&previous.id!==task.id&&previous.status!=='Done')throw Error('Worker still owns an unfinished task.');
 if(worker.taskId!==task.id&&(active.has(worker.id)||worker.queue?.length||!['idle','failed','interrupted'].includes(worker.runtime)))throw Error('Finish or explicitly resolve the previous worker run and queued instructions before assigning another task.');
 if(worker.isolation==='worktree'){
  const actual=repositoryIdentity(worker.cwd);
  if(actual.repositoryRoot!==fs.realpathSync(worker.cwd)||actual.repositoryCommonDir!==worker.repositoryCommonDir||actual.branch!==worker.branch)throw Error('Reused worker repository or branch changed. Inspect its preserved workspace before continuing.');
  const overlap=store.list('task').find(other=>other.id!==task.id&&other.projectId===task.projectId&&other.sessionId&&['Working','Needs me','Blocked'].includes(other.status)&&other.components?.some(component=>task.components?.includes(component)));
  if(overlap)throw Error(`Component ownership overlaps ${overlap.title}; resolve or sequence it.`);
 }
 return Object.fromEntries(['branch','repositoryRoot','repositoryCommonDir','baseCommit','baseDirtyEntries','baselinePolicy'].map(key=>[key,worker[key]??null]).concat([['worktree',worker.cwd]]));
}
