import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
export const statuses=['Inbox','Ready','Working','Blocked','Needs me','Ready for review','Done'];
export class Store {
 constructor(dir){if(dir!==':memory:')mkdirSync(dir,{recursive:true});this.db=new DatabaseSync(dir===':memory:'?':memory:':path.join(dir,'swan.db'));this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records(kind TEXT,id TEXT,data TEXT, PRIMARY KEY(kind,id));');}
 list(kind){return this.db.prepare('SELECT data FROM records WHERE kind=? ORDER BY rowid').all(kind).map(x=>JSON.parse(x.data));}
 get(kind,id){const r=this.db.prepare('SELECT data FROM records WHERE kind=? AND id=?').get(kind,id);return r?JSON.parse(r.data):null;}
 put(kind,value){const v={...value,updatedAt:new Date().toISOString()};this.db.prepare('INSERT INTO records VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data').run(kind,v.id,JSON.stringify(v));return v;}
 add(kind,value){return this.put(kind,{id:randomUUID(),createdAt:new Date().toISOString(),...value});}
 patch(kind,id,changes){const v=this.get(kind,id);if(!v)throw Error(`${kind} not found`);return this.put(kind,{...v,...changes,id});}
 event(type,data){return this.add('event',{type,...data});}
 transaction(action){this.db.exec('BEGIN IMMEDIATE');try{const result=action();this.db.exec('COMMIT');return result;}catch(error){this.db.exec('ROLLBACK');throw error;}}
 close(){this.db.close();}
}
