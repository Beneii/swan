import {ReportScheduler} from './report-scheduler.mjs';
import net from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {UserProfile,Organization,decodeEither} from '../resources/app/out/main/local-client-schemas.mjs';
import {emptyResponses} from './contracts.mjs';
import {WebSocketServer} from 'ws';
import {CapyRuntime} from './runtime.mjs';
const alreadyListening=await new Promise(resolve=>{const probe=net.connect({host:'127.0.0.1',port:4790});probe.once('connect',()=>{probe.destroy();resolve(true);});probe.once('error',()=>resolve(false));});if(alreadyListening)throw Error('Local port 4790 is already occupied; refusing duplicate runtime startup');
const root=path.dirname(fileURLToPath(import.meta.url)),data=path.join(root,'data');fs.mkdirSync(data,{recursive:true});const keyPath=path.join(data,'local-session-key');if(!fs.existsSync(keyPath))fs.writeFileSync(keyPath,randomBytes(32).toString('hex'));const key=fs.readFileSync(keyPath,'utf8');
const now=new Date().toISOString(),orgId='org_swan_local',userId='user_swan_local';
let user={id:userId,email:null,firstName:'You',lastName:null,imageUrl:null,superadmin:false,preferences:{preferredOrgId:orgId,experiments:{captain:'on'},model:{modelId:'claude-code/default'}},onboardedAt:now,createdAt:now,updatedAt:now};
const organization={id:orgId,name:'Swan local workspace',avatarUrl:null,accessLevel:'owner',defaultProjectId:null,entitlements:[],experiments:[{feature:'captain',orgEnabled:true}],createdAt:now,updatedAt:now};
for(const [schema,value]of [[UserProfile,user],[Organization,organization]]){const decoded=decodeEither(schema)(value);console.log(schema.ast.annotations?.identifier||'schema',decoded._tag);if(decoded._tag==='None'||decoded._tag==='Left')throw Error('Local response failed original schema validation: '+JSON.stringify(decoded));}
const log=(method,url,status)=>fs.appendFileSync(path.join(data,'requests.jsonl'),JSON.stringify({at:new Date().toISOString(),method,path:url.pathname,status})+'\n');
let realtime;
const runtime=new CapyRuntime(root,()=>{if(!realtime)return;for(const ws of realtime.clients){if(!ws.swanAuthenticated)continue;for(const s of runtime.store.list('session'))for(const table of ['jam','jam_event','captain','volume','device_agent_access'])ws.send(JSON.stringify({type:'hint',table,op:'update',scopes:{orgId,jamId:s.id},changedColumns:['status','title','sort_activity_at']}));}});
const reportScheduler=new ReportScheduler(runtime.engine);runtime.engine.reportScheduler=reportScheduler;
const savedProfile=runtime.store.get('settings','profile');if(savedProfile?.preferences)user.preferences={...user.preferences,...savedProfile.preferences};
const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://127.0.0.1:4790');if(url.pathname.startsWith('/app/'))url.pathname=url.pathname.slice(4);const origin=req.headers.origin;if(origin&&origin!=='capy://app'&&origin!=='http://127.0.0.1:4790'){res.writeHead(403);res.end();return;}res.setHeader('Access-Control-Allow-Origin',origin||'http://127.0.0.1:4790');res.setHeader('Access-Control-Allow-Credentials','true');res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers',req.headers['access-control-request-headers']||'authorization,content-type,x-client-version,x-capy-client,x-capy-client-features');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,PUT,DELETE,OPTIONS');if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
 const reply=(status,body)=>{log(req.method,url,status);if(status===204||status===304){res.writeHead(status);res.end();return;}res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
 if(url.pathname==='/health')return reply(200,{ok:true,application:'swan-capy-local',protocolVersion:1,pid:process.pid,mode:'local-only',modelFallback:false,realtimeClients:realtime?.clients.size||0,authenticatedClients:[...realtime?.clients||[]].filter(ws=>ws.swanAuthenticated).length});
 const internalSession=runtime.engine.tokens.get(req.headers['x-swan-token']);
 if(url.pathname!=='/internal/tool'&&req.headers.authorization!==`Bearer ${key}`)return reply(401,{_tag:'Unauthorized',message:'Local session required'});
 let body={};try{let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2e6)throw Error('Request too large');}if(raw)body=JSON.parse(raw);}catch{return reply(400,{error:'Invalid request'});}
 if(url.pathname==='/local/shutdown'&&req.method==='POST'){reply(202,{stopping:true});setImmediate(()=>shutdown().catch(error=>console.error('Local shutdown failed:',error.message)));return;}
 if(url.pathname==='/internal/tool'){if(!internalSession||body.sessionId!==internalSession)return reply(403,{error:'Invalid worker capability'});try{return reply(200,await runtime.engine.tool(internalSession,body.name,body.args));}catch(e){return reply(400,{error:e.message});}}
 try{const routed=await runtime.route(req.method,url,body);if(routed){if(routed.ndjson){log(req.method,url,200);res.writeHead(200,{'content-type':'application/x-ndjson'});res.end(routed.ndjson.map(x=>JSON.stringify(x)).join('\n')+'\n');return;}return reply(routed.status,routed.body);}}catch(e){console.error(e.message);return reply(400,{_tag:'LocalAdapterError',message:e.message});}
 if(url.pathname==='/me'){return reply(200,user);}
 if(url.pathname==='/me/preferences'&&['PATCH','PUT'].includes(req.method)){user={...user,preferences:{...user.preferences,...body},updatedAt:new Date().toISOString()};runtime.store.put('settings',{id:'profile',preferences:user.preferences});return reply(200,user);}
 if(url.pathname==='/organizations')return reply(200,[{...organization,defaultProjectId:runtime.store.get('settings','workspace')?.defaultProjectId||null}]);
 if(url.pathname===`/orgs/${orgId}`)return reply(200,{...organization,defaultProjectId:runtime.store.get('settings','workspace')?.defaultProjectId||null});
 if(url.pathname==='/me/invitations'||url.pathname==='/me/joinable-organizations')return reply(200,[]);
 if(req.method==='POST'&&url.pathname===`/orgs/${orgId}/threads`)return reply(200,emptyResponses.get('read /orgs/:orgId/threads'));
 if(req.method==='GET')for(const [name,value]of emptyResponses){const route=name.slice(name.indexOf(' ')+1),pattern='^'+route.replace(/:[A-Za-z]+/g,'[^/]+')+'$';if(new RegExp(pattern).test(url.pathname))return reply(200,value);}
 return reply(501,{_tag:'LocalCapabilityUnavailable',message:'Local adapter route not implemented',path:url.pathname});
});
realtime=new WebSocketServer({noServer:true,maxPayload:1024*1024});
server.on('upgrade',(req,socket,head)=>{const route=req.url?.split('?')[0];log('UPGRADE',new URL(req.url,'http://127.0.0.1:4790'),['/','/realtime'].includes(route)?101:404);if(!['/','/realtime'].includes(route)||(req.headers.origin&&req.headers.origin!=='capy://app')){socket.destroy();return;}realtime.handleUpgrade(req,socket,head,ws=>realtime.emit('connection',ws));});
realtime.on('connection',ws=>{
 let authenticated=false;
 const trace=detail=>fs.appendFileSync(path.join(data,'realtime.jsonl'),JSON.stringify({at:new Date().toISOString(),...detail})+'\n');
 trace({event:'connected'});
 const timeout=setTimeout(()=>{if(!authenticated)ws.close(1008,'Local authentication required');},10000);
 ws.on('close',(code,reason)=>{clearTimeout(timeout);trace({event:'closed',code,reason:reason.toString()});});
 ws.on('message',raw=>{try{
  const message=JSON.parse(raw);trace({event:'message',type:message.type,keys:Object.keys(message),...(message.type==='auth'?{validLocalToken:message.token===key}:{})});
  if(message.type==='ping'){ws.send(JSON.stringify({type:'pong',sentAt:message.sentAt,serverTime:Date.now()}));return;}
  if(message.type==='auth'){if(message.token!==key){ws.close(1008,'Invalid local session');return;}authenticated=true;ws.swanAuthenticated=true;clearTimeout(timeout);return;}
  if(!authenticated){ws.close(1008,'Local authentication required');return;}
  if(message.type==='subscribe')ws.send(JSON.stringify({type:'subscribed',scopes:message.scopes||[]}));
 }catch{ws.close(1003,'Invalid message');}});
});
server.listen(4790,'127.0.0.1',()=>{console.log('Swan local compatibility API: http://127.0.0.1:4790');reportScheduler.start();});

let closing=false;async function shutdown(){if(closing)return;closing=true;reportScheduler.stop();await runtime.engine.shutdown();for(const socket of realtime.clients)socket.close(1001,'Local runtime shutting down');server.close(()=>{runtime.store.close();process.exit(0);});}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
