import {ownerId} from './ownership.mjs';
export function validateTaskInput(store,input,current=null){
 if(input.priority!==undefined&&(!Number.isInteger(input.priority)||input.priority<1||input.priority>3))throw Error('Priority must be 1, 2 or 3');
 for(const field of ['criteria','components','dependencies'])if(input[field]!==undefined&&(!Array.isArray(input[field])||input[field].some(value=>typeof value!=='string'||!value.trim())))throw Error(`${field} must contain nonempty strings`);
 if(input.criteria!==undefined&&!input.criteria.length)throw Error('Acceptance criteria cannot be empty');
 if(!current&&input.status!==undefined&&!['Inbox','Ready'].includes(input.status))throw Error('New tasks start Inbox or Ready. Completion requires evidence and human acceptance.');
 const task={...current,...input};
 for(const id of task.dependencies||[]){
  const dependency=store.get('task',id);
  if(!dependency||ownerId(dependency)!==ownerId(task)||dependency.projectId!==task.projectId)throw Error('Dependencies must be existing tasks in the same project and Captain');
  const seen=new Set();
  const visit=next=>{if(current&&next===current.id)throw Error('Task dependencies cannot form a cycle');if(seen.has(next))return;seen.add(next);for(const child of store.get('task',next)?.dependencies||[])visit(child);};
  visit(id);
 }
}
