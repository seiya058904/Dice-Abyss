import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Reproducible synthetic, validator-accepted event snapshots. This is not a
// natural playthrough, a browser audit, or an exhaustive random-outcome sweep.
const packageRoot=fileURLToPath(new URL('../',import.meta.url));
const sha=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export async function loadEventApi(root=packageRoot){
  const uri=file=>pathToFileURL(resolve(root,file));
  const [E,S,C,D,V]=await Promise.all(['src/engine.js','src/storage.js','src/encounters.js','src/deep-content.js','src/views.js'].map(file=>import(uri(file))));
  return {E,S,C,D,V,root:resolve(root)};
}
export function eventFixture(api,type='offering',{seed=7919,floor=80,rich=false,spares=true,beforeEnter}={}){
  const {E,S}=api;let s=E.newGame(seed);s.runId=`event-context-${seed}`;s.floor=floor;s.player.level=rich?100:20;s.player.xp=0;
  if(spares){
    for(const [slot,rarity]of [['relic',1],['relic',1],['armor',3]])s.player.items.push(E.makeItem(s,slot,rarity));
  }
  if(rich){s.player.gold=10000000;s.player.talentPoints=2;s.player.talents.power=1;if(spares)s.player.items[3].enhance=5;}
  s.player.hp=E.stats(s).maxHp;s.fate=[3,4];s.phase='route';s.roomIndex=0;
  s.route=[type,'combat','rest','combat','gold','boss'].map((type,i)=>({id:`f${floor}r${i}`,type,done:false,quality:0}));
  if(beforeEnter)s=beforeEnter(s)||s;
  assert(S.validateSave(s),`${type} pre-entry fixture must be valid`);
  const entered=E.transition(s,{type:'enter'});assert.notStrictEqual(entered,s);assert(S.validateSave(entered));
  return entered;
}
export function contextFixtures(api){
  const {E}=api,rows=[];
  const add=(name,state,note='Synthetic legal initial state; subsequent action uses the real engine.')=>{rows.push({name,state,note});return state;};
  for(const type of ['offering','relicloom']){
    const s=eventFixture(api,type),id=s.event.offerId;
    add(`${type}/entry`,s);
    const locked=add(`${type}/locked`,E.transition(s,{type:'lock',id}));
    add(`${type}/unlocked`,E.transition(locked,{type:'lock',id}));
    add(`${type}/equipped`,E.transition(s,{type:'equip',id}));
    add(`${type}/removed`,E.transition(s,{type:'salvage',ids:[id]}));
    add(`${type}/none-at-entry`,eventFixture(api,type,{spares:false}));
    const loot=structuredClone(s);loot.loot={item:structuredClone(loot.player.items.find(i=>i.id===id)),gold:0,type:'chest',source:'synthetic prior loot'};
    add(`${type}/loot-protected`,loot,'Synthetic accepted pending snapshot with the registered item also protected as displayed loot; not a claimed natural route.');
    const rare=structuredClone(s);rare.event.offerId='i6';
    add(`${type}/protected-rarity`,rare,'Synthetic accepted pending reference to an existing legendary item; normal entry would not select it.');
    const unnamed=structuredClone(s);unnamed.player.items.find(i=>i.id===id).name='';
    add(`${type}/empty-name`,unnamed,'Synthetic accepted legacy/import item with an empty display name; the reserved object still exists.');
    add(`${type}/empty-name-locked`,E.transition(unnamed,{type:'lock',id}),'Legal lock on the accepted unnamed reserved item; identity and payment authority remain unchanged.');
  }
  const offered=eventFixture(api,'offering');
  for(const [name,changes]of [['shared-cap',{deepOfferings:20}],['point-cap',{talentPoints:2000000}],['both-caps',{deepOfferings:20,talentPoints:2000000}]]){
    const s=structuredClone(offered);Object.assign(s.player,changes);add(`offering/${name}`,s,'Synthetic accepted cap boundary; no free points granted through a game action.');
  }
  const lockedCap=E.transition(offered,{type:'lock',id:offered.event.offerId});lockedCap.player.deepOfferings=20;
  add('offering/locked-and-cap',lockedCap,'Legal lock plus a synthetic accepted shared-cap boundary.');
  const well=add('bloodwell/entry',eventFixture(api,'bloodwell'));
  add('bloodwell/larger-armor-after-entry',E.transition(well,{type:'equip',id:'i6'}));
  const high=eventFixture(api,'bloodwell',{beforeEnter:s=>E.transition(s,{type:'equip',id:'i6'})});
  add('bloodwell/smaller-armor-after-entry',E.transition(high,{type:'equip',id:'i2'}));
  for(const [name,delta]of [['cannot-pay',-1],['would-be-lethal',0],['one-hp-survives',1]]){
    const s=structuredClone(well);s.player.hp=s.event.costHp+delta;add(`bloodwell/${name}`,s,'Synthetic accepted HP boundary around the original stored charge.');
  }
  for(const [type,state]of [['offering',offered],['bloodwell',well]]){
    add(`${type}/resolved-leave`,E.transition(state,{type:'event-choice',id:'leave'}));
    add(`${type}/resolved-accept`,E.transition(state,{type:'event-choice',id:'accept',confirmed:true}));
  }
  for(const [name,hp]of [['full-hp',null],['below-new-cap',100],['at-new-cap',467]]){
    const state=eventFixture(api,'memorywell',{beforeEnter:s=>{
      s.player.gold=100000;s.player.talentPoints=5;s=E.transition(s,{type:'talent',id:'vitality',count:5});s.player.hp=hp??E.stats(s).maxHp;return s;
    }});
    add(`memorywell/${name}`,state,'Synthetic valid HP boundary with five legally invested vitality points; reset and reallocation use original transactions.');
  }
  return rows;
}
function allEventFixtures(api){
  const {C,D}=api,rows=[];
  for(const key of C.EVENT_KEYS.filter(key=>key!=='mystery'&&C.EVENT_ROOMS.has(key)))rows.push({name:`all/${key}`,state:eventFixture(api,key,{floor:140,rich:true})});
  const mysteryKeys=C.EVENT_KEYS.filter(key=>!C.EVENT_ROOMS.has(key)&&!D.DEEP_ROOMS[key]),seen=new Set();
  for(let seed=1;seed<=300&&seen.size<mysteryKeys.length;seed++){
    const state=eventFixture(api,'mystery',{seed,floor:140,rich:true}),key=state.event.key;
    if(!seen.has(key)){seen.add(key);rows.push({name:`all/${key}`,state});}
  }
  assert.deepEqual([...seen].sort(),[...mysteryKeys].sort(),'all authored mystery keys must be reached by real seeded entry');
  return rows;
}
export function runEventAudit(api){
  const {E,S,C,V}=api,context=contextFixtures(api),matrix=allEventFixtures(api),transcript=[],observations=[];
  const counts={contextSnapshots:context.length,eventKeys:0,choiceIds:0,commits:0,rejections:0,unconfirmedRejections:0,claims:0,roundtrips:0};
  function read(state,label){
    assert(S.validateSave(state),`${label}: valid save`);const saved=S.encodeSave(state),before=structuredClone(state);
    const presentation=C.eventPresentation(state);assert.equal(S.encodeSave(state),saved,`${label}: presentation cannot write a save`);
    assert.deepEqual(S.decodeSave(saved),state,`${label}: exact save roundtrip`);counts.roundtrips++;
    const html=V.center(state,{view:'game',busy:false});assert(!/\bNaN\b|\bundefined\b/.test(html),`${label}: usable center markup`);
    assert.deepEqual(state,before,`${label}: render is read-only`);
    transcript.push({label,state:before});return presentation;
  }
  function commit(before,action,label){
    const copy=structuredClone(before),after=E.transition(before,action);assert.deepEqual(before,copy,`${label}: original input unchanged`);
    if(after===before)counts.rejections++;else counts.commits++;
    read(after,label);transcript.push({label,action,accepted:after!==before});return after;
  }
  const seen=new Set(),seenChoices=new Set();
  for(const row of [...context,...matrix]){
    const {name,state}=row,p=read(state,name),controls=p.options.map(({id,disabled,confirm,destructive})=>({id,disabled,confirm,destructive}));
    transcript.push({label:name,controls});
    if(name.startsWith('all/')){seen.add(state.event.key);for(const o of p.options)seenChoices.add(`${state.event.key}/${o.id}`);}
    if(!name.startsWith('all/'))observations.push({scenario:name,note:row.note,offerId:state.event.offerId,costHp:state.event.costHp,maxHp:E.stats(state).maxHp,hp:state.player.hp,rng:state.rng,body:p.body,status:p.status,options:p.options.map(({id,cost,detail,reason,disabled,confirm})=>({id,cost,detail,reason,disabled,confirm})),saveSha256:sha(state)});
    if(state.event.status!=='pending'){
      assert.deepEqual(p.options,[]);if(['offering','bloodwell','relicloom'].includes(state.event.key))assert.equal(p.body,state.event.text,'resolved history remains its saved text');
      continue;
    }
    assert(p.options.some(o=>o.id==='leave'&&!o.disabled),`${name}: leave must remain available`);
    for(const option of p.options){
      const action={type:'event-choice',id:option.id,confirmed:true};
      if(option.confirm){assert.strictEqual(E.transition(state,{type:'event-choice',id:option.id}),state,`${name}: explicit confirmation required`);counts.unconfirmedRejections++;}
      const after=commit(state,action,`${name}/${option.id}`);
      if(option.disabled){assert.strictEqual(after,state,`${name}: disabled action is atomic`);continue;}
      assert.notStrictEqual(after,state,`${name}: enabled action commits`);assert.strictEqual(E.transition(after,action),after,`${name}: cannot accept twice`);counts.rejections++;
      assert.equal(after.event.offerId,state.event.offerId);assert.equal(after.event.costHp,state.event.costHp);assert.equal(after.event.status,'resolved');
      if(option.id==='leave'){assert.deepEqual(after.player,state.player);assert.equal(after.rng,state.rng);}
      if(state.event.key==='bloodwell'&&option.id==='accept')assert.equal(after.player.hp,state.player.hp-state.event.costHp);
      if(['offering','relicloom'].includes(state.event.key)&&option.id==='accept'){
        assert(!after.player.items.some(i=>i.id===state.event.offerId));
        assert.deepEqual(after.player.items,state.player.items.filter(i=>i.id!==state.event.offerId));
        if(state.event.key==='offering'){assert.equal(after.rng,state.rng);assert.equal(after.player.talentPoints,state.player.talentPoints+1);assert.equal(after.player.deepOfferings,(state.player.deepOfferings||0)+1);}
      }
      if(state.event.key==='memorywell'&&option.id==='reset'){
        assert.equal(after.player.hp,Math.min(state.player.hp,E.stats(after).maxHp));assert.equal(after.rng,state.rng);assert.deepEqual(after.player.items,state.player.items);
        if(name.startsWith('memorywell/')){
          const reallocated=commit(after,{type:'talent',id:'vitality',count:state.player.talents.vitality},`${name}/reallocate`);
          assert.notStrictEqual(reallocated,after);assert.equal(reallocated.player.hp,after.player.hp);assert.equal(E.stats(reallocated).maxHp,E.stats(state).maxHp);assert.deepEqual(reallocated.player.talents,state.player.talents);assert.equal(reallocated.rng,state.rng);
        }
      }
      if(after.phase==='chest'){
        const claimed=commit(after,{type:'open'},`${name}/${option.id}/claim`);assert.notStrictEqual(claimed,after);assert.strictEqual(E.transition(claimed,{type:'open'}),claimed);counts.rejections++;counts.claims++;
        assert.equal(claimed.player.items.filter(i=>i.id===after.chest.item.id).length,1);
      }
    }
  }
  assert.deepEqual([...seen].sort(),[...C.EVENT_KEYS].sort(),'every legal event key has a seeded primary fixture');
  counts.eventKeys=seen.size;counts.choiceIds=seenChoices.size;
  return {counts,eventKeys:[...seen].sort(),observations,transcript,transcriptSha256:sha(transcript)};
}

