import {ownerId} from './ownership.mjs';
import {patchTask} from './task-changes.mjs';
export function failureKind(message){
 if(/not logged|sign in|authentication|unauthorized|\b401\b|invalid.*key|expired.*(?:oauth|token)/i.test(message))return 'authentication';
 if(/usage limit|session limit|weekly limit|quota|spend limit|insufficient credits|exhausted.*credits|hit your.*limit/i.test(message))return 'usage-limit';
 if(/rate.?limit|\b429\b|\b529\b|overloaded|capacity error/i.test(message))return 'rate-limit';
 return 'runtime';
}
export function recordRuntimeFailure(engine,id,message){
 const session=engine.store.get('session',id);if(!session)return;
 const text=String(message||'Claude Code did not finish successfully.').slice(-4000),kind=failureKind(text);
 if(session.runtime==='failed'&&session.failure?.message===text)return session.failure;
 const failure={kind,message:text,at:new Date().toISOString(),automaticRetry:false};
 engine.store.patch('session',id,{runtime:'failed',latest:text,failure});
 const task=session.taskId&&engine.store.get('task',session.taskId);
 if(task&&['Ready','Working','Blocked'].includes(task.status))patchTask(engine.store,task.id,{status:'Blocked',nextAction:'Resolve the runtime failure, then explicitly continue this assignment.',runtimeFailure:failure});
 const notice=`Claude Code stopped (${kind}): ${text}\nConversation, queued instructions and workspace are preserved. No automatic retry or API fallback was started.`;
 engine.message(id,'system',notice);
 if(session.role==='worker')engine.message(ownerId(session),'system',`Worker ${id} (${session.name||'worker'}) failed. ${notice}`);
 if(['authentication','usage-limit','rate-limit'].includes(kind)){
  engine.store.put('settings',{id:'runtime-hold',active:true,kind,message:text,createdAt:failure.at});
  for(const waiting of engine.store.list('session').filter(s=>s.runtime==='queued')){
   engine.store.patch('session',waiting.id,{runtime:'interrupted',latest:'Automatic starts paused after a Claude authentication or usage failure. Send a new message after resolving it.'});
   const queuedTask=waiting.taskId&&engine.store.get('task',waiting.taskId);if(queuedTask&&['Ready','Working'].includes(queuedTask.status))patchTask(engine.store,queuedTask.id,{status:'Blocked',nextAction:'Resolve the account/runtime limit, then explicitly resume this assignment.'});
  }
 }
 engine.store.event('runtime_failed',{sessionId:id,taskId:session.taskId,kind,summary:text});engine.emit();return failure;
}
