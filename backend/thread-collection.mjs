import {createHash} from 'node:crypto';
import {ownerId} from './ownership.mjs';
import {ThreadCollectionResponse} from '../resources/app/out/main/local-client-schemas.mjs';
import {validate} from './contracts.mjs';
const user='user_swan_local',model='claude-code/default';
const unsupported=['tagIds','pullRequestStates','slackChannelIds','automationIds'];
export function threadCollection(runtime,input){
 const pages=input.pages||[{key:'all'}];if(!Array.isArray(pages)||pages.length>8)throw Error('Use at most eight thread pages');
 const messages=runtime.store.list('message'),text=new Map();for(const message of messages)text.set(message.sessionId,(text.get(message.sessionId)||'')+'\n'+message.text);
 const search=String(input.search||'').trim().toLowerCase();
 let cards=runtime.store.list('session').filter(session=>{
  if(input.archived==='only'||input.deleted==='only'||unsupported.some(key=>input[key]?.length))return false;
  if(input.projectIds?.length&&!input.projectIds.includes(session.projectId))return false;
  if(input.captainIds?.length&&!input.captainIds.includes(ownerId(session)))return false;
  if(input.modelIds?.length&&!input.modelIds.includes(model))return false;
  if(input.origins?.length&&!input.origins.includes('web'))return false;
  if(input.userIds?.length&&!input.userIds.includes(user)||input.participantIds?.length&&!input.participantIds.includes(user))return false;
  return !search||[session.name,session.latest,text.get(session.id)].filter(Boolean).join('\n').toLowerCase().includes(search);
 }).map(session=>runtime.card(session));
 cards=cards.filter(card=>{
  if(input.statuses?.length&&!input.statuses.includes(card.status))return false;
  for(const [key,field,after]of [['createdAfter','createdAt',true],['createdBefore','createdAt',false],['activityAfter','sortActivityAt',true],['activityBefore','sortActivityAt',false]])if(input[key]){const bound=Date.parse(input[key]),value=Date.parse(card[field]);if(!Number.isFinite(bound))throw Error('Invalid thread date filter');if(after?value<bound:value>bound)return false;}
  return true;
 });
 const sortField=input.sort==='createdAt'?'createdAt':'sortActivityAt';
 const compare=(a,b)=>String(b[sortField]).localeCompare(String(a[sortField]))||a.id.localeCompare(b.id);cards.sort(compare);
 const filters=Object.fromEntries(['sort','search','projectIds','captainIds','modelIds','origins','userIds','participantIds','statuses','createdAfter','createdBefore','activityAfter','activityBefore','archived','deleted',...unsupported].map(key=>[key,input[key]??null]));
 const page=(request,source)=>{
  const limit=request.limit??50;if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Thread page limit must be 1 to 100');
  const signature=createHash('sha256').update(JSON.stringify({filters,group:request.group||null})).digest('hex').slice(0,12);
  let selected=source;
  if(request.cursor){let cursor;try{cursor=JSON.parse(Buffer.from(request.cursor,'base64url').toString());}catch{throw Error('Invalid thread cursor');}if(!Array.isArray(cursor)||cursor[0]!==signature||typeof cursor[1]!=='string'||typeof cursor[2]!=='string')throw Error('Thread cursor belongs to another filter');selected=source.filter(card=>compare(card,{id:cursor[1],[sortField]:cursor[2]})>0);}
  const items=selected.slice(0,limit),last=items.at(-1);return {items,cursor:selected.length>limit?Buffer.from(JSON.stringify([signature,last.id,last[sortField]])).toString('base64url'):null};
 };
 const grouped=(source,group)=>{if(!group)return source;if(group.by==='project')return source.filter(card=>(card.projectId||null)===group.key);if(group.by==='author')return group.key===user?source:[];throw Error('Unsupported thread grouping');};
 const result={pages:pages.map(request=>{if(!request||typeof request.key!=='string')throw Error('Thread page key is required');return {key:request.key,...page(request,grouped(cards,request.group))};}),groups:null,counts:input.counts?{pinned:0,folders:[]}:null,folders:input.folders?[]:null,channels:input.channels?[]:null};
 if(input.groups){const by=input.groups.by;if(!['project','author'].includes(by))throw Error('Unsupported thread grouping');const keys=[...new Set(cards.map(card=>by==='project'?card.projectId||null:user))];result.groups=keys.slice(0,input.groups.limit||50).map(key=>{const source=grouped(cards,{by,key});return {key,count:source.length,...page({group:{by,key}},source)};});}
 if(!validate(ThreadCollectionResponse,result))throw Error('Original thread collection response rejected local state');
 return {status:200,body:result};
}
