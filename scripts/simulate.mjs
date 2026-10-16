import { TALENTS } from '../src/content.js';
import { pathToFileURL } from 'node:url';
import { newGame, transition, itemValue, stats, forgeCost, canAct, compareEquipment, equippedIds, fusionPreview, enemyIntent } from '../src/engine.js';
import { validateSave, encodeSave, decodeSave } from '../src/storage.js';
import {eventChoices} from '../src/encounters.js';

// Automatic decisions are an offline test policy only; the product still requires every roll.
export function runAdventure(seed, { shop = true, talents = true, validate = false, observe, floors=10, build='balanced', fusion=false, purchases='expected',events='safe' } = {}) {
  let s = newGame(seed), steps = 0;
  const rounds = { combat: [], elite: [], boss: [], trial:[] }, rarities = [0, 0, 0, 0], routeTypes = new Set();
  let lastRoom = '', forges = 0, buys = 0, fusions=0, spent=0, fight=null,gearSignature='';
  const spending={shop:0,forge:0,fusion:0};
  const encounters=[],attempts=[],floorEnds=[];
  const finish = () => ({seed,completed:s.phase==='cleared'&&s.floor>=floors,deaths:s.counters.deaths,rolls:s.counters.rolls,level:s.player.level,rounds,rarities,routeTypes:[...routeTypes],forges,buys,fusions,spent,spending,encounters,attempts,floorEnds,s});
  while (!(s.phase==='cleared'&&s.floor>=floors) && steps++ < floors*400) {
    observe?.(s);
    if (validate && !validateSave(s)) throw new Error(`Invalid state: ${seed} / ${s.phase}`);
    if (talents && s.player.talentPoints) {
      const priority=build==='luck'?['luck','attune','resonance','critical','vitality','high','pair','guard','recovery','omen','mercy','jackpot','spark',...Object.keys(TALENTS).filter(k=>!['power','vitality'].includes(k)),'power']:build==='balanced'?['resonance','critical','vitality','high','guard','pair','recovery','six','slayer','sum','leech','smith','luck','attune',...Object.keys(TALENTS).filter(k=>!['power','vitality'].includes(k)),'power']:['resonance','critical','high',...Object.keys(TALENTS)];
      const target = priority.find(k => (s.player.talents[k]||0) < (k==='vitality'&&build!=='legacy'?5:TALENTS[k].cap));
      if (target) s = transition(s, { type: 'talent', id: target });
    }
    const signature=s.player.items.map(i=>`${i.id}:${i.level}:${i.levelXp}:${i.enhance}`).join('|')+'/'+s.player.level+'/'+Object.values(s.player.talents).join(',');
    if(signature!==gearSignature)for(const slot of ['weapon','armor','relic']) {
      const candidates=s.player.items.filter(i=>i.slot===slot).map(item=>({item,delta:compareEquipment(s,item).delta})).toSorted((a,b)=>b.delta-a.delta);
      for(const {item}of candidates.slice(0,slot==='relic'?3:1)) if(!equippedIds(s).includes(item.id)&&compareEquipment(s,item).delta>0) s=transition(s,{type:'equip',id:item.id});
    }
    gearSignature=signature;
    const room = s.route[s.roomIndex]; if (room) routeTypes.add(room.type);
    if (room?.id !== lastRoom) { lastRoom = room?.id; fight=null; }
    const goldBefore=s.player.gold;
    switch (s.phase) {
      case 'fate': s = transition(s, { type: 'fate' }); break;
      case 'route': s = transition(s, { type: 'enter' }); break;
      case 'combat': {
        fight ||= {floor:s.floor,roomType:room.type,type:s.enemy.type,name:s.enemy.name,trait:s.enemy.trait,mechanic:s.enemy.mechanic||null,turns:0,damageTaken:0,phaseChanges:0,heavyAttacks:0,traitActivations:0,startHp:s.player.hp,maxHp:stats(s).maxHp};
        const intent=enemyIntent(s);
        const type = s.enemy.type;
        s = transition(s, { type: 'roll' });
        fight.turns++;fight.damageTaken+=s.lastRoll.retaliation;fight.phaseChanges+=Number(s.lastRoll.phaseChanged||false);fight.heavyAttacks+=Number(intent.warning&&!s.lastRoll.killed);
        const e=s.enemy,r=s.lastRoll;
        const triggered=e.trait==='shield'?r.absorbed>0:!r.killed&&(e.trait==='rage'?e.hp<=e.maxHp/2:e.trait==='pulse'||e.trait==='ward'?e.turns%3===0:e.trait==='drain'?true:e.trait==='ramp'?e.turns>1:false);
        fight.traitActivations+=Number(triggered||r.mechanics?.length>0);
        if (s.phase === 'chest'||s.phase==='dead') {
          const sample={...fight,killed:s.phase==='chest',endHp:s.player.hp};attempts.push(sample);
          if(s.phase==='chest'){rounds[type].push(s.enemy.turns);encounters.push(sample);}fight=null;
        }
        break;
      }
      case 'chest': rarities[s.chest.item.rarity]++; s = transition(s, { type: 'open' }); break;
      case 'loot': s = transition(s, { type: 'next' }); break;
      case 'gold': s = transition(s, { type: 'gold' }); break;
      case 'blackmarket': case 'merchant':
        if (shop) {
          for (const offer of s.shop.filter(o => o.item).toSorted((a, b) => b.item.rarity - a.item.rarity)) {
            const current=s.player.items.find(i=>i.id===s.player.equipped[offer.item.slot]);
            const upgrade=purchases==='expected'?compareEquipment(s,offer.item).delta>5:itemValue(offer.item)>itemValue(current)*1.1;
            if (upgrade && canAct(s, { type: 'buy', id: offer.id })) { s = transition(s, { type: 'buy', id: offer.id }); buys++; }
          }
          if (s.player.hp < stats(s).maxHp * .5) s = transition(s, { type: 'buy', id: 'heal' });
        }
        spending.shop+=Math.max(0,goldBefore-s.player.gold);s = transition(s, { type: 'next' }); break;
      case 'forge': {
        const weapon = s.player.items.find(i => i.id === s.player.equipped.weapon);
        if (shop && s.player.gold > forgeCost(s, weapon) + 80 && weapon.enhance < 9) { s = transition(s, { type: 'forge', id: weapon.id }); forges++; }
        spending.forge+=Math.max(0,goldBefore-s.player.gold);s = transition(s, { type: 'next' }); break;
      }
      case 'dead': if (s.counters.deaths > 20) return finish(); s = transition(s, { type: 'retry' }); break;
      case 'fusion': {
        if(fusion&&shop)for(const slot of ['weapon','armor','relic']){
          const targets=s.player.items.filter(i=>equippedIds(s).includes(i.id)&&i.slot===slot).map(i=>i.id);
          const minimum=Math.min(...s.player.items.filter(i=>targets.includes(i.id)).map(i=>i.rarity));
          const materials=s.player.items.filter(i=>i.slot===slot&&!equippedIds(s).includes(i.id)&&!i.locked&&i.rarity<3&&i.rarity<=minimum).map(i=>i.id);
          const preview=fusionPreview(s,targets,materials);
          if(preview&&canAct(s,{type:'fuse',targets,materials})){s=transition(s,{type:'fuse',targets,materials});fusions++;}
        }
        spending.fusion+=Math.max(0,goldBefore-s.player.gold);s=transition(s,{type:'next'});break;
      }
      case 'altar': s=transition(s,{type:'bless'});s=transition(s,{type:'next'});break;
      case 'rest': s=transition(s,{type:'rest'});s=transition(s,{type:'next'});break;
      case 'event': {
        if(s.event.status==='resolved'){s=transition(s,{type:'next'});break;}
        const choices=eventChoices(s).filter(o=>!o.disabled),choice=events==='adventurous'?choices.find(o=>o.id!=='leave'):choices.find(o=>!o.confirm&&o.id!=='leave');
        s=transition(s,{type:'event-choice',id:choice?.id||'leave',confirmed:!!choice?.confirm});break;
      }
      case 'cleared': floorEnds.push({floor:s.floor,gold:s.player.gold,level:s.player.level,hp:s.player.hp,maxHp:stats(s).maxHp,attack:stats(s).attack}); s = transition(s, { type: 'descend' }); break;
      default: throw new Error(s.phase);
    }
    spent+=Math.max(0,goldBefore-s.player.gold);
    // Exercise actual serialized persistence repeatedly throughout the adventure.
    if (validate && steps % 7 === 0) s = decodeSave(encodeSave(s));
  }
  floorEnds.push({floor:s.floor,gold:s.player.gold,level:s.player.level,hp:s.player.hp,maxHp:stats(s).maxHp,attack:stats(s).attack});
  return finish();
}

