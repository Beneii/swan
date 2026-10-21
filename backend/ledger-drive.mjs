import {scopedRecords} from './ownership.mjs';
import {createHash} from 'node:crypto';
import {schemas,validate,explain} from './contracts.mjs';
import {VolumeScopeDirectory} from '../resources/app/out/main/local-client-schemas.mjs';
import fs from 'node:fs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const stableId=(prefix,value)=>prefix+hash(value).slice(0,26).toUpperCase();
const safe=value=>String(value??'').replace(/\r?\n/g,' ').replace(/([\[\]])/g,'\\$1');
const states=['Inbox','Ready','Working','Blocked','Needs me','Ready for review','Done'];
export class LedgerDrive {
 constructor(store){this.store=store;}
 workspaceSnapshot(){
  const captains=this.store.list('session').filter(session=>session.role==='captain'),files={};
  let index='# Swan workspace ledger\n\nRead-only views of the authoritative local ledger, grouped by Captain.\n\n';
  const snapshots=captains.map(captain=>{const snapshot=this.snapshot(captain.id),prefix=`captains/${captain.id}/`;for(const [file,content]of Object.entries(snapshot.files))files[prefix+file]=content;index+=`- [${safe(captain.name||'Captain')}](${prefix}NOTES.md)\n`;return snapshot;});
  files['WORKSPACE.md']=index;
  const entries=Object.entries(files).sort(([a],[b])=>a.localeCompare(b)).map(([path,content])=>({path,mode:420,sizeBytes:Buffer.byteLength(content),sha256:hash(content)})),digest=hash(JSON.stringify(entries)),volumeId=stableId('vol_','workspace'),versionId=stableId('vver_','workspace:'+digest);
  const manifest={volumeId,versionId,digest,parentDigest:null,entries,fileCount:entries.length,totalBytes:entries.reduce((sum,entry)=>sum+entry.sizeBytes,0)};
  const volume={id:volumeId,namespace:'artifacts',name:'Swan workspace ledger',projectId:null,userId:null,automationId:null,description:'Read-only Captain folders from the local task ledger',archived:false,headVersionId:versionId,headDigest:digest,fileCount:manifest.fileCount,totalBytes:manifest.totalBytes,headUpdatedAt:snapshots.map(snapshot=>snapshot.volume.headUpdatedAt).filter(Boolean).sort().at(-1)||null};
  if(!this.store.get('volumeSnapshot',versionId))this.store.put('volumeSnapshot',{id:versionId,captainId:null,manifest,volume,files});
  return {manifest,volume,files};
 }
 snapshot(captainId='captain'){
  const captain=this.store.get('session',captainId);
  if(!captain||captain.role!=='captain')return null;
  const {tasks,questions,decisions,reports}=scopedRecords(this.store,captainId);
  const files={};
  let notes='# Work ledger\n\nLive view of the local database. Task status, worker runtime, acceptance, integration and deployment are recorded separately.\n';
  for(const status of states){const items=tasks.filter(t=>t.status===status);if(!items.length)continue;notes+=`\n## ${status}\n`;
   for(const task of items){const worker=task.sessionId&&this.store.get('session',task.sessionId),taskFile=`tasks/${task.id}.md`;
    notes+=`
- [${safe(task.title)}](${taskFile}) · Priority ${task.priority} · ${safe(worker?.runtime||'unassigned')}
  Next: ${safe(task.nextAction||'Review scope and choose the next action.')}
`;
    let detail=`# ${safe(task.title)}

${safe(task.objective)}

- Task: ${task.id}
- Status: ${safe(task.status)}
- Priority: ${task.priority}
- Worker: ${worker?'['+safe(worker.name)+'](capy://app/thread/'+worker.id+') · '+safe(worker.runtime):'Unassigned'}
- Next: ${safe(task.nextAction||'Review scope and choose the next action.')}
- Latest: ${safe(task.summary||'No update recorded.')}
- Verified: ${safe(task.verifiedAt||'Not accepted')}
- Integration: ${safe(task.integratedAt||'Not recorded')} · Deployment: ${safe(task.deployedAt||'Not recorded')}
- Repository: ${safe(this.store.get('project',task.projectId)?.path||'Not recorded')}
- Verified repository root: ${safe(task.repositoryRoot||'Not recorded')}
- Base commit: ${safe(task.baseCommit||'Not recorded')}
- Baseline: ${safe(task.baselinePolicy||'Not recorded')}
- Base checkout changes: ${safe(task.baseDirtyEntries?.join('; ')||'None recorded')}
- Branch: ${safe(task.branch||'None')}
- Worktree: ${safe(task.worktree||'None')}
- Dependencies: ${safe(task.dependencies?.join(', ')||'None')}
- Components: ${safe(task.components?.join(', ')||'None')}
- Assignment kind: ${safe(task.kind||'Implementation')}
- Integration sources: ${safe(task.integrationOf?.join(', ')||'None')}
- Integration owner: ${safe(task.integrationOwnerSessionId||'Unassigned')}
`;
    if(task.criteria?.length)detail+='\n## Acceptance criteria\n'+task.criteria.map(c=>'- '+safe(c)).join('\n')+'\n';
    if(task.evidence?.length)detail+='\n## Recorded evidence\n\nWorker claims until reviewed.\n\n'+task.evidence.map(e=>'- '+safe(e)).join('\n')+'\n';
    for(const id of [task.integrationDeliveryId,task.deploymentDeliveryId].filter(Boolean)){const delivery=this.store.get('delivery',id);if(delivery)detail+=`\n## Confirmed ${safe(delivery.kind)}\n\nRevision/artifact: ${safe(delivery.revision)}\nHuman confirmation: ${delivery.confirmedAt}\n${delivery.evidence.map(item=>'- '+safe(item)).join('\n')}\n`;}
    files[taskFile]=detail;
   }
  }
  if(!tasks.length)notes+='\n## Tasks\n\nNo tasks recorded.\n';
  const pending=questions.filter(q=>q.status==='open');
  notes+='\n## Decisions needed\n\n'+(pending.length?pending.map(q=>`- ${safe(q.question)} (${q.kind}; question ${q.id})${q.recommendation?' Recommendation: '+safe(q.recommendation):''}`).join('\n'):'None recorded.')+'\n';
  notes+='\n## Recorded decisions\n\n'+(decisions.length?decisions.map(d=>`- ${safe(d.answer)}${d.rationale?' — '+safe(d.rationale):''} (question ${d.questionId})`).join('\n'):'None recorded.')+'\n';
  notes+='\n## Daily reports\n\n';
  for(const report of reports){const file=`reports/${report.date}-${report.id}.md`;files[file]=report.text;notes+=`- [${safe(report.title)}](${file})\n`;}
  if(!reports.length)notes+='No reports recorded.\n';
  files['NOTES.md']=notes;
  const entries=Object.entries(files).sort(([a],[b])=>a.localeCompare(b)).map(([path,content])=>({path,mode:420,sizeBytes:Buffer.byteLength(content),sha256:hash(content)}));
  const digest=hash(JSON.stringify(entries)),volumeId=stableId('vol_',captainId),versionId=stableId('vver_',captainId+':'+digest);
  const dates=[captain,...tasks,...questions,...decisions,...reports].map(x=>x.updatedAt||x.createdAt).filter(Boolean).sort();
  const updatedAt=dates.at(-1)||'1970-01-01T00:00:00.000Z';
  const manifest={volumeId,versionId,digest,parentDigest:null,entries,fileCount:entries.length,totalBytes:entries.reduce((sum,e)=>sum+e.sizeBytes,0)};
  const volume={id:volumeId,namespace:'artifacts',name:`Swan work ledger · ${captain.name||'Captain'}`,projectId:null,userId:null,automationId:null,description:'Read-only task ledger and recorded daily reports',archived:false,headVersionId:versionId,headDigest:digest,fileCount:manifest.fileCount,totalBytes:manifest.totalBytes,headUpdatedAt:updatedAt};
  if(!this.store.get('volumeSnapshot',versionId))this.store.put('volumeSnapshot',{id:versionId,captainId,manifest,volume,files});
  return {manifest,volume,files};
 }
 checked(operation,value){const schema=schemas[operation];if(!schema||!validate(schema,value))throw Error('Drive response schema mismatch: '+(schema?explain(schema,value):operation));return {status:200,body:value};}
 route(method,url){if(method!=='GET')return null;const parts=url.pathname.split('/').filter(Boolean);if(parts[0]!=='orgs'||parts[1]!=='org_swan_local')return null;
  if(parts[2]==='drive-scopes'&&parts.length===3){const volumes=this.store.list('session').filter(session=>session.role==='captain').map(session=>this.snapshot(session.id).volume);const disk=fs.statfsSync(process.cwd()),value={storage:{usedBytes:(disk.blocks-disk.bfree)*disk.bsize,limitBytes:disk.blocks*disk.bsize,tier:null},items:[{projectId:null,userId:null,automationId:null,fileCount:volumes.reduce((sum,volume)=>sum+volume.fileCount,0),totalBytes:volumes.reduce((sum,volume)=>sum+volume.totalBytes,0),headUpdatedAt:volumes.map(volume=>volume.headUpdatedAt).filter(Boolean).sort().at(-1)||null}],page:0,pageCount:1,totalScopes:1};if(!validate(VolumeScopeDirectory,value))throw Error('Original Drive scope directory rejected local metadata');return {status:200,body:value};}
  if(parts[2]!=='drive')return null;
  if(parts.length===3){const excluded=url.searchParams.get('archived')==='true'||url.searchParams.has('projectId')||url.searchParams.has('userId')||url.searchParams.has('automationId');const snapshot=excluded?null:url.searchParams.has('captainJamId')?this.snapshot(url.searchParams.get('captainJamId')):this.workspaceSnapshot();return this.checked('list /orgs/:orgId/drive',snapshot?[snapshot.volume]:[]);}
  if(parts[4]==='versions'&&parts[5]){const snapshot=this.store.get('volumeSnapshot',parts[5]);if(!snapshot||snapshot.manifest.volumeId!==parts[3])return {status:404,body:{error:'Local ledger version not found'}};
   if(parts.length===6)return this.checked('manifest /orgs/:orgId/drive/:volumeId/versions/:versionId',snapshot.manifest);
   if(parts[6]==='files'&&parts.length===8){const entry=snapshot.manifest.entries.find(e=>e.sha256===parts[7]);if(!entry)return {status:404,body:{error:'Local ledger file not found'}};return this.checked('file /orgs/:orgId/drive/:volumeId/versions/:versionId/files/:sha256',{type:'content',content:snapshot.files[entry.path]});}
  }
  if(parts[4]==='shares')return this.checked('listShares /orgs/:orgId/drive/:volumeId/shares',[]);
  return null;
 }
}