async function main(){
  const usage='node scripts/audit-event-context.mjs [--source PROJECT_ROOT] [--compare BASELINE_ROOT] --output EXTERNAL_JSON';
  const args=process.argv.slice(2),opts={};if(args.includes('--help')){console.log(usage);return;}
  for(let i=0;i<args.length;i+=2){const [key,value]=args.slice(i,i+2);if(!['--source','--compare','--output'].includes(key)||!value||value.startsWith('--')||Object.hasOwn(opts,key))throw Error(usage);opts[key]=value;}
  if(!opts['--output'])throw Error(usage+'; output must be explicit and outside the source packages.');
  const root=resolve(opts['--source']||packageRoot),output=resolve(opts['--output']),compare=opts['--compare']&&resolve(opts['--compare']);
  const inside=folder=>{const rel=relative(folder,output);return !rel||(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep));};
  if([packageRoot,root,compare].filter(Boolean).some(inside))throw Error('Audit output must be outside both audited packages and the script package.');
  const current=runEventAudit(await loadEventApi(root));let differential=null;
  if(compare){
    const prior=runEventAudit(await loadEventApi(compare));
    assert.deepEqual(current.transcript,prior.transcript,'full committed states, rendering snapshots and choice authority must match the input baseline');
    differential={baseline:compare,fullTranscriptEqual:true,entries:current.transcript.length,baselineSha256:prior.transcriptSha256,currentSha256:current.transcriptSha256,changedPresentation:current.observations.flatMap((row,i)=>{const old=prior.observations[i];return JSON.stringify(row)===JSON.stringify(old)?[]:[{scenario:row.scenario,before:{body:old.body,options:old.options},after:{body:row.body,options:row.options},saveSha256:row.saveSha256}];})};
  }
  const files=['src/encounters.js','src/deep-rules.js','src/deep-content.js','src/engine.js','src/storage.js'],sourceSha256={};
  for(const file of files)sourceSha256[file]=sha(await readFile(resolve(root,file),'utf8'));
  const report={status:'PASS',scope:'Synthetic valid states and actual engine actions; no natural incidence, exhaustive RNG outcomes, or real-browser claims.',source:root,sourceSha256,counts:current.counts,eventKeys:current.eventKeys,transcriptSha256:current.transcriptSha256,observations:current.observations,differential};
  await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,counts:report.counts,transcriptSha256:report.transcriptSha256,compared:!!compare,changedScenarios:differential?.changedPresentation.length,output},null,2));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
