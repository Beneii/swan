import {execFileSync} from 'node:child_process';
import path from 'node:path';
export function processExists(pid){if(!Number.isInteger(pid)||pid<1)return false;try{process.kill(pid,0);return true;}catch(error){return error.code!=='ESRCH';}}
export class ProcessTracker {
 constructor(executable){this.executable=path.resolve(executable);}
 inspect(session){const pid=session.processId;if(!processExists(pid))return {state:'absent'};if(process.platform!=='win32')return {state:'unknown',reason:'Process identity inspection is unavailable on this platform'};
  try{const command=`$p=Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if($null -eq $p){'null'}else{@{executable=$p.ExecutablePath; commandLine=$p.CommandLine; birth=$p.CreationDate.ToUniversalTime().ToString('o')} | ConvertTo-Json -Compress}`;
   const info=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true,timeout:10000}));if(!info)return {state:'absent'};if(!info.executable||!info.commandLine||!info.birth)return {state:'unknown',reason:'Operating system did not supply process identity'};
   const expected=session.processExecutable||this.executable,quotedId=session.claudeSessionId?.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   const sameExecutable=path.resolve(info.executable).toLowerCase()===path.resolve(expected).toLowerCase();
   const sameSession=quotedId&&new RegExp('--(?:session-id|resume)\\s+"?'+quotedId+'(?=["\\s]|$)').test(info.commandLine);
   const sameBirth=!session.processBirth||session.processBirth===info.birth;
   return sameExecutable&&sameSession&&sameBirth?{state:'owned',birth:info.birth,executable:info.executable}:{state:'different'};
  }catch{return {state:'unknown',reason:'Could not inspect recorded process identity'};}
 }
 stop(session){const before=this.inspect(session);if(before.state!=='owned')return before;try{execFileSync('taskkill',['/PID',String(session.processId),'/T','/F'],{windowsHide:true,stdio:'pipe',timeout:10000});}catch{/* taskkill can report a child error after the owned process exits. */}return this.inspect(session);}
}
export function recoverSession(store,session,tracker){if(!session.processId)return true;let identity=tracker.inspect(session);if(identity.state==='owned')identity=tracker.stop(session);
 if(identity.state==='absent'||identity.state==='different'){store.patch('session',session.id,{runtime:'interrupted',processId:null,processOwner:null,processBirth:null,processExecutable:null,latest:'Runtime restarted. Conversation and workspace preserved; inspect state and resume explicitly.'});if(session.taskId){const task=store.get('task',session.taskId);if(task?.status==='Working')store.patch('task',task.id,{status:'Blocked',nextAction:'Inspect the preserved workspace and resume the interrupted session.'});}store.add?.('message',{sessionId:session.id,role:'system',text:'The local runtime restarted during this session. Existing files and conversation are preserved. Pending tool approvals expired. Inspect the current state before resuming; interrupted operations were not replayed.'});store.event('process_recovered',{sessionId:session.id,outcome:identity.state==='different'?'recorded PID now belongs to a different process; left untouched':'recorded process is stopped',replayed:false});return true;}
 store.patch('session',session.id,{runtime:'recovery required',latest:'A recorded process may still be running. No new process will start until its identity and exit are verified.'});store.event('process_recovery_blocked',{sessionId:session.id,reason:identity.reason||'Owned process still running'});return false;
}
