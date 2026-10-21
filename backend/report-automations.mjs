import {createHash} from 'node:crypto';
import {schemas,emptyValue,validate,explain} from './contracts.mjs';
const automationId=captainId=>{const h=createHash('sha256').update('swan-report:'+captainId).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;};
export class ReportAutomations {
 constructor(engine){this.engine=engine;this.store=engine.store;}
 rows(){return this.store.list('settings').filter(s=>s.id.startsWith('report-schedule:')).flatMap(schedule=>{
  const captain=this.store.get('session',schedule.captainId);if(!captain||captain.role!=='captain')return [];
  const reports=this.store.list('report').filter(r=>r.captainId===captain.id&&r.scheduled),last=reports.at(-1),[hour,minute]=schedule.time.split(':');
  const row={...emptyValue(schemas['get /orgs/:orgId/automations/:automationId'].ast),id:automationId(captain.id),projectId:captain.projectId||null,name:schedule.name||`Daily report · ${captain.name}`,description:'Local ledger report. Swan runtime must be running. After sleep, only the latest missed report is generated from current recorded state.',prompt:'Generate an evidence-based daily report from this Captain local ledger. No model call or worker is launched.',triggers:[{type:'schedule',cron:`${Number(minute)} ${Number(hour)} * * *`,timezone:'Australia/Sydney'}],model:null,repos:[],threadMode:'single',singleJamId:captain.id,slackImpersonation:false,enabled:schedule.enabled,deleted:false,creatorUserId:'user_swan_local',runAsKind:'human',runAsId:'user_swan_local',disabledReason:null,runCount:reports.length,lastTriggeredAt:last?.generatedAt||last?.createdAt||null,createdAt:schedule.configuredAt||schedule.updatedAt,updatedAt:schedule.updatedAt};
  if(!validate(schemas['get /orgs/:orgId/automations/:automationId'],row))throw Error('Local report automation contract mismatch: '+explain(schemas['get /orgs/:orgId/automations/:automationId'],row));
  return [row];
 });}
 route(method,url,input={}){const parts=url.pathname.split('/').filter(Boolean);if(parts[0]!=='orgs'||parts[1]!=='org_swan_local'||parts[2]!=='automations')return null;
  const rows=this.rows();
  if(parts.length===3&&method==='GET'){const projectId=url.searchParams.get('projectId');return {status:200,body:rows.filter(r=>!projectId||r.projectId===projectId)};}
  if(parts.length<4)return null;const row=rows.find(r=>r.id===parts[3]);if(!row)return {status:404,body:{error:'Local report schedule not found'}};
  if(parts.length===4&&method==='GET')return {status:200,body:row};
  if(parts.length===4&&method==='PATCH'){
   const reject=error=>{console.warn("Report editor rejected:",error);return {status:400,body:{error}};};
   const allowed=new Set(['projectId','name','description','prompt','triggers','model','repos','maxRunsPerDay','machineSize','organize','runAs','enabled','slackImpersonation']);
   for(const key of Object.keys(input))if(!allowed.has(key))return reject('Unsupported local report setting: '+key);
   // The original editor fills an inherited model even when the saved value is null.
   // Accept only this local account-default placeholder; reports never invoke it.
   if(input.model!=null&&input.model.modelId!=='claude-code/default')return reject('Local reports do not select a model.');
   for(const key of ['projectId','description','prompt','repos','maxRunsPerDay','machineSize','organize','enabled','slackImpersonation']){
    if(input[key]===undefined)continue;
    if(['maxRunsPerDay','machineSize','organize'].includes(key)&&input[key]==null&&row[key]==null)continue;
    if(key==='repos'&&input[key]==null&&row.repos.length===0)continue;
    if(JSON.stringify(input[key])!==JSON.stringify(row[key]))return reject('Local reports cannot change '+key+'; they use recorded ledger evidence.');
   }
   if(input.runAs!=null&&(input.runAs?.kind!=='human'||input.runAs?.user_id!=='user_swan_local'))return reject('Local reports run as you.');
   if(input.name!==undefined&&(typeof input.name!=='string'||!input.name.trim()||input.name.length>100))return reject('Report name must be 1 to 100 characters.');
   let time;
   if(input.triggers!==undefined){const trigger=input.triggers?.[0],match=typeof trigger?.cron==='string'&&trigger.cron.match(/^(\d{1,2}) (\d{1,2}) \* \* \*$/);if(!Array.isArray(input.triggers)||input.triggers.length!==1||trigger.type!=='schedule'||trigger.timezone!=='Australia/Sydney'||!match||Number(match[1])>59||Number(match[2])>23)return reject('Choose one daily report time in Australia/Sydney.');time=match[2].padStart(2,'0')+':'+match[1].padStart(2,'0');}
   this.engine.reportScheduler.configure(row.singleJamId,{enabled:row.enabled,...(time?{time}:{}),...(input.name!==undefined?{name:input.name.trim()}: {})});
   this.engine.emit();const saved={...this.rows().find(r=>r.id===row.id),webhookUrl:null};
   if(!validate(schemas['update /orgs/:orgId/automations/:automationId'],saved))throw Error('Saved local automation contract mismatch');
   return {status:200,body:saved};
  }
  if(parts.length===5&&method==='POST'&&['enable','disable'].includes(parts[4])){this.engine.reportScheduler.configure(row.singleJamId,{enabled:parts[4]==='enable'});this.engine.emit();return {status:200,body:this.rows().find(r=>r.id===row.id)};}
  return {status:400,body:{error:'This automation is a local daily report. Configure its time through Captain chat; cloud prompts, webhooks and remote runs are unavailable.'}};
 }
}
