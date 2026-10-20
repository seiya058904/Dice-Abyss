import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import * as E from '../../baseline/Dice-Abyss/src/engine.js';
import {encodeSave,decodeSave,validateSave} from '../../baseline/Dice-Abyss/src/storage.js';
import {eventChoices} from '../../baseline/Dice-Abyss/src/encounters.js';

const root=new URL('./',import.meta.url);
const output={kind:'Constructed read-only baseline audit; not a natural run or balance result',baselineVersion:'5.19.0'};

let s=E.newGame(1);s.floor=80;s.player.level=11;s.player.talentPoints=1;s.player.xp=0;
s.player.hp=E.stats(s).maxHp;s.fate=[3,4];
s.route=['combat','combat','rest','combat','gold','boss'].map((type,i)=>({id:`f80r${i}`,type,done:false,quality:0}));
s.phase='route';s=E.transition(s,{type:'enter'});
Object.assign(s.enemy,{trait:'steady',hp:1e12,maxHp:1e12,shield:0,maxShield:0,attack:1,turns:0});
delete s.enemy.mechanic;s.rng=7919;
assert(validateSave(s));
let first;
for(let tries=0;tries<100;tries++){
 s=E.transition(s,{type:'roll'});
 if(s.lastRoll.critical){first=structuredClone(s);break;}
}
assert(first);assert.equal(E.stats(first).firstCritLuck,0);assert(!first.enemy.firstCritUsed);
assert.deepEqual(decodeSave(encodeSave(first)),first);
const invested=E.transition(first,{type:'talent',id:'dawnCrit'});
assert.notEqual(invested,first);assert.equal(invested.player.talents.dawnCrit,1);
s=invested;let second;
for(let tries=0;tries<100;tries++){
 s=E.transition(s,{type:'roll'});
 if(s.lastRoll.critical){second=structuredClone(s);break;}
}
assert(second);assert.equal(second.nextLuck,5);assert(second.enemy.firstCritUsed);
assert.deepEqual(decodeSave(encodeSave(second)),second);
output.firstCritAmbiguity={
 description:'A critical hit before owning the boon does not mark firstCritUsed. Investing dawnCrit afterward allows a later critical to grant +5 nextLuck.',
 firstCritical:{turn:first.enemy.turns,values:first.lastRoll.values,critical:first.lastRoll.critical,nextLuck:first.nextLuck,firstCritUsed:first.enemy.firstCritUsed??null},
 investedAtTurn:invested.enemy.turns,
 laterCritical:{turn:second.enemy.turns,values:second.lastRoll.values,critical:second.lastRoll.critical,nextLuck:second.nextLuck,firstCritUsed:second.enemy.firstCritUsed},
 saveRoundTrips:2,
 classification:'Semantic ambiguity only; do not change combat rules without establishing intended first eligible critical behavior.'
};

const scenarios=[];
for(const investedLuck of [0,5]){
 const x=E.newGame(100);x.floor=140;x.player.level=11;x.player.equipped={weapon:null,armor:null,relic:null,relic2:null,relic3:null};x.player.talents.luck=investedLuck;x.eventLuck=investedLuck?20:0;x.player.fateBlessings=investedLuck?5:0;
 const odds=E.diceOdds(x),f=odds.faces,gambit={halfRefund:f[0]+f[1],rareFloor:f[2]+f[3],epicFloor:f[4]+f[5]},wishing={halfRefund:0,epicFloor:0,legendaryFloor:0};
 for(let a=1;a<=6;a++)for(let b=1;b<=6;b++)wishing[a+b<=5?'halfRefund':a+b<=9?'epicFloor':'legendaryFloor']+=f[a-1]*f[b-1];
 const ignoredEcho=odds.echoChance;
 scenarios.push({effectiveLuck:odds.luck,faceProbabilities:f,gambit,wishing,ignoredEchoChance:ignoredEcho,explanation:'Both wishing dice are independently drawn by two calls to die -> drawDice(count=1); same-roll follow-face echo is not used by that event.'});
}
output.gamblingPreviewOpportunity={classification:'Missing decision aid, not a probability defect',scenarios};
writeFileSync(new URL('candidate-evidence.json',root),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output,null,2));