export function simulate(count = 500) {
  const results = Array.from({ length: count }, (_, i) => runAdventure((i + 1) * 7919, { validate: i < 20 }));
  const summarize = xs => {
    if(!xs.length)return null;
    const sorted=xs.toSorted((a,b)=>a-b);
    return {min:sorted[0],median:sorted[Math.floor(sorted.length/2)],p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1),mean:+(xs.reduce((a,b)=>a+b,0)/xs.length).toFixed(2)};
  };
  const summary = {
    seeds: count, completed: results.filter(r => r.completed).length,
    failures: results.filter(r => !r.completed).map(r => ({ seed: r.seed, floor: r.s.floor, phase: r.s.phase })),
    deaths: summarize(results.map(r => r.s.counters.deaths)),
    combatRounds: Object.fromEntries(['combat', 'elite', 'boss','trial'].map(type => [type, summarize(results.flatMap(r => r.rounds[type]))])),
    byFloor:Object.fromEntries(Array.from({length:10},(_,i)=>[i+1,Object.fromEntries(['combat','elite','boss','trial'].map(type=>[type,summarize(results.flatMap(r=>r.encounters).filter(e=>e.floor===i+1&&e.type===type).map(e=>e.turns))]))])),
    bossPhases:results.flatMap(r=>r.attempts).filter(e=>e.type==='boss').reduce((n,e)=>n+e.phaseChanges,0),
    heavyAttacks:results.flatMap(r=>r.attempts).reduce((n,e)=>n+e.heavyAttacks,0),
    economy:{gold:summarize(results.map(r=>r.s.player.gold)),spent:summarize(results.map(r=>r.spent)),buys:summarize(results.map(r=>r.buys)),forges:summarize(results.map(r=>r.forges))},
    totalRolls: summarize(results.map(r => r.s.counters.rolls)),
    rarities: results.reduce((acc, r) => acc.map((v, i) => v + r.rarities[i]), [0, 0, 0, 0]),
    finalLevel: summarize(results.map(r => r.s.player.level)),
    noShopping: Array.from({ length: 50 }, (_, i) => runAdventure((i + 11) * 104729, { shop: false })).map(r => ({ seed: r.seed, complete: r.completed, deaths: r.s.counters.deaths })),
  };
  return summary;
}

