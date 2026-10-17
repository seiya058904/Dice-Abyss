// Constructed boundary fixtures, not natural adventure progression or browser storage measurements.
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import * as E from '../src/engine.js';
import {MAX_ITEM_LEVEL,validEquipment,itemValue} from '../src/equipment.js';
import {validateSave,encodeSave,decodeSave} from '../src/storage.js';
const report={method:'Constructed valid Node engine states; serialized UTF-8 byte size and UTF-16 code-unit length. No browser quota/performance or natural progression claim.',environment:{node:process.version,platform:process.platform},cases:[]};
const check=(name,s)=>{
 assert(validateSave(s),name+' validates');
 const raw=encodeSave(s);assert.deepEqual(decodeSave(raw),s);
 const st=E.stats(s);for(const n of Object.values(st))if(typeof n==='number')assert(Number.isFinite(n)&&n>=0);
 report.cases.push({name,inventory:s.player.items.length,floor:s.floor,level:s.player.level,stats:st,encodedUtf8Bytes:Buffer.byteLength(raw,'utf8'),encodedUtf16CodeUnits:raw.length,roundTrip:true});
};
let s=E.newGame(314159);s.floor=200;s.player.gold=E.GOLD_CAP;
for(let i=s.player.items.length;i<10000;i++)s.player.items.push(E.makeItem(s,['weapon','armor','relic'][i%3],i%8));
check('10,000-item mixed-rarity inventory at gold cap',s);
s=E.newGame(271828);s.floor=1000000;s.player.level=1000000;s.player.items=[];
for(const [key,slot]of [['weapon','weapon'],['armor','armor'],['relic','relic'],['relic2','relic'],['relic3','relic']]){
 const i=E.makeItem(s,slot,7);i.level=MAX_ITEM_LEVEL;i.enhance=20;assert(validEquipment(i));assert(Number.isSafeInteger(itemValue(i)));s.player.items.push(i);s.player.equipped[key]=i.id;
}
s.player.hp=E.stats(s).maxHp;check('Level caps with five eternal +20 items',s);
s=E.transition(s,{type:'fate'});s=E.transition(s,{type:'enter'});s=E.transition(s,{type:'roll'});check('Real combat roll at floor 1,000,000 with capped constructed gear',s);
report.highLevelRoll={damage:s.lastRoll.total,hpDamage:s.lastRoll.hpDamage,phase:s.phase,retaliation:s.lastRoll.retaliation};
const path=process.argv[2]||'docs/v5/evidence/boundary-audit.json';mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
