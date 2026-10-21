const timezone='Australia/Sydney';
function localParts(now){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};}
function previousDay(date){return new Date(Date.parse(date+'T12:00:00Z')-86400000).toISOString().slice(0,10);}
export class ReportScheduler {
 constructor(engine,{clock=()=>new Date()}={}){this.engine=engine;this.store=engine.store;this.clock=clock;this.timer=null;}
 get(captainId){const saved=this.store.get('settings','report-schedule:'+captainId);return {...(saved||{captainId,enabled:false,time:'18:00',timezone}),runtimeRequired:true,catchUp:'Generate only the latest missed daily report when the local runtime next runs. Current state is captured at generation time; no historical state is invented.'};}
 configure(captainId,input){if(this.store.get('session',captainId)?.role!=='captain')throw Error('Captain not found');if(typeof input.enabled!=='boolean')throw Error('Choose whether this schedule is enabled');const current=this.get(captainId),time=input.time??current.time;if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Use a 24-hour Sydney time such as 18:00');const now=this.clock(),local=localParts(now);this.store.put('settings',{id:'report-schedule:'+captainId,captainId,name:input.name??current.name,enabled:input.enabled,time,timezone,startDate:current.startDate||local.date,lastReportDate:current.lastReportDate||null,lastReportId:current.lastReportId||null,configuredAt:now.toISOString()});return this.get(captainId);}
 tick(){const now=this.clock(),local=localParts(now);for(const schedule of this.store.list('settings').filter(s=>s.id.startsWith('report-schedule:')&&s.enabled)){
   const date=local.time>=schedule.time?local.date:previousDay(local.date);
   if(date<schedule.startDate||schedule.lastReportDate&&date<=schedule.lastReportDate)continue;
   if(this.store.get('session',schedule.captainId)?.role!=='captain')continue;
   try{const report=this.store.transaction(()=>{
     const generated=this.engine.report(date,schedule.captainId);
     const value=this.store.patch('report',generated.id,{scheduled:true,generatedAt:now.toISOString(),text:generated.text+`\n\nScheduled report generated at ${now.toISOString()}. Unfinished work reflects the ledger at generation time, including after sleep or downtime.\n`});
     this.store.patch('settings',schedule.id,{lastReportDate:date,lastReportId:value.id,lastError:null});return value;
   });this.engine.message(schedule.captainId,'system',`Daily report for ${date} is ready in Drive. Report ID: ${report.id}. It uses recorded evidence and current unfinished state; nothing was started or accepted.`);
   }catch(error){if(schedule.lastError!==error.message)this.store.patch('settings',schedule.id,{lastError:error.message});}
 }}
 start(){if(this.timer)return;this.tick();this.timer=setInterval(()=>this.tick(),30000);this.timer.unref();}
 stop(){clearInterval(this.timer);this.timer=null;}
}
