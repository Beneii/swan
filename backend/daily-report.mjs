import {scopedRecords} from './ownership.mjs';
const safe=value=>String(value??'').replace(/\r?\n/g,' ').replace(/([\[\]])/g,'\\$1');
const priority=task=>Number.isFinite(task.priority)?task.priority:2;
export function dailyReport(store,date,captainId,nextSteps=[]){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw Error('Choose a valid report date in YYYY-MM-DD form');
 const records=scopedRecords(store,captainId),tasks=records.tasks;
 const today=value=>{if(!value)return false;const instant=new Date(value);return !Number.isNaN(instant.valueOf())&&instant.toLocaleDateString('en-CA',{timeZone:'Australia/Sydney'})===date;};
 if(!Array.isArray(nextSteps)||nextSteps.length>10)throw Error('Use at most ten next-day recommendations');
 const recommendations=nextSteps.map(step=>{
  if(!step||typeof step.action!=='string'||!step.action.trim()||step.action.length>2000)throw Error('A next-day recommendation needs a concise action');
  if(step.rationale!==undefined&&(typeof step.rationale!=='string'||step.rationale.length>2000))throw Error('Recommendation rationale must be concise text');
  if(step.priority!==undefined&&![1,2,3].includes(step.priority))throw Error('Recommendation priority must be 1, 2 or 3');
  if(step.taskId&&!tasks.some(task=>task.id===step.taskId))throw Error('Recommendation task belongs to another Captain or does not exist');
  return {action:step.action.trim(),rationale:step.rationale||'',priority:step.priority??2,...(step.taskId?{taskId:step.taskId}:{}),source:'captain'};
 });
 const unfinished=tasks.filter(task=>task.status!=='Done').sort((a,b)=>priority(a)-priority(b));
 const unintegrated=tasks.filter(task=>task.status==='Done'&&task.branch&&!task.integratedAt).sort((a,b)=>(a.kind==='integration'?-1:0)-(b.kind==='integration'?-1:0)||priority(a)-priority(b));
 if(!recommendations.length){
  for(const task of unfinished.slice(0,5))recommendations.push({taskId:task.id,priority:priority(task),action:task.nextAction||`Review ${task.title} from its recorded ${task.status} state.`,rationale:`Current ledger state: ${task.status}.`,source:'ledger'});
  if(!unfinished.length&&unintegrated.length){const task=unintegrated[0];recommendations.push({taskId:task.id,priority:priority(task),action:'If continuing this work, inspect the accepted worktree and decide whether to authorize integration.',rationale:`${task.title}: accepted work on ${task.branch}; integration is not recorded. This is a decision to consider, not an approved assignment.`,source:'ledger'});}
 }
 recommendations.sort((a,b)=>a.priority-b.priority);
 let text=`# Swan · Daily report\n${date}\n\nGenerated from the local ledger. Completion, integration and deployment are recorded separately.\nAccepted outcomes use the Sydney calendar date above. Unfinished work and pending integration reflect the ledger at generation time.\n`;
 const sections=[['Accepted outcomes',tasks.filter(task=>task.status==='Done'&&today(task.verifiedAt))],['Integration confirmed today',tasks.filter(task=>today(task.integratedAt))],['Deployment confirmed today',tasks.filter(task=>today(task.deployedAt))],['Changed / awaiting review',tasks.filter(task=>task.status==='Ready for review')],['Accepted work awaiting integration',unintegrated],['Unfinished work',tasks.filter(task=>!['Done','Ready for review'].includes(task.status))],['Blockers and decisions',tasks.filter(task=>['Blocked','Needs me'].includes(task.status))]];
 for(const [name,items]of sections){text+=`\n## ${name}\n`;if(!items.length){text+='\nNone recorded.\n';continue;}
  for(const task of items){const worker=task.sessionId&&store.get('session',task.sessionId);text+=`\n### ${safe(task.title)}\n${task.status} · Priority ${priority(task)}\n[Task record](../tasks/${task.id}.md)${worker?` · [Worker conversation](capy://app/thread/${worker.id}) · Runtime: ${safe(worker.runtime||'unknown')}`:''}\n\nRecorded summary: ${task.summary||task.objective||'No summary recorded.'}\n\n${task.evidence?.map(item=>'- '+item).join('\n')||'No completion evidence recorded.'}\n\nNext recorded action: ${task.nextAction||'Review scope and choose the next action.'}\nBranch: ${task.branch||'none'} · Worktree: ${task.worktree||'not recorded'}\nIntegration: ${task.integratedAt||'not recorded'} · Deployment: ${task.deployedAt||'not recorded'}\n`;}
 }
 const deliveries=store.list('delivery').filter(delivery=>delivery.captainId===captainId&&today(delivery.confirmedAt));
 text+='\n## Confirmed delivery evidence\n'+(deliveries.length?deliveries.map(delivery=>`- ${safe(delivery.kind)} · Revision/artifact: ${safe(delivery.revision)} · Human confirmation ${delivery.confirmedAt}\n  Tasks: ${delivery.taskIds.join(', ')}\n  ${delivery.evidence.map(safe).join('\n  ')}`).join('\n'):'No integration or deployment evidence confirmed today.')+'\n';
 const questions=records.questions.filter(question=>question.status==='open');text+='\n## Outstanding questions and permissions\n'+(questions.length?questions.map(question=>`- ${safe(question.question)} · ${question.kind} · Question ${question.id}${question.recommendation?' · Recommendation: '+safe(question.recommendation):''}`).join('\n'):'None recorded.')+'\n';
 const decisions=records.decisions.filter(decision=>today(decision.createdAt));text+='\n## Decisions and findings\n'+(decisions.length?decisions.map(decision=>`- ${decision.answer}${decision.rationale?' — '+decision.rationale:''}`).join('\n'):'No decisions recorded today.')+'\n';
 text+='\n## Tomorrow — prioritized starting point\n\nRecommendations for discussion, not approved work. Saving this report does not start a worker or authorize a commit, merge, deployment or cleanup.\n\n';
 text+=recommendations.length?recommendations.map(step=>`- Priority ${step.priority}: ${safe(step.action)}${step.taskId?` ([task](../tasks/${step.taskId}.md))`:''}\n  ${safe(step.rationale)} · ${step.source==='captain'?'Captain recommendation':'Derived from current ledger state'}`).join('\n'):'No unfinished tasks or pending integration are recorded. Review new priorities when you next open Captain.';
 return {captainId,date,title:`Daily report · ${date}`,text,nextSteps:recommendations};
}
