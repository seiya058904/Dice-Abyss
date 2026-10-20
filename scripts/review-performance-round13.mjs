// Read-only review of one complete qa-performance-round12.mjs report and its
// retained artifacts. Does not execute game modules, a browser or a benchmark.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,existsSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join,dirname,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const args={};
for(let i=2;i<process.argv.length;i++){
  const arg=process.argv[i],at=arg.indexOf('=');
  if(at>=0)args[arg.slice(0,at)]=arg.slice(at+1);
  else{assert(arg.startsWith('--'));args[arg]=process.argv[++i];}
}
assert(args['--report']&&args['--baseline-source'],'--report and --baseline-source are required');
const reportPath=resolve(args['--report']),evidence=dirname(reportPath),baselineSource=resolve(args['--baseline-source']);
const currentSource=resolve(args['--source']||fileURLToPath(new URL('../',import.meta.url)));
const output=resolve(args['--output']||'/tmp/dice-performance-review-round13.json');
const inside=(root,file)=>{const local=relative(root,file);return local===''||(!local.startsWith('..'+sep)&&local!=='..'&&!local.startsWith(sep));};
for(const root of [evidence,baselineSource,currentSource])assert(!inside(root,output),'Output must be outside the retained evidence and source trees');
assert(!existsSync(output),'Review output must be a new file');
const expectedRepeats=Number(args['--expected-repeats']||2),expectedInventory=Number(args['--expected-inventory-pairs']||12);
const expectedSizes=(args['--expected-sizes']||'1920x1080,3840x2160').split(',').map(value=>value.split('x').map(Number));
// Strict source equality is the default. These are the only two explicitly
// reviewed post-measurement changes accepted by this round-specific reader.
const laterChanges=(args['--later-source-changes']||'').split(',').filter(Boolean);
const laterChangeDefinitions={
  'src/app.js':{patchArgument:'--app-change-patch',scope:'Only the native storage-event listener: protect surviving memory when queued deletion notices arrive after another tab has written a replacement; preserve same-state presentation.'},
  'src/save-recovery.css':{patchArgument:'--recovery-css-change-patch',scope:'Only primary-button normal/hover colors below .recovery-content on the recovery screen.'},
};
assert.equal(new Set(laterChanges).size,laterChanges.length,'Do not duplicate a later source declaration');
assert(laterChanges.every(file=>Object.hasOwn(laterChangeDefinitions,file)),'Only src/app.js and src/save-recovery.css may be explicitly declared');
for(const file of laterChanges)assert(args[laterChangeDefinitions[file].patchArgument],file+' requires its exact applied patch');
assert(Number.isInteger(expectedRepeats)&&expectedRepeats>=1&&expectedRepeats<=5);assert(Number.isInteger(expectedInventory)&&expectedInventory>=12&&expectedInventory<=20);
assert(expectedSizes.length&&expectedSizes.every(size=>size.length===2&&size.every(value=>Number.isInteger(value)&&value>0)));
assert.equal(new Set(expectedSizes.map(size=>size.join('x'))).size,expectedSizes.length);
const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const json=file=>JSON.parse(readFileSync(file,'utf8')),r=json(reportPath);
const oldVersion=json(join(baselineSource,'package.json')).version,currentVersion=json(join(currentSource,'package.json')).version;
assert.notEqual(oldVersion,currentVersion,'The two real source versions must be distinguishable');
const sourceByVersion={[oldVersion]:baselineSource,[currentVersion]:currentSource};
const versionByLabel=Object.fromEntries(r.environments.map(env=>[env.label,env.http.release]));
const result={scope:'Independent offline arithmetic, complete-artifact and identity review; no fresh browser, game transition, DOM parsing or timing replay.',report:{path:reportPath,sha256:sha(readFileSync(reportPath)),measurementStatus:r.status,mode:r.mode,browserVersion:r.browserVersion,measurementScriptSha256:r.scriptSha256},reviewScriptSha256:sha(readFileSync(fileURLToPath(import.meta.url))),versionByLabel,contextCreationVersions:r.environments.map(env=>env.http.release),expectedProtocol:{repeats:expectedRepeats,inventoryPairs:expectedInventory,sizes:expectedSizes,windowMs:4200},declaredLaterSourcePaths:laterChanges,recordedSourceIdentity:{status:'NOT_CHECKED'},finalSourceIdentity:{status:'NOT_CHECKED'},checks:[],failures:[],windows:[],slowRafSamples:[],allObservedLongTasks:[],missingFullEffects:[],inventory:{},frameComparisons:[],notes:[
  'PASS means retained evidence was recomputed and checked. It does not upgrade MEASURED_WITH_LIMITATIONS, prove speedup, or close a missing visual stage.',
  'Every reported RAF interval and Long Task is inspected. Only the previously declared inventory warmup per variant is excluded from formal inventory statistics; all warmups remain in this review.',
  'Version identity comes from each actual HTTP release and local package. Recorded before/after/HTTP source identity and comparison with final local source bytes are separate checks, including reversed baseline/after labels.',
  'Exact browser state and DOM comparisons are performed by the fingerprinted measurement driver. This offline review checks their complete retained artifacts and recorded assertions; it does not rerun those browser operations.',
  'Software-renderer callback intervals and indexed-buffer preparation measurements do not establish physical GPU, compositor, or 4K60 performance.',
  'An explicitly declared later source change is DIFFERENT_DECLARED, never final-source equality. The measured report remains attached to its recorded candidate hashes; missing candidate file bodies are not reconstructed or claimed independently retained.',
]};
const check=(name,fn)=>{try{result.checks.push({name,status:'PASS',...fn()});}catch(error){result.failures.push({name,message:error.message});}};
const sum=values=>values.reduce((total,value)=>total+value,0);
const close=(a,b,label)=>assert(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-6,`${label}: ${a} vs ${b}`);
const stats=values=>{assert(values.length&&values.every(value=>Number.isFinite(value)&&value>=0));const sorted=values.toSorted((a,b)=>a-b),q=p=>sorted[Math.floor((sorted.length-1)*p)];return{samples:sorted.length,p50:q(.5),p95:q(.95),p99:q(.99),max:sorted.at(-1),min:sorted[0]};};
const groups=(rows,key)=>{const map=new Map();for(const row of rows){const id=key(row);if(!map.has(id))map.set(id,[]);map.get(id).push(row);}return map;};
const runtimeFiles=(root,directory='src')=>readdirSync(join(root,directory),{withFileTypes:true}).flatMap(entry=>{const name=directory+'/'+entry.name;return entry.isDirectory()?runtimeFiles(root,name):entry.isFile()&&/\.(?:js|css)$/.test(name)?[name]:[];});
function artifact(meta){
  assert(meta&&typeof meta.file==='string');const file=resolve(evidence,meta.file);assert(inside(evidence,file),'Artifact must resolve inside its retained evidence directory');
  const raw=readFileSync(file);assert.equal(sha(raw),meta.sha256,meta.file+' SHA');if(meta.utf8Bytes!==undefined)assert.equal(raw.length,meta.utf8Bytes);if(meta.characters!==undefined)assert.equal(raw.toString('utf8').length,meta.characters);return raw.toString('utf8');
}
function pairing(section,name){
  assert.equal(section.runs.length,section.pairOrders.length*2,name+' must retain all complete pairs');
  for(const [index,pair]of section.pairOrders.entries()){
    assert.equal(pair.pair,index+1);assert.deepEqual(pair.order,index%2?['after','baseline']:['baseline','after']);
    const runs=section.runs.slice(index*2,index*2+2);assert.deepEqual(runs.map(run=>run.label),pair.order);
    for(const [position,run]of runs.entries()){assert.equal(run.pair,pair.pair);assert.equal(run.position,position+1);assert.deepEqual(run.pairOrder,pair.order);assert.equal(run.repeat,pair.repeat);for(const key of ['scene','width','height','effects'])if(pair[key]!==undefined)assert.equal(run[key],pair[key]);}
  }
}

