// Independent constructed payout and animation-state audit. Usage: SOURCE OUTPUT_JSON
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(process.argv[2]),out=resolve(process.argv[3]);
const files=['src/engine.js','src/storage.js','src/encounters.js','src/encounter-tactics.js','src/views.js','src/boon-readout.js'];
const hashes=()=>Object.fromEntries(files.map(file=>[file,createHash('sha256').update(readFileSync(resolve(root,file))).digest('hex')]));
const sourceBefore=hashes();
const [E,S,C,T,V]=await Promise.all(['engine','storage','encounters','encounter-tactics','views'].map(name=>import(pathToFileURL(resolve(root,`src/${name}.js`)))));
const report={kind:'Independent read-only constructed boundary and transient-render audit; not browser or natural-play evidence.',sourceBefore,checks:0,bandit:[],animation:[]};
const ok=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);report.checks++;};
function scene(seed=1){
 let s=E.newGame(seed);s.runId='round21-independent-render';s.floor=80;s.player.level=11;s.player.talentPoints=3;s.player.xp=0;s.player.hp=E.stats(s).maxHp;s.fate=[3,4];
 s.route=['combat','combat','rest','combat','gold','boss'].map((type,i)=>({id:`f80r${i}`,type,done:false,quality:0}));s.phase='route';s=E.transition(s,{type:'enter'});
 Object.assign(s.enemy,{trait:'steady',hp:1e12,maxHp:1e12,shield:0,maxShield:0,attack:1,turns:0});delete s.enemy.mechanic;s.rng=7919;s.ward=0;
 assert(S.validateSave(s));return s;
}
for(const variant of [undefined,0,1])for(const turns of [0,1,2,3,4])for(const seed of [1,7919,104729]){
 const s=scene(seed);s.enemy.mechanic='bandit';s.enemy.turns=turns;s.enemy.encounterKey='bandit';if(variant!==undefined)s.enemy.variant=variant;else delete s.enemy.variant;
 s.enemy.hp=1;s.rng=seed;const control=structuredClone(s);delete control.enemy.mechanic;
 const a=E.transition(s,{type:'roll'}),b=E.transition(control,{type:'roll'}),factor=turns<(variant===1?2:3)?variant===1?3:2:1;
 ok(a.phase,'chest');ok(b.phase,'chest');ok(a.lastRoll.values,b.lastRoll.values);ok(a.rng,b.rng);ok(a.chest.gold,b.chest.gold*factor);
 ok(a.chest.item,b.chest.item);ok(T.encounterTactics(s.enemy,6).lines[1].effects.goldMultiplier,factor);
 report.bandit.push({variant:variant??'absent',completedRollsBefore:turns,seed,expectedGoldFactor:factor,actualGold:a.chest.gold,controlGold:b.chest.gold});
}
let first=E.transition(scene(),{type:'talent',id:'dawnCrit'}),preCritical;
for(let i=0;i<100;i++){const result=E.transition(first,{type:'roll'});if(result.lastRoll.critical){preCritical=first;break;}first=result;}
assert(preCritical);
const keys=html=>[...html.matchAll(/data-boon-key="([^"]+)"/g)].map(match=>match[1]);
const readyKeys=html=>[...html.matchAll(/data-ready-boon="([^"]+)"/g)].map(match=>match[1]);
const opportunityText=html=>html.match(/data-boon-key="firstCritLuck"[^>]*>.*?<strong>([^<]*)<\/strong>/)?.[1]??null;
for(const outcome of ['survive','kill','dead'])for(const carried of [0,5]){
 const s=structuredClone(preCritical);s.nextLuck=carried;
 // Carry changes dice odds; choose the first naturally advanced critical under
 // those odds before constructing the terminal HP derivative.
 let critInput=s;
 for(let i=0;i<100;i++){const n=E.transition(critInput,{type:'roll'});if(n.lastRoll.critical&&!critInput.enemy.firstCritUsed)break;critInput=n;assert(i<99);}
 if(outcome==='kill')critInput.enemy.hp=1;
 if(outcome==='dead'){critInput.player.hp=1;critInput.enemy.attack=1e12;critInput.ward=0;}
 const beforeRaw=S.encodeSave(critInput),after=E.transition(critInput,{type:'roll'});assert(after.lastRoll.critical);
 const afterRaw=S.encodeSave(after),preview=V.gameView(critInput,{view:'game',busy:false,rolling:false}),rolling=V.gameView(critInput,{view:'game',busy:true,rolling:true});
 ok(opportunityText(preview),'暴击时原始幸运 +5');ok(opportunityText(rolling),'暴击时原始幸运 +5');
 ok(readyKeys(preview).includes('firstCritLuck'),false);ok(readyKeys(rolling).includes('firstCritLuck'),false);
 const impactState={...after,phase:'combat'},impact=V.gameView(impactState,{view:'game',busy:true,rolling:false}),impactCenter=V.center(impactState,{view:'game',busy:true,rolling:false});
 ok(readyKeys(impactCenter),[]);ok(opportunityText(impact),outcome==='survive'?'本场已触发':null);
 const final=V.gameView(after,{view:'game',busy:false,rolling:false});ok(opportunityText(final),outcome==='survive'?'本场已触发':null);
 ok(after.phase,outcome==='survive'?'combat':outcome==='kill'?'chest':'dead');
 ok(S.encodeSave(critInput),beforeRaw);ok(S.encodeSave(after),afterRaw);ok(S.decodeSave(afterRaw),after);
 report.animation.push({outcome,carriedInput:carried,criticalTurn:after.enemy.turns,beforeKeys:keys(preview),rollingKeys:keys(rolling),impactKeys:keys(impact),finalKeys:keys(final),impactReadyKeys:readyKeys(impactCenter)});
}
const old='趁旅者停顿清点财物，前三击是夺回它的机会。';
for(const entry of [
 {mechanic:'bandit',variant:1,note:old,expected:'趁旅者停顿清点财物，前两击是夺回它的机会。'},
 {mechanic:'bandit',variant:0,note:old,expected:old},
 {mechanic:'bandit',variant:1,note:old+' 自写注释。',expected:old+' 自写注释。'},
 {mechanic:'bandit',variant:1,note:'自定义 <script>三击</script>',expected:'自定义 &lt;script&gt;三击&lt;/script&gt;'},
 {mechanic:'parity',variant:1,note:old,expected:old},
]){
 const s=scene();Object.assign(s.enemy,entry);delete s.enemy.expected;
 const before=S.encodeSave(s),html=V.center(s,{view:'game',busy:false,rolling:false}),shown=html.match(/class="enemy-note">(.*?)<\/p>/)?.[1];
 ok(shown,entry.expected);ok(S.encodeSave(s),before);ok(S.decodeSave(before).enemy.note,entry.note);
}
report.sourceAfter=hashes();ok(report.sourceAfter,sourceBefore,'Sources remained stable during the audit');report.status='PASS';
mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,checks:report.checks,banditActualPayoutCases:report.bandit.length,transientCases:report.animation.length,out},null,2));
