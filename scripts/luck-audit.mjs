// Controlled valid V5 builds. This audits the real dice generator, not a UI animation.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {newGame,stats,makeItem,drawDice,diceOdds,generateRoute,itemStats} from '../src/engine.js';
import {CATALOG} from '../src/content.js';
import {validateSave,encodeSave,decodeSave} from '../src/storage.js';
const results=[];
for(const target of [0,20,45,100,'extreme']){
 const s=newGame(7919);s.floor=200;s.player.level=70;
 for(const i of s.player.items){i.legacy=true;delete i.theme;delete i.catalogId;}
 if(target!==0)s.player.talents.luck=5;
 if(target===45||target===100||target==='extreme'){s.eventLuck=20;s.player.fateBlessings=5;}
 if(target===100||target==='extreme'){
  for(let n=0;n<3;n++){
   const rarity=target===100?3:7,item=makeItem(s,'relic',rarity);
   const entry=target===100?CATALOG.relic.find(c=>c.id==='v4-relic-0-3-3'):CATALOG.relic.filter(c=>c.rarity===7).toSorted((a,b)=>(b.effects.luck||0)-(a.effects.luck||0))[0];
   Object.assign(item,{catalogId:entry.id,profile:entry.profile,theme:entry.theme,name:entry.name});s.player.items.push(item);s.player.equipped[['relic','relic2','relic3'][n]]=item.id;
  }
  s.player.talents.omen=5;s.player.talents.attune=target==='extreme'?5:0;s.fate=[6,6];s.route=generateRoute(s,s.fate);s.phase='route';
  if(target===100)s.eventLuck-=stats(s).rawLuck-100;else s.nextLuck=24;
 }
 s.player.hp=stats(s).maxHp;s.rng=7654321;assert(validateSave(s));if(typeof target==='number')assert.equal(stats(s).luck,target);else assert(stats(s).luck>100&&stats(s).luck<=200);
 const odds=diceOdds(s),faces=Array(6).fill(0);let pairs=0,triples=0,echoes=0,high=0,total=0;const samples=200000;
 for(let n=0;n<samples;n++){const draw=drawDice(s,6),v=draw.values;echoes+=draw.echoes;for(const face of v){faces[face-1]++;total++;high+=Number(face>=5);}const best=Math.max(...v.map(face=>v.filter(x=>x===face).length));pairs+=Number(best>=2);triples+=Number(best>=3);}
 const clone=decodeSave(encodeSave(s));assert.deepEqual(drawDice(s,6),drawDice(clone,6));assert(faces.every(n=>n>0));assert(high/total<.75);
 const st=stats(s);results.push({target,rawLuck:st.rawLuck,effectiveLuck:st.luck,overflowGold:Math.min(.5,st.luckOverflow*.002),samples,dicePerRoll:6,odds,faces,highRate:high/total,pairRate:pairs/samples,tripleRate:triples/samples,echoes,replaySame:true});
}
const report={version:5,method:'Five constructed valid loadouts; 1000000 actual drawDice calls / 6000000 faces. 100 is an exact raw-luck fixture, extreme uses three highest-luck eternal relics, max luck/omen/attune, floor bonus and a committed next-roll +24 bonus. Each statistical sample holds the build fixed; this is not a natural adventure. Adjacent-face echo affects distribution.',results};
fs.writeFileSync(process.argv[2]||'luck-audit.json',JSON.stringify(report,null,2));console.log(results.map(r=>({target:r.target,luck:r.effectiveLuck,high:r.highRate,triple:r.tripleRate})));
