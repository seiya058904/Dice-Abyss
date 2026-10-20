// Replay portability: optional fourth argument supplies the comparison baseline. Probe assertions are unchanged.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

const root=path.resolve(process.argv[2]||'/workspace/scratch/d0f98f221ae6/work/Dice-Abyss');
const out=path.resolve(process.argv[3]||new URL('./integration-probe.json',import.meta.url).pathname);
const files=['src/views.js','src/app.js','src/boons.css','index.html','src/boon-readout.js','src/event-preview.js'];
const hash=s=>createHash('sha256').update(s).digest('hex');
const source=Object.fromEntries(await Promise.all(files.map(async file=>[file,await fs.readFile(path.join(root,file),'utf8')])));
const [E,S,V,B,C,F]=await Promise.all(['src/engine.js','src/storage.js','src/views.js','src/boon-readout.js','src/encounters.js','scripts/audit-event-context.mjs'].map(f=>import(pathToFileURL(path.join(root,f)))));
const freeze=o=>{if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.values(o).forEach(freeze);Object.freeze(o);}return o;};
const findings=[],checks=[];
function scene(key='spring',seed=170913){return F.eventFixture({E,S},key,{seed,floor:140,rich:true});}
function mystery(key){for(let seed=1;seed<300;seed++){const s=scene('mystery',seed);if(s.event.key===key)return s;}throw Error('unreachable test fixture');}
const states=[scene('spring'),scene('prayer'),mystery('hollow_scale'),mystery('silent_anvil'),scene('wardbank'),scene('echochamber'),scene('combat'),scene('duel')];
let renderedViews=0,transactions=0;
for(const state of states){
 state.blessing=4;state.eventPower=15;state.eventLuck=8;state.nextLuck=15;
 state.auditUnknown={text:'unknown fields kept',rows:[{n:17}]};
 if(state.enemy&&state.phase==='combat')state.enemy.openingEcho=.25;
 assert(S.validateSave(state));const before=S.encodeSave(state);
 const action=state.phase==='combat'?{type:'roll'}:{type:'event-choice',id:C.eventChoices(state).find(o=>o.id!=='leave'&&!o.disabled)?.id,confirmed:true};
 const expected=E.transition(state,action);freeze(state);
 for(const view of ['game','inventory','talents','codex'])for(const open of [false,true]){
  const ui={screen:'game',view,busy:false,rolling:false,boonDetails:open};
  const html=V.gameView(state,ui);assert.equal(typeof html,'string');assert(!html.includes('<script'));
  const boon=V.boonReadoutView(state,ui);assert(boon.includes('data-boon-details'));
  assert.equal(/data-boon-details open/.test(boon),open);
  assert.equal(S.encodeSave(state),before);renderedViews++;
 }
 for(let i=0;i<3;i++)B.boonReadout(state);
 assert.deepEqual(E.transition(state,action),expected);transactions++;
}
checks.push({name:'Frozen full game views and following transaction are unchanged',renderedViews,transactions});

const hostile=`\"><img src=x onerror=alert(1)> &'`;
for(const key of ['hollow_scale','silent_anvil']){
 const s=mystery(key);for(const item of s.player.items)item.name=hostile;
 assert(S.validateSave(s));const before=S.encodeSave(s),preview=V.eventChoicePreviewView(s,'accept');
 assert(preview.includes('&lt;img'));assert(!preview.includes('<img'));assert(!preview.includes('targetName='));
 const html=V.gameView(s,{view:'game',busy:false});assert(!html.includes('<img src=x'));assert.equal(S.encodeSave(s),before);
}
checks.push({name:'Imported target names remain text in preview and full event view',states:2,payload:hostile});