export function auditEconomy(count=30,floors=100){
 const summary=xs=>{
  const sorted=xs.toSorted((a,b)=>a-b);
  return xs.length?{median:sorted[Math.floor(xs.length/2)],p95:sorted[Math.floor(xs.length*.95)],mean:+(xs.reduce((n,x)=>n+x,0)/xs.length).toFixed(2),min:sorted[0],max:sorted.at(-1)}:null;
 };
 const policy={floors,build:'balanced',purchases:'expected'};
 return Object.fromEntries([false,true].map(fusion=>{
  const runs=Array.from({length:count},(_,i)=>runAdventure((i+1)*7919,{...policy,fusion,validate:i<2}));
  const bosses=runs.flatMap(r=>r.encounters.filter(e=>e.type==='boss'&&e.floor>floors*.7));
  const byBoss=Object.fromEntries([...new Set(bosses.map(e=>e.trait))].map(trait=>{
   const sample=bosses.filter(e=>e.trait===trait);
   return [trait,{name:sample[0].name,encounters:sample.length,rounds:summary(sample.map(e=>e.turns)),twoRollRate:+(sample.filter(e=>e.turns===2).length/sample.length).toFixed(3),traitTriggerRate:+(sample.filter(e=>e.traitActivations>0).length/sample.length).toFixed(3)}];
  }));
  return [fusion?'fusion':'noFusion',{policy:{...policy,fusion},seeds:count,completed:runs.filter(r=>r.completed).length,deaths:summary(runs.map(r=>r.deaths)),gold:summary(runs.map(r=>r.s.player.gold)),spending:Object.fromEntries(['shop','forge','fusion'].map(k=>[k,summary(runs.map(r=>r.spending[k]))])),equippedLevel:summary(runs.flatMap(r=>r.s.player.items.filter(i=>equippedIds(r.s).includes(i.id)).map(i=>i.level))),bosses:byBoss,runs:runs.map(r=>({seed:r.seed,completed:r.completed,gold:r.s.player.gold,spending:r.spending,deaths:r.deaths,fusions:r.fusions,lateBosses:r.encounters.filter(e=>e.type==='boss'&&e.floor>floors*.7)}))}];
 }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const summary = process.argv[2]==='--economy'?auditEconomy(Number(process.argv[3]||30),Number(process.argv[4]||100)):simulate(Number(process.argv[2] || 500));
  console.log(JSON.stringify(summary, null, 2));
  if (process.argv[2]==='--economy'?Object.values(summary).some(r=>r.completed!==r.seeds):summary.completed !== summary.seeds) process.exitCode = 1;
}
