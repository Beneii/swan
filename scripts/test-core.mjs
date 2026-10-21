import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const seen=new Map();
function available(file,stack=new Set()){
 if(seen.has(file))return seen.get(file);
 if(!fs.existsSync(file))return false;
 if(stack.has(file))return true;
 const next=new Set(stack).add(file),source=fs.readFileSync(file,'utf8');
 const dependencies=[...source.matchAll(/(?:from\s*|import\s*\()['"]([^'"]+)['"]/g)].map(x=>x[1]).filter(x=>x.startsWith('.'));
 const ok=dependencies.every(x=>available(path.resolve(path.dirname(file),x),next));seen.set(file,ok);return ok;
}
const all=fs.readdirSync(path.join(root,'backend')).filter(x=>x.endsWith('.test.mjs'));
const tests=all.filter(x=>available(path.join(root,'backend',x)));
const excluded=all.filter(x=>!tests.includes(x));
console.log('Core test files:',tests.length,'; desktop-dependent test files excluded:',excluded.length);
console.log('Excluded (require local proprietary desktop contracts/fixtures):',excluded.join(', '));
if(!tests.length)throw Error('No self-contained core tests found');
const result=spawnSync(process.execPath,['--test',...tests.map(x=>path.join(root,'backend',x))],{stdio:'inherit',cwd:root});
process.exit(result.status??1);