check('completed report and recorded driver/source/HTTP identities',()=>{
  assert(['MEASURED','MEASURED_WITH_LIMITATIONS'].includes(r.status));assert.equal(r.errors.length,0);assert.equal(r.activeCase,null);assert.equal(r.activeMeasurement,null);assert.equal(r.sourceStable,true);assert.deepEqual(r.sourceBefore,r.sourceAfter);
  assert.deepEqual(Object.keys(versionByLabel).toSorted(),['after','baseline']);assert.deepEqual(Object.values(versionByLabel).toSorted(),[oldVersion,currentVersion].toSorted());
  const sourcePaths=[...new Set(['index.html','package.json',...runtimeFiles(baselineSource),...runtimeFiles(currentSource)])].toSorted();
  const driverFiles=[baselineSource,currentSource].map(root=>join(root,'scripts/qa-performance-round12.mjs')).filter(existsSync);assert(driverFiles.some(file=>sha(readFileSync(file))===r.scriptSha256));
  const identities={};
  for(const label of ['baseline','after']){
    const root=sourceByVersion[versionByLabel[label]],files=r.sourceBefore[label],environment=r.environments.find(env=>env.label===label),http=environment.http;
    assert(root);assert.equal(environment.dpr,1);assert(environment.fonts.every(Boolean));assert.equal(environment.longTaskObserver,true);assert.equal(environment.webLocks,true);
    assert.deepEqual(files.map(file=>file.file),sourcePaths);assert.equal(files.length,http.assets.length);assert.equal(new Set(http.assets.map(file=>file.file)).size,files.length);
    assert.equal(http.documentStatus,200);assert.equal(http.documentSha256,sha(readFileSync(join(root,'index.html'))));assert.equal(json(join(root,'package.json')).version,http.release);
    const {label:_,...duplicate}=r.sourceHttpIdentity.find(entry=>entry.label===label);assert.deepEqual(duplicate,http);
    const variant=r.variants.find(entry=>entry.label===label);assert.equal(new URL(http.documentUrl).origin,new URL(variant.url).origin);
    let present=0,absent=0,metadata=0;
    for(const file of files){
      const served=http.assets.find(asset=>asset.file===file.file);assert(served);assert.equal(served.expectedExists,file.exists);
      if(file.exists){assert(Number.isInteger(file.bytes)&&file.bytes>0);assert(/^[a-f0-9]{64}$/.test(file.sha256));}else{assert.equal(file.bytes,0);assert.equal(file.sha256,null);}
      if(file.file==='package.json'){assert.equal(served.status,404);assert.equal(served.scope,'local-metadata-intentionally-not-served');metadata++;}
      else if(file.exists){assert.equal(served.status,200);assert.equal(served.bytes,file.bytes);assert.equal(served.sha256,file.sha256);present++;}
      else{assert([404,410].includes(served.status));absent++;}
    }
    for(const url of http.linkedStylesheets)assert(files.some(file=>file.file===new URL(url).pathname.slice(1)&&file.exists));
    identities[http.release]={root,label,identityEntries:files.length,presentRuntimeAssets:present,absentRuntimeAssets:absent,privateMetadata404:metadata,renderer:environment.renderer,url:http.documentUrl};
  }
  result.sourceIdentities=identities;result.recordedSourceIdentity={status:'PASS',pathsPerVersion:sourcePaths.length,beforeEqualsAfter:true,servedRuntimeEqualsRecordedCandidate:true,versionsMappedByHttpAndLocalPackage:true};return{pathsPerVersion:sourcePaths.length,versionsMappedByHttpAndLocalPackage:true};
});
check('final local source equality or exact declared later differences',()=>{
  const files=[],changes=[],unexpected=[],unused=new Set(laterChanges);
  for(const label of ['baseline','after']){
    const version=versionByLabel[label],root=sourceByVersion[version];
    for(const measured of r.sourceBefore[label]){
      const path=join(root,measured.file),exists=existsSync(path),raw=exists?readFileSync(path):null;
      const final={exists,bytes:raw?.length??0,sha256:raw?sha(raw):null},equal=final.exists===measured.exists&&final.bytes===measured.bytes&&final.sha256===measured.sha256;
      const declared=!equal&&version===currentVersion&&laterChanges.includes(measured.file);
      const entry={version,label,file:measured.file,measured:{exists:measured.exists,bytes:measured.bytes,sha256:measured.sha256},final,status:equal?'MATCH':declared?'DIFFERENT_DECLARED':'DIFFERENT_UNDECLARED'};files.push(entry);
      if(equal)continue;
      if(!declared){unexpected.push(entry);continue;}
      assert.equal(final.exists,measured.exists,'Declarations cannot add or remove files');assert(final.exists);
      const definition=laterChangeDefinitions[measured.file],patchPath=resolve(args[definition.patchArgument]),patchBytes=readFileSync(patchPath),patch=patchBytes.toString('utf8');
      const lines=patch.split('\n'),oldHeaders=lines.filter(line=>line.startsWith('--- ')),newHeaders=lines.filter(line=>line.startsWith('+++ '));
      assert.equal(oldHeaders.length,1);assert.equal(newHeaders.length,1);for(const header of [...oldHeaders,...newHeaders])assert(header.slice(4).endsWith('/'+measured.file),'Applied patch must address only its declared source file');
      const added=[],removed=[],fragments=[];let fragment=null;
      for(const line of lines){
        if(line.startsWith('@@')){if(fragment!==null)fragments.push(fragment);fragment='';continue;}
        if(fragment===null)continue;
        if(line.startsWith('+')){added.push(line.slice(1));fragment+=line.slice(1)+'\n';}
        else if(line.startsWith('-'))removed.push(line.slice(1));
        else if(line.startsWith(' '))fragment+=line.slice(1)+'\n';
        else assert.equal(line,'','Only ordinary unified-diff lines are accepted');
      }
      if(fragment!==null)fragments.push(fragment);assert(fragments.length&&added.length+removed.length>0);
      const finalText=raw.toString('utf8');let lastEnd=0;
      for(const part of fragments){assert(part.length);const at=finalText.indexOf(part,lastEnd);assert(at>=0,'Each complete final patch hunk must occur in the actual final file');lastEnd=at+part.length;}
      const byteDelta=sum(added.map(line=>Buffer.byteLength(line+'\n')))-sum(removed.map(line=>Buffer.byteLength(line+'\n')));assert.equal(final.bytes-measured.bytes,byteDelta,'Exact applied patch byte delta must match candidate/final sizes');
      if(measured.file==='src/app.js'){
        const start=finalText.indexOf("window.addEventListener('storage', event => {"),end=finalText.indexOf('\n});',start);assert(start>=0&&end>start);
        for(const part of fragments){const at=finalText.indexOf(part);assert(at>=start&&at+part.length<=end,'App hunk must be entirely inside the storage-event listener');}
        assert.deepEqual(removed,['  if ((event.key === BACKUP_KEY || event.key === null) && updated.state && state && JSON.stringify(updated.state) === JSON.stringify(state)) {']);
      }else{
        assert.equal(removed.length,0);assert.equal(added.length,2);assert(added.every(line=>/^\.recovery-content button\.primary(?::hover:not\(:disabled\))?\{background:#[0-9a-f]{6};color:#[0-9a-f]{6};border-color:#[0-9a-f]{6};\}$/.test(line)),'Recovery CSS declaration permits exactly two scoped color rules');
      }
      changes.push({...entry,scope:definition.scope,patch:{path:patchPath,sha256:sha(patchBytes),bytes:patchBytes.length,content:patch,allFinalHunksPresent:true,byteDelta},measuredCandidateBody:'NOT_INDEPENDENTLY_RETAINED',limitation:'The exact author-recorded applied patch and final hunk/size checks support this declared scope. Without the measured body, this is not a byte-for-byte independent diff of that candidate file.'});unused.delete(measured.file);
    }
  }
  result.finalSourceIdentity={status:unexpected.length?'DIFFERENT_UNDECLARED':changes.length?'DIFFERENT_DECLARED':'MATCH',checkedEntries:files.length,matchingEntries:files.filter(file=>file.status==='MATCH').length,files,declaredChanges:changes,unexpectedChanges:unexpected,unusedDeclarations:[...unused],unavailableMeasuredCandidateBodies:changes.map(change=>change.file)};
  assert.equal(unexpected.length,0,'Every unlisted source file must match the recorded measured source');assert.equal(unused.size,0,'Every explicitly declared change must be an observed difference');return{identityStatus:result.finalSourceIdentity.status,matchingEntries:result.finalSourceIdentity.matchingEntries,declaredDifferences:changes.length};
});
check('complete fixed fixture manifest',()=>{
  const manifest=json(join(evidence,'fixture-manifest.json'));assert.deepEqual(manifest.manifest,r.fixtureManifest);assert.equal(r.fixtureManifest.length,10);assert(r.fixtureManifest.every(fixture=>fixture.seed===r.seed));assert.equal(new Set(r.fixtureManifest.map(fixture=>fixture.name)).size,10);
  for(const fixture of r.fixtureManifest)assert(/^[a-f0-9]{64}$/.test(fixture.stateSha256)&&/^[a-f0-9]{64}$/.test(fixture.rawSha256));return{fixtures:r.fixtureManifest.length};
});

const inv=r.inventory;
if(inv.runs.length){
  check('all complete inventory HTML, cards, attributes and lossless differences',()=>{
    const diff=JSON.parse(artifact(inv.domDifferences));assert.equal(diff.cards.length,60);assert.equal(inv.domDifferences.cardsCompared,60);assert.equal(diff.cardsDifferent,diff.cards.filter(card=>!card.identical).length);assert.equal(inv.domDifferences.cardsDifferent,diff.cardsDifferent);
    const byVersion={};
    for(const label of ['baseline','after']){
      const oracle=inv.oracles[label],cards=artifact(oracle.cardHtml),actual=artifact(inv.actualReferences[label]),game=artifact(oracle.sourceGameHtml);
      assert.equal(actual,cards);assert.equal(oracle.cards,60);assert.equal(oracle.ids.length,60);assert.equal(new Set(oracle.ids).size,60);
      assert.equal(sha(oracle.ids),oracle.cardIdsSha256);assert.equal(sha(oracle.cardStates),oracle.cardStatesSha256);assert.equal(sha(oracle.completeItemStates),oracle.completeItemStatesSha256);
      assert.deepEqual(oracle.completeItemStates.map(row=>row.item.id),oracle.ids);assert.deepEqual(oracle.cardStates.map(row=>row.id),oracle.ids);
      assert.equal(oracle.viewsSourceSha256,r.sourceBefore[label].find(file=>file.file==='src/views.js').sha256);assert.equal(oracle.sourceStateUnchanged,true);
      assert.equal(diff.cards.map(card=>card[label].html).join(''),cards);assert.equal((cards.match(/<article class="item-card /g)||[]).length,60);assert.equal((game.match(/<article class="item-card /g)||[]).length,60);
      for(const [index,card]of diff.cards.entries()){assert.equal(card.index,index);assert.equal(card.id,oracle.ids[index]);assert.equal(sha(card[label].html),card[label].sha256);assert.equal(Buffer.byteLength(card[label].html),card[label].utf8Bytes);}
      byVersion[versionByLabel[label]]={cardsSha256:sha(cards),cardBytes:Buffer.byteLength(cards),gameSha256:sha(game),gameBytes:Buffer.byteLength(game),stateSha256:oracle.stateSha256,rawStateSha256:oracle.rawStateSha256,completeItemStatesSha256:oracle.completeItemStatesSha256};
    }
    for(const card of diff.cards){
      const before=card.baseline.html,after=card.after.html;assert.equal(card.identical,before===after);
      if(card.difference){const d=card.difference;assert.equal(before.slice(d.commonPrefixCharacters,before.length-d.commonSuffixCharacters),d.removed);assert.equal(after.slice(d.commonPrefixCharacters,after.length-d.commonSuffixCharacters),d.added);assert.equal(before.slice(0,d.commonPrefixCharacters)+d.added+before.slice(before.length-d.commonSuffixCharacters),after);}else assert.equal(before,after);
    }
    for(const key of ['cardStates','completeItemStates','ids','stateSha256','rawStateSha256'])assert.deepEqual(inv.oracles.baseline[key],inv.oracles.after[key]);
    assert.equal(inv.cardHtmlIdentical,diff.completeHtmlIdentical);assert.equal(inv.cardHtmlIdentical,byVersion[oldVersion].cardsSha256===byVersion[currentVersion].cardsSha256);
    for(const key of ['cardHtmlMatchedOwnSource','cardSetsIdentical','cardStatesIdentical','completeStateIdentical'])assert.equal(inv[key],true);
    result.inventory.dom={byVersion,cardsCompared:60,cardsChanged:diff.cardsDifferent,completeCardHtmlEqual:inv.cardHtmlIdentical,cardBytesCurrentMinusInput:byVersion[currentVersion].cardBytes-byVersion[oldVersion].cardBytes};return{cardsCompared:60,cardsChanged:diff.cardsDifferent};
  });
  check('every inventory sample, both warmups and alternating order',()=>{
    assert.equal(inv.status,'MEASURED');assert.equal(inv.requestedSamplesPerVariant,expectedInventory);assert.equal(inv.runs.length,expectedInventory*2);assert.equal(inv.warmupsPerVariant,1);assert.equal(inv.storage.length,2);pairing(inv,'inventory');
    const fixture=r.fixtureManifest.find(row=>row.name==='inventory-10000');assert.equal(fixture.items,10000);
    for(const store of inv.storage){assert.equal(store.ok,true);for(const key of ['main','mirror','settings'])assert.equal(store.writes[key].ok,true);assert.equal(store.mainCharacters,fixture.rawCharacters);assert.equal(store.mirrorCharacters,fixture.rawCharacters);assert.equal(store.warmupMs,store.warmup.elapsedMs);}
    for(const run of [...inv.runs,...inv.storage.map(store=>({...store.warmup,label:store.label}))]){
      const oracle=inv.oracles[run.label];assert(Number.isFinite(run.elapsedMs)&&run.elapsedMs>0);assert.equal(run.cards,60);assert.equal(run.trusted,true);
      for(const [key,value]of Object.entries({cardIdsSha256:oracle.cardIdsSha256,cardStatesSha256:oracle.cardStatesSha256,cardHtmlSha256:oracle.cardHtml.sha256,cardHtmlUtf8Bytes:oracle.cardHtml.utf8Bytes,expectedCardHtmlSha256:oracle.cardHtml.sha256,stateSha256:fixture.stateSha256}))assert.equal(run[key],value);
      for(const key of ['completeSourceDomMatched','completeHtmlStableWithinVariant','stateUnchanged','mirrorUnchanged'])assert.equal(run[key],true);
    }
    const byVersion={};for(const label of ['baseline','after']){const runs=inv.runs.filter(run=>run.label===label),summary=stats(runs.map(run=>run.elapsedMs));assert.deepEqual(summary,inv.aggregate[label]);byVersion[versionByLabel[label]]={...summary,allSamples:runs.map(run=>({pair:run.pair,repeat:run.repeat,position:run.position,elapsedMs:run.elapsedMs}))};}
    const a=inv.aggregate.after,b=inv.aggregate.baseline;assert.deepEqual(inv.comparison,{medianDeltaMs:a.p50-b.p50,medianPercentChange:(a.p50/b.p50-1)*100,p95DeltaMs:a.p95-b.p95,maxDeltaMs:a.max-b.max});
    const pairs=[...groups(inv.runs,run=>run.pair).values()].map(runs=>{const before=runs.find(run=>versionByLabel[run.label]===oldVersion),current=runs.find(run=>versionByLabel[run.label]===currentVersion);return{pair:before.pair,versionsInOrder:runs.map(run=>versionByLabel[run.label]),inputMs:before.elapsedMs,currentMs:current.elapsedMs,currentMinusInputMs:current.elapsedMs-before.elapsedMs};});
    Object.assign(result.inventory,{byVersion,pairs,warmups:inv.storage.map(store=>({version:versionByLabel[store.label],elapsedMs:store.warmupMs,retainedButExcluded:true})),currentSlowerPairs:pairs.filter(pair=>pair.currentMinusInputMs>0).length,currentFasterPairs:pairs.filter(pair=>pair.currentMinusInputMs<0).length});return{formalSamples:inv.runs.length,retainedExcludedWarmups:inv.storage.length};
  });
}else check('inventory was explicitly not run',()=>{assert.equal(inv.status,'NOT_RUN');assert(!['all','inventory'].includes(r.mode));return{};});

for(const sectionName of ['frames','coverage']){
  const section=r[sectionName];if(!section.runs.length){check(sectionName+' explicitly not run',()=>{assert.equal(section.status,'NOT_RUN');assert(!['all','frames'].includes(r.mode));return{};});continue;}
  check(sectionName+' complete requested cells and alternating paired order',()=>{
    assert.equal(section.status,'MEASURED');pairing(section,sectionName);assert.equal(section.requestedWindowMs,4200);assert.equal(section.requestedRepeatsPerCell,sectionName==='frames'?expectedRepeats:1);
    const expected=[];
    if(sectionName==='frames')for(const [width,height]of expectedSizes)for(const scene of ['boss-burst','eternal-open'])for(const effects of ['full','low'])for(let repeat=1;repeat<=expectedRepeats;repeat++)for(const label of ['baseline','after'])expected.push([label,scene,width,height,effects,repeat].join('/'));
    else for(let rarity=0;rarity<=6;rarity++)for(const label of ['baseline','after'])expected.push([label,`rarity-${rarity}-open`,1920,1080,'full',1].join('/'));
    const actual=section.runs.map(run=>[run.label,run.scene,run.width,run.height,run.effects,run.repeat].join('/'));assert.equal(new Set(actual).size,actual.length);assert.deepEqual(actual.toSorted(),expected.toSorted());return{windows:actual.length};
  });
  for(const [index,run]of section.runs.entries())check(sectionName+' raw window '+(index+1),()=>{
    const intervals=run.rafIntervalsMs,summary=stats(intervals),windowMs=section.requestedWindowMs;
    assert.equal(run.frames,intervals.length);close(sum(intervals),run.actualWindowMs,'sum of every raw interval');close(run.windowEndTimeMs-run.windowStartTimeMs,run.actualWindowMs,'window timestamps');assert(sum(intervals.slice(0,-1))<windowMs);assert(sum(intervals)>=windowMs);close(run.actualWindowMs-windowMs,run.windowOverrunMs,'window overrun');assert.equal(run.firstFrameDelayMs,intervals[0]);
    for(const key of ['p50','p95','p99','max'])assert.equal(run[key],summary[key]);assert.equal(run.over50,intervals.filter(value=>value>50).length);assert.equal(run.over100,intervals.filter(value=>value>100).length);
    const tasks=run.longTasks;assert.equal(tasks.supported,true);
    for(const task of tasks.observedSamples){assert.equal(task.entryType,'longtask');assert.equal(task.start,task.startTime);assert(Number.isFinite(task.duration)&&task.duration>=50);assert(Array.isArray(task.attribution));}
    const overlapping=tasks.observedSamples.filter(task=>task.start<run.windowEndTimeMs&&task.start+task.duration>run.windowStartTimeMs);
    const expected=overlapping.map(task=>({...task,startOffsetMs:task.start-run.windowStartTimeMs,durationMs:task.duration,overlapMs:Math.max(0,Math.min(run.windowEndTimeMs,task.start+task.duration)-Math.max(run.windowStartTimeMs,task.start))}));
    assert.deepEqual(tasks.samples,expected);assert.equal(tasks.count,expected.length);assert.equal(tasks.totalOverlapMs,sum(expected.map(task=>task.overlapMs)));assert.equal(tasks.maxMs,Math.max(0,...expected.map(task=>task.duration)));assert.deepEqual(tasks.largest,overlapping.toSorted((a,b)=>b.duration-a.duration).slice(0,3).map(task=>({startOffsetMs:task.start-run.windowStartTimeMs,durationMs:task.duration})));
    const fixture=r.fixtureManifest.find(row=>row.name===run.scene);assert(fixture);assert.equal(run.fixtureSha256,fixture.stateSha256);assert.equal(run.rarity,fixture.rarity);assert.equal(run.trusted,true);assert.equal(run.visibility,'visible');assert.equal(run.exactTransition,true);assert.equal(run.mirrorSaved,true);assert.equal(run.logBefore,6);assert.equal(run.logAfter,6);assert.equal(run.logMaxCharacters,180);assert(/^[a-f0-9]{64}$/.test(run.persistedSha256));
    assert(Array.isArray(run.effectKinds)&&run.effectKinds.every(kind=>typeof kind==='string'));
    const target=fixture.action==='roll'?'combat':`loot-${run.rarity}`,stageSeen=run.effectKinds.includes(target);assert.equal(run.effectObserved,run.effects==='low'||stageSeen);
    const brief={section:sectionName,window:index+1,pair:run.pair,repeat:run.repeat,position:run.position,label:run.label,version:versionByLabel[run.label],scene:run.scene,rarity:run.rarity,width:run.width,height:run.height,effects:run.effects,frames:run.frames,actualWindowMs:run.actualWindowMs,overrunMs:run.windowOverrunMs,firstFrameDelayMs:run.firstFrameDelayMs,p50:run.p50,p95:run.p95,p99:run.p99,max:run.max,over50:run.over50,over100:run.over100,longTasks:tasks.count,longTaskOverlapMs:tasks.totalOverlapMs,expectedFullStage:target,effectKinds:run.effectKinds,expectedFullStageObserved:run.effects==='full'?stageSeen:null,lowPathAccepted:run.effects==='low',persistedSha256:run.persistedSha256};
    result.windows.push(brief);if(run.effects==='full'&&!stageSeen)result.missingFullEffects.push(brief);
    let offset=0;for(const [sample,duration]of intervals.entries()){if(duration>50)result.slowRafSamples.push({section:sectionName,window:index+1,pair:run.pair,repeat:run.repeat,version:versionByLabel[run.label],scene:run.scene,width:run.width,height:run.height,effects:run.effects,sample:sample+1,startOffsetMs:offset,durationMs:duration});offset+=duration;}
    for(const task of tasks.observedSamples)result.allObservedLongTasks.push({section:sectionName,window:index+1,pair:run.pair,version:versionByLabel[run.label],scene:run.scene,...task});
    return{retainedRafIntervals:intervals.length,observedLongTasks:tasks.observedSamples.length,overlappingLongTasks:tasks.count,fullStageObserved:brief.expectedFullStageObserved};
  });
  check(sectionName+' all aggregate cells and complete committed-state fingerprints',()=>{
    const all=[...groups(section.runs,run=>[run.label,run.scene,run.width,run.height,run.effects].join('/')).values()];assert.equal(all.length,section.aggregate.length);
    const rebuilt=all.map(runs=>({label:runs[0].label,scene:runs[0].scene,width:runs[0].width,height:runs[0].height,effects:runs[0].effects,repeats:runs.length,medianRunP50:stats(runs.map(run=>run.p50)).p50,medianRunP95:stats(runs.map(run=>run.p95)).p50,worstFrameMs:Math.max(...runs.map(run=>run.max)),longTasks:sum(runs.map(run=>run.longTasks.count)),longTaskOverlapMs:sum(runs.map(run=>run.longTasks.totalOverlapMs)),observedAllExpectedEffects:runs.every(run=>run.effectObserved)}));assert.deepEqual(rebuilt,section.aggregate);
    for(const [scene,runs]of groups(section.runs,run=>run.scene))assert.equal(new Set(runs.map(run=>run.persistedSha256)).size,1,scene+': complete committed hashes agree across both versions, repeats, sizes and effect settings');return{cells:all.length};
  });
}
if(r.frames.runs.length){
  for(const rows of groups(result.windows.filter(run=>run.section==='frames'),run=>[run.scene,run.width,run.height,run.effects,run.repeat].join('/')).values()){
    const before=rows.find(run=>run.version===oldVersion),current=rows.find(run=>run.version===currentVersion);if(!before||!current)continue;
    result.frameComparisons.push({pair:before.pair,scene:before.scene,width:before.width,height:before.height,effects:before.effects,repeat:before.repeat,versionsInOrder:rows.toSorted((a,b)=>a.position-b.position).map(run=>run.version),input:before,current,maxCurrentMinusInputMs:current.max-before.max,p95CurrentMinusInputMs:current.p95-before.p95});
  }
  result.fullStageObservation=Object.fromEntries([oldVersion,currentVersion].map(version=>{const runs=result.windows.filter(run=>run.section==='frames'&&run.version===version&&run.effects==='full');return[version,{observed:runs.filter(run=>run.expectedFullStageObserved).length,windows:runs.length}];}));
  result.eightGradeCoverage=Object.fromEntries([oldVersion,currentVersion].map(version=>[version,Array.from({length:8},(_,rarity)=>{const runs=result.windows.filter(run=>run.version===version&&run.width===1920&&run.height===1080&&run.effects==='full'&&run.rarity===rarity);return{rarity,windows:runs.length,observed:runs.filter(run=>run.expectedFullStageObserved).length,allObserved:runs.length>0&&runs.every(run=>run.expectedFullStageObserved),references:runs.map(run=>({section:run.section,window:run.window,repeat:run.repeat}))};})]));
  result.requiredDisclosure4kEternal=result.windows.filter(run=>run.section==='frames'&&run.width===3840&&run.scene==='eternal-open');
}
check('measurement limitation status remains explicit',()=>{
  const limited=(r.frames.runs.length&&r.frames.requestedRepeatsPerCell<3)||[...r.frames.runs,...r.coverage.runs].some(run=>!run.effectObserved);
  assert.equal(r.status,limited?'MEASURED_WITH_LIMITATIONS':'MEASURED');return{fewerThanThreeMainRepeats:!!(r.frames.runs.length&&r.frames.requestedRepeatsPerCell<3),missingFullEffectWindows:result.missingFullEffects.length};
});
check('retained report is unchanged by the read-only review',()=>{assert.equal(sha(readFileSync(reportPath)),result.report.sha256);return{};});
result.recordedEvidenceVerification={status:result.failures.some(failure=>failure.name!=='final local source equality or exact declared later differences')?'FAIL':'PASS',scope:'Recorded before/after/HTTP identities, fixture manifest, retained DOM artifacts, complete raw intervals/tasks, paired sample completeness and every reported aggregate.'};
result.summary={reviewStatus:result.failures.length?'FAIL':result.finalSourceIdentity.status==='DIFFERENT_DECLARED'?'PASS_WITH_DECLARED_FINAL_SOURCE_DIFFERENCE':'PASS',recordedEvidenceVerification:result.recordedEvidenceVerification.status,recordedSourceIdentity:result.recordedSourceIdentity.status,finalSourceIdentity:result.finalSourceIdentity.status,measurementStatus:r.status,checksPassed:result.checks.length,failures:result.failures.length,formalInventorySamples:inv.runs.length,retainedExcludedWarmups:inv.storage.length,mainWindows:r.frames.runs.length,coverageWindows:r.coverage.runs.length,allRafIntervals:sum(result.windows.map(run=>run.frames)),allObservedLongTasks:result.allObservedLongTasks.length,allOver50RafSamples:result.slowRafSamples.length,missingFullEffectWindows:result.missingFullEffects.length,mainPairedWindows:result.frameComparisons.length,currentMaxLongerPairs:result.frameComparisons.filter(pair=>pair.maxCurrentMinusInputMs>0).length,currentMaxShorterPairs:result.frameComparisons.filter(pair=>pair.maxCurrentMinusInputMs<0).length,eternalCurrentMaxLongerPairs:result.frameComparisons.filter(pair=>pair.scene==='eternal-open'&&pair.maxCurrentMinusInputMs>0).length,eternalTotalPairs:result.frameComparisons.filter(pair=>pair.scene==='eternal-open').length};
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,summary:result.summary,failures:result.failures,fullStageObservation:result.fullStageObservation,inventoryByVersion:result.inventory.byVersion?Object.fromEntries(Object.entries(result.inventory.byVersion).map(([version,{allSamples,...summary}])=>[version,summary])):null,missingFullEffects:result.missingFullEffects},null,2));
process.exitCode=result.failures.length?1:0;
