import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LocalDesktop} from '../resources/app/out/main/swan-local-desktop.mjs';
const fixtureRoot=fileURLToPath(new URL('../pilot/setup-002',import.meta.url));
function fixture(){const bridge=new LocalDesktop('unused');const selected=[];bridge.request=async(method='GET',body)=>{if(method==='POST')selected.push(body.root);return {lastPicked:selected.at(-1)||null,roots:[fixtureRoot,...selected]};};return {bridge,selected};}
test('native folder selection records a canonical root without modifying files',async()=>{const {bridge,selected}=fixture();const result=await bridge.link(fixtureRoot,{picked:true});assert.equal(result.linked.root,fixtureRoot);assert.deepEqual(result.linked.repos,[]);assert.equal(selected.length,1);const state=await bridge.state();assert.equal(state.state.orgs[0].entry.deviceId,'swan-local-device');assert.equal(await bridge.lastPicked(),fixtureRoot);});
test('folder browsing stays inside authorized roots and omits symlink traversal',async()=>{const {bridge}=fixture();assert.equal(bridge.within('C:\\root','C:\\root-other'),false);assert.equal(bridge.within('C:\\root','C:\\root\\child'),true);const result=await bridge.browse(fixtureRoot);assert.ok(Array.isArray(result.entries));assert.equal((await bridge.browse('Z:/swan-nonexistent-fixture')).refused,true);});

test('managed worker worktrees cannot be linked as new base projects',async()=>{const {bridge}=fixture();bridge.request=async()=>({roots:[fixtureRoot],managedRoots:[fixtureRoot]});const result=await bridge.link(fixtureRoot,{picked:true});assert.equal(result.refused,'not-linkable');assert.match(result.message,/base repository/);});
