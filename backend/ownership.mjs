// Records created before multiple Captains belong to the original coordinator.
export const ownerId=record=>record?.role==='captain'?record.id:record?.captainId||'captain';
export function scopedRecords(store,captainId){
  const sessions=store.list('session').filter(s=>ownerId(s)===captainId);
  const sessionIds=new Set(sessions.map(s=>s.id));
  const tasks=store.list('task').filter(t=>ownerId(t)===captainId);
  const taskIds=new Set(tasks.map(t=>t.id));
  return {sessions,tasks,
    questions:store.list('question').filter(q=>sessionIds.has(q.sessionId)||taskIds.has(q.taskId)),
    decisions:store.list('decision').filter(d=>d.taskId?taskIds.has(d.taskId):ownerId(d)===captainId),
    reports:store.list('report').filter(r=>ownerId(r)===captainId),
    events:store.list('event').filter(e=>sessionIds.has(e.sessionId)||taskIds.has(e.taskId)),
    messages:store.list('message').filter(m=>sessionIds.has(m.sessionId))};
}