// Run the reviewed render() body unchanged with a minimal DOM model. This
// verifies its UI-state branches, not CSS layout, pixel scrolling or browser
// focus/HTML semantics. The final integrator supplies real browser checks.
const appSource=source['src/app.js'],start=appSource.indexOf('function render(options = {}) {'),end=appSource.indexOf('\nfunction sound(',start);
assert(start>=0&&end>start);const renderSource=appSource.slice(start,end);
const app={panel:null,details:null,querySelector(selector){return selector==='.route-panel'?this.panel:selector==='[data-boon-details]'?this.details:null;},set innerHTML(html){
 const panel=/data-model-route/.test(html),details=/data-model-boon/.test(html);
 this.panel=panel?{scrollTop:0}:null;this.details=details?{open:/data-model-open/.test(html)}:null;
},get innerHTML(){return '';}};
const context=vm.createContext({
 app,ui:{screen:'game',view:'game',boonDetails:false},state:{runId:'A',phase:'combat',hasBoons:true},visualState:null,boonRenderedRunId:null,inventoryRenderedRunId:null,
 settings:{scale:1,effects:'low'},visualPresentation:null,dialog:{open:false},sound(){},
 document:{documentElement:{style:{setProperty(){}},dataset:{}},activeElement:null},window:{scrollTo(){}},
 matchMedia:()=>({matches:false}),captureWorkbenchPosition:()=>({scroll:[]}),captureInventoryPosition:()=>null,captureTalentPosition:()=>null,
 fusion:{closeTooltip(){},reconcile(){},afterRender(){}},updateFusionDOM:()=>false,fusionView:()=>'',
 restoreWorkbenchPosition(){},restoreTalentPosition(){},restoreInventoryPosition(){},mountEffects:()=>null,saveRecoveryView:()=>'',titleView:()=>'',
 gameView(s,ui){return ui.view==='talents'||s.phase==='fusion'?'':`<section data-model-route>${s.hasBoons?`<details data-model-boon ${ui.boonDetails?'data-model-open':''}></details>`:''}</section>`;},
});
vm.runInContext(renderSource+'\nthis.callRender=render;',context);
const snap=label=>({label,runId:context.state.runId,uiDetails:context.ui.boonDetails,uiScroll:context.ui.boonScroll,domDetails:app.details?.open??null,scroll:app.panel?.scrollTop??null,renderedRunId:context.boonRenderedRunId});
const uiSequence=[];
context.callRender();uiSequence.push(snap('first A render'));
assert.equal(app.details.open,false);assert.equal(app.panel.scrollTop,0);
app.details.open=true;app.panel.scrollTop=180;context.callRender();uiSequence.push(snap('same A normal rerender'));
assert.equal(app.details.open,true);assert.equal(app.panel.scrollTop,180);
context.state={runId:'B',phase:'combat',hasBoons:true};context.callRender();uiSequence.push(snap('replace with B'));
assert.equal(app.details.open,false);assert.equal(app.panel.scrollTop,0);
app.details.open=true;app.panel.scrollTop=180;context.ui.view='talents';context.callRender();uiSequence.push(snap('B hidden route'));
context.ui.view='game';context.callRender();uiSequence.push(snap('B route returns'));
assert.equal(app.details.open,true);assert.equal(app.panel.scrollTop,180);
context.ui.screen='title';context.callRender();uiSequence.push(snap('B title'));
assert.equal(context.ui.boonScroll,180);assert.equal(app.panel,null);
context.ui.screen='game';context.callRender();uiSequence.push(snap('B title returns'));
assert.equal(app.details.open,true);assert.equal(app.panel.scrollTop,180);
context.ui.view='talents';context.callRender();context.state={runId:'C',phase:'combat',hasBoons:true};context.callRender();uiSequence.push(snap('replace by C while route hidden'));
assert.equal(context.ui.boonDetails,false);assert.equal(context.ui.boonScroll,0);
context.ui.view='game';context.callRender();uiSequence.push(snap('C route returns'));
assert.equal(app.details.open,false);assert.equal(app.panel.scrollTop,0);
checks.push({name:'Unchanged render() UI branch probe',scope:'Minimal DOM model, not browser/layout',rows:uiSequence});

// Independent lifecycle checks use the existing real transactions, including
// a free leave of a paid-reserve room, entry, death retry and floor departure.
const lifecycles=[];
for(const key of ['echochamber','wardbank']){
 let s=scene(key);const prior=S.encodeSave(s),price=s.event.costGold;
 V.gameView(s,{view:'game',busy:false});assert.equal(S.encodeSave(s),prior);
 s=E.transition(s,{type:'event-choice',id:'accept',confirmed:true});assert.equal(s.player.gold,JSON.parse(JSON.parse(prior).payload).player.gold-price);
 const reserveKey=key==='wardbank'?'ward':'echo';assert(B.boonReadout(s).groups.some(g=>g.entries.some(e=>e.key===reserveKey)));
 const beforeNext=s;V.gameView(s,{view:'game',busy:false});s=E.transition(s,{type:'next'});
 assert.deepEqual(s.v5Boons,{echo:0,ward:0});const atEntry=B.boonReadout(s);
 if(key==='echochamber')assert(atEntry.groups.some(g=>g.entries.some(e=>e.key==='openingEcho')));
 else assert(s.ward>=(beforeNext.ward||0));
 s.phase='dead';s.player.hp=0;s.nextLuck=15;s.blessing=4;s.eventPower=15;s.eventLuck=8;
 assert(S.validateSave(s));s=E.transition(s,{type:'retry'});assert.equal(s.nextLuck,0);assert.equal(s.enemy.openingEcho,0);
 assert.deepEqual(s.v5Boons,{echo:0,ward:0});assert.equal(s.blessing,4);assert.equal(s.eventPower,15);assert.equal(s.eventLuck,8);
 lifecycles.push({key,paid:true,reserveTransferred:true,retryDidNotReissue:true,floorBonusesRetained:true});
}
checks.push({name:'Independent paid reserve and retry lifecycle check',rows:lifecycles});

const baseline=path.resolve(process.argv[4]||path.resolve(root,'../../baseline/Dice-Abyss'));
const transactionFiles=['src/storage.js','src/engine.js','src/equipment.js','src/encounters.js','src/deep-rules.js'];
const transactionGuards=await Promise.all(transactionFiles.map(async file=>{
 const [before,after]=await Promise.all([fs.readFile(path.join(baseline,file)),fs.readFile(path.join(root,file))]);
 const baselineSha256=hash(before),workSha256=hash(after);assert.equal(workSha256,baselineSha256,`${file} changed relative to round16 baseline`);
 return {file,baselineSha256,workSha256,equal:true};
}));
checks.push({name:'Transaction and storage sources are byte-identical to round16 baseline',rows:transactionGuards});

const finish=Object.fromEntries(await Promise.all(files.map(async file=>[file,hash(await fs.readFile(path.join(root,file)))])));
const hashes=Object.fromEntries(Object.entries(source).map(([file,text])=>[file,hash(text)]));
const report={kind:'Round17 independent integration read-only review',at:new Date().toISOString(),node:process.version,root,sourceHashes:hashes,sourceStable:files.every(file=>hashes[file]===finish[file]),checks,findings,limits:'No browser, native storage, layout, pixel scrolling or assistive technology claims.'};
await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output:out,sourceStable:report.sourceStable,checks:checks.length,findings:findings.length,renderedViews,transactions},null,2));
