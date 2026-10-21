import {createHash,randomUUID} from 'node:crypto';
const hash=text=>createHash('sha256').update(text).digest('hex');
export async function admitConversation(runtime,projectId,input){
 const bad=error=>({status:400,body:{error}});
 if(typeof input.jamId!=='string'||!/^jam_(?:[0-7][0-9A-HJKMNP-TV-Z]{25}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(input.jamId))return bad('A valid conversation ID is required');
 if(typeof input.requestId!=='string'||!input.requestId||input.requestId.length>160)return bad('A request ID is required');
 if(typeof input.message!=='string'||!input.message.trim())return bad('Write a message to your Captain');
 if(input.title!=null&&(typeof input.title!=='string'||input.title.length>100))return bad('Conversation name must be at most 100 characters');
 if(input.model?.modelId&&input.model.modelId!=='claude-code/default')return bad('Only local Claude Code is available');
 if(input.files?.length||input.mentions?.length)return bad('Attachments and mentions are not supported in this local composer. Describe the relevant project files in your message.');
 if(input.environmentVariables?.length||Object.keys(input.branches||{}).length||input.slackChannelId||input.memberIds?.some(id=>id!=='user_swan_local'))return bad('This local Captain supports private conversations on this PC. Remote environments, branch overrides and sharing are unavailable.');
 if(input.device?.deviceId&&input.device.deviceId!=='swan-local-device')return bad('Choose this PC for local execution');
 if(projectId)runtime.engine.project(projectId);
 const text=input.message.trim(),fingerprint=hash(text),sessions=runtime.store.list('session');
 const previous=sessions.find(s=>s.id===input.jamId)||sessions.find(s=>s.admission?.requestId===input.requestId);
 if(previous){if(previous.role!=='captain'||previous.admission?.requestId!==input.requestId||previous.admission?.messageHash!==fingerprint||(previous.projectId||null)!==(projectId||null))return {status:409,body:{error:'This conversation or request ID already belongs to a different message'}};return {status:200,body:runtime.detail(previous)};}
 const session=runtime.store.add('session',{id:input.jamId,name:input.title?.trim()||text.split(/\r?\n/)[0].slice(0,100),role:'captain',projectId:projectId||null,runtime:'idle',queue:[],claudeSessionId:randomUUID(),started:false,admission:{requestId:input.requestId,messageHash:fingerprint,source:'original-new-thread-composer'}});
 runtime.engine.emit();
 try{await runtime.engine.send(session.id,text,{clientKey:input.clientKey||input.requestId});}
 catch(error){const recorded=runtime.store.get('session',session.id);runtime.store.patch('session',session.id,{runtime:'failed',latest:error.message,startupError:error.message});if(recorded.failure?.message!==error.message)runtime.engine.message(session.id,'system','Conversation saved, but Claude Code could not start: '+error.message);runtime.engine.emit();}
 return {status:200,body:runtime.detail(runtime.store.get('session',session.id))};
}
