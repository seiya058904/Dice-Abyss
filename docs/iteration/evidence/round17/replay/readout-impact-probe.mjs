import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const root=path.resolve(process.argv[2]||'/workspace/scratch/d0f98f221ae6/work/Dice-Abyss');
const out=path.resolve(process.argv[3]||new URL('./readout-impact-current.json',import.meta.url).pathname);
const [E,S,V,F]=await Promise.all(['src/engine.js','src/storage.js','src/views.js','scripts/audit-event-context.mjs'].map(file=>import(pathToFileURL(path.join(root,file)))));
const hashes=Object.fromEntries(await Promise.all(['src/app.js','src/views.js','src/boon-readout.js'].map(async file=>[file,createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex')])));
const rows=[];
for(const kill of [true,false]){
 const before=F.eventFixture({E,S},'combat',{seed:7919,floor:140,rich:true});
 before.player.talents.dawnCrit=3;before.nextLuck=0;before.rng=7;
 before.enemy.shield=0;before.enemy.hp=kill?1:before.enemy.maxHp;
 assert(S.validateSave(before));const encoded=S.encodeSave(before),after=E.transition(before,{type:'roll'});
 assert.equal(after.lastRoll.critical,true);assert.equal(after.nextLuck,15);
 assert.equal(after.lastRoll.luck,0);assert.equal(after.lastRoll.killed,kill);
 assert(S.validateSave(after));const afterEncoded=S.encodeSave(after);
 const impact=V.center({...after,phase:'combat'},{view:'game',busy:true,rolling:false,event:'roll'});
 const marker=impact.match(/<p data-ready-boon="nextLuck">[\s\S]*?<\/p>/)?.[0]||'';
 const ready=structuredClone(before);ready.nextLuck=15;
 const idle=V.center(ready,{view:'game',busy:false,rolling:false});
 const rolling=V.center(ready,{view:'game',busy:true,rolling:true});
 assert.equal(S.encodeSave(before),encoded);assert.equal(S.encodeSave(after),afterEncoded);
 rows.push({kill,rng:before.rng,beforeNextLuck:before.nextLuck,lastRollLuck:after.lastRoll.luck,afterNextLuck:after.nextLuck,phase:after.phase,impactMarker:marker,impactHidden:!marker,idleSaysNext:/data-ready-boon="nextLuck">[\s\S]*?<small>下一掷生效<\/small>/.test(idle),rollingSaysCurrent:/data-ready-boon="nextLuck">[\s\S]*?<small>本掷生效<\/small>/.test(rolling)});
}
const passed=rows.every(row=>row.impactHidden&&row.idleSaysNext&&row.rollingSaysCurrent);
const result={at:new Date().toISOString(),root,hashes,kind:'First critical impact-stage read-only integration reproduction',scope:'Real existing transitions with validator-accepted controlled enemy hp; exact app impact render input; no browser or storage write.',passed,rows};
await fs.writeFile(out,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({output:out,passed,rows:rows.map(({impactMarker,...row})=>row)},null,2));
if(!passed)process.exitCode=1;
