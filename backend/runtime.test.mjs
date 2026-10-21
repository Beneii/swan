import test from 'node:test';
import assert from 'node:assert/strict';
import {CapyRuntime,eventId} from './runtime.mjs';
import {EventPage} from '../resources/app/out/main/local-client-schemas.mjs';
import {validate} from './contracts.mjs';
const messages=[
 {id:'fixture-user',sessionId:'fixture',role:'user',text:'Hello',clientKey:'fixture-send',createdAt:'2026-10-21T10:00:00.000Z'},
 {id:'fixture-answer',sessionId:'fixture',role:'assistant',text:'Recorded CLI answer',createdAt:'2026-10-21T10:00:02.000Z',usage:{input_tokens:2,output_tokens:4,cache_read_input_tokens:9,cache_creation_input_tokens:7}},
 {id:'other-thread',sessionId:'other',role:'assistant',text:'Private other thread',createdAt:'2026-10-21T10:00:03.000Z'}
];

test('a queued worker uses the original waiting state instead of appearing idle',()=>{const runtime=Object.assign(Object.create(CapyRuntime.prototype),{store:{list:()=>[],get:()=>({name:'Captain'})}});const row=runtime.card({id:'queued-worker',name:'Queued worker',role:'worker',runtime:'queued'});assert.equal(row.status,'waiting');});
test('CLI answer projects into the original renderer delivery and settlement protocol',()=>{
 const page=CapyRuntime.prototype.events.call({store:{list:()=>messages}},'fixture');
 assert.ok(validate(EventPage,page),'must decode using shipped Capy schema');
 assert.equal(page.items.length,3);
 const [input,assistant,settlement]=page.items;
 assert.equal(input.state,'answered');
 assert.equal(input.payload.clientKey,'fixture-send');
 assert.equal(assistant.payload.stopReason,'tool_use');
 const call=assistant.payload.blocks[0];
 assert.equal(call.toolName,'message_user');
 assert.deepEqual(call.args,{text:'Recorded CLI answer',state:'final',files:[]});
 assert.equal(settlement.kind,'tool_result');
 assert.equal(settlement.state,'committed');
 assert.equal(settlement.payload.toolCallId,call.toolCallId);
 assert.equal(settlement.payload.isError,false);
 assert.equal(assistant.payload.usage.outputTokens,4);
 assert.equal(assistant.payload.route.source,'oauth');
 assert.equal(new Set(page.items.map(x=>x.id)).size,3);
 for(const event of page.items)assert.match(event.id,/^[0-9A-HJKMNP-TV-Z]{26}$/);
});
test('admission identity survives reloading the ledger',()=>{
 assert.equal(eventId(messages[0]),eventId(JSON.parse(JSON.stringify(messages[0]))));
 assert.notEqual(eventId(messages[0]),eventId(messages[1]));
});

test('original local-checkout project requests are durable and retry-safe',async()=>{
 const projects=[];
 const runtime={store:{list:()=>projects,add:(_kind,p)=>{const value={...p,id:'project-fixture',createdAt:'2026-10-21T10:00:00.000Z',updatedAt:'2026-10-21T10:00:00.000Z'};projects.push(value);return value;}}};
 const url=new URL('http://127.0.0.1/orgs/org_swan_local/projects');
 const body={name:'Fixture',code:'FIX',repos:[],requestKey:'stable-request',checkout:{deviceId:'local-device',root:process.cwd()}};
 const first=await CapyRuntime.prototype.route.call(runtime,'POST',url,body);
 const retry=await CapyRuntime.prototype.route.call(runtime,'POST',url,body);
 assert.equal(first.status,200);
 assert.equal(first.body.id,retry.body.id);
 assert.equal(projects.length,1);
 assert.equal(first.body.name,'Fixture');
 assert.equal(first.body.code,'FIX');
 await assert.rejects(()=>CapyRuntime.prototype.route.call(runtime,'POST',url,{name:'Cloud-only',repos:[]}),/existing absolute local folder/);
 assert.equal(projects.length,1,'unsupported projects must not create unusable ledger records');
});

test('default project persistence returns the original empty success response',async()=>{
 const values=new Map([['project-one',{id:'project-one'}]]);const runtime={store:{get:(_kind,id)=>values.get(id),put:(_kind,value)=>values.set(value.id,value)},engine:{emit:()=>{}}};const url=new URL('http://localhost/orgs/org_swan_local/me/default-project');
 const response=await CapyRuntime.prototype.route.call(runtime,'PUT',url,{projectId:'project-one'});assert.equal(response.status,200);assert.equal(response.body,undefined);assert.equal(values.get('workspace').defaultProjectId,'project-one');await assert.rejects(()=>CapyRuntime.prototype.route.call(runtime,'PUT',url,{projectId:'missing'}),/Project not found/);
});
