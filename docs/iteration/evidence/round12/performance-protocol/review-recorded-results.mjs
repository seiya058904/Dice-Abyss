// Offline read-only audit of recorded performance evidence. No browser, game
// transition, benchmark, test runner, compression or external request is used.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join,basename,dirname,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';

// Portable path adapter for the unchanged recorded-evidence assertions below.
// All 61 groups still require both real source trees. Missing V5.11 source is
// a failed source check, never a skipped or fabricated source assertion.
const options={},allowed=new Set(['main','reverse','mapping','input-source','current-source','output']);
for(let i=2;i<process.argv.length;i++){
 const option=process.argv[i];
 if(option==='--help'){
  console.log('Usage: node review-recorded-results.mjs --input-source /path/to/original-V5.11/Dice-Abyss [--current-source /path/to/current/Dice-Abyss] [--main /path/to/main] [--reverse /path/to/reverse] [--mapping /path/to/RETAINED_ARTIFACTS.json] [--output /tmp/new-result.json]');
  process.exit(0);
 }
 assert(option.startsWith('--')&&allowed.has(option.slice(2)),'Unknown option: '+option);
 const key=option.slice(2),value=process.argv[++i];
 assert(value&&!value.startsWith('--'),'Missing value for '+option);assert(!(key in options),'Duplicate option: '+option);options[key]=value;
}
const scriptPath=fileURLToPath(import.meta.url),scriptDir=dirname(scriptPath),projectRoot=resolve(scriptDir,'../../../../..');
const evidenceRoot=resolve(scriptDir,'../performance');
const first=resolve(options.main||join(evidenceRoot,'main')),second=resolve(options.reverse||join(evidenceRoot,'reverse'));
const mappingPath=resolve(options.mapping||join(evidenceRoot,'RETAINED_ARTIFACTS.json')),mappingRoot=dirname(mappingPath);
const inputSource=options['input-source']?resolve(options['input-source']):null,currentSource=resolve(options['current-source']||projectRoot);
const output=resolve(options.output||join(tmpdir(),'dice-abyss-round12-offline-review.json'));
const inside=(root,path)=>{const local=relative(root,path);return local===''||(!local.startsWith('..'+sep)&&local!=='..'&&!local.startsWith(sep));};
// Output cannot replace an existing file or add files to either evidence/source
// tree. The exclusive final write also prevents an overwrite race.
for(const root of [projectRoot,first,second,mappingRoot,currentSource,inputSource].filter(Boolean))assert(!inside(root,output),'Use an output outside evidence and source trees: '+output);
assert(!existsSync(output),'Refusing to overwrite an existing output: '+output);
const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const read=path=>readFileSync(path,'utf8'),json=path=>JSON.parse(read(path));
const retained=json(mappingPath),mapped=new Map();
assert.equal(retained.artifacts.length,18,'All 18 original artifact mappings must remain');
for(const entry of retained.artifacts){
 assert(!mapped.has(entry.originalArtifact),'Duplicate original artifact: '+entry.originalArtifact);
 const path=resolve(mappingRoot,entry.storedArtifact);assert(inside(mappingRoot,path),'Stored artifact must remain within the mapping directory');
 const raw=readFileSync(path);assert.equal(raw.length,entry.bytes,entry.originalArtifact+' retained bytes');assert.equal(sha(raw),entry.sha256,entry.originalArtifact+' retained SHA');
 mapped.set(entry.originalArtifact,{...entry,path});
}
const logicalHtml=retained.artifacts.filter(entry=>entry.originalArtifact.endsWith('.html'));
assert.equal(logicalHtml.length,retained.originalHtmlCount);assert.equal(logicalHtml.length,12);assert.equal(new Set(logicalHtml.map(entry=>entry.storedArtifact)).size,retained.storedHtmlCount);assert.equal(retained.storedHtmlCount,4);
function recordedPath(dir,file){
 const batch=dir===first?'main':dir===second?'reverse':null;assert(batch,'Unknown evidence directory');
 const entry=mapped.get(batch+'/'+file);assert(entry,'Missing retained-artifact mapping: '+batch+'/'+file);
 const direct=join(dir,file),path=existsSync(direct)?direct:entry.path,raw=readFileSync(path);
 assert.equal(raw.length,entry.bytes,file+' resolved bytes');assert.equal(sha(raw),entry.sha256,file+' resolved SHA');return path;
}
function sourceRoot(r,label){
 const version=r.environments.find(env=>env.label===label).http.release;
 assert(['5.11.0','5.12.0'].includes(version),'Unexpected recorded version: '+version);
 if(version==='5.11.0')assert(inputSource,'All 61 groups require --input-source /path/to/original-V5.11/Dice-Abyss; the old-source check is not skipped');
 return version==='5.11.0'?inputSource:currentSource;
}
const result={scope:'Offline independent audit of complete recorded samples and artifacts; no timing replay or source game execution.',inputs:[first,second],checks:[],failures:[],batches:[]};
result.portablePaths={script:scriptPath,scriptSha256:sha(readFileSync(scriptPath)),originalReviewSha256:'a1e1c76555d1acc65a40bb7abe160508af92582a60d3c983186cdc8541b97a22',mapping:mappingPath,mappingSha256:sha(readFileSync(mappingPath)),verifiedOriginalArtifactMappings:mapped.size,logicalHtmlFiles:logicalHtml.length,storedHtmlFiles:retained.storedHtmlCount,inputSource,currentSource,output,scope:'Path resolution and byte-exact retained-artifact aliases only; original numerical, state, DOM and source assertions are retained.'};
const check=(name,run)=>{try{const details=run();result.checks.push({name,status:'PASS',...details});}catch(error){result.failures.push({name,message:error.message});}};
const close=(a,b,what)=>assert(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-6,`${what}: ${a} vs ${b}`);
const sum=a=>a.reduce((total,value)=>total+value,0);
const stats=values=>{assert(values.length&&values.every(value=>Number.isFinite(value)&&value>=0));const a=values.toSorted((x,y)=>x-y),q=p=>a[Math.floor((a.length-1)*p)];return {samples:a.length,p50:q(.5),p95:q(.95),p99:q(.99),max:a.at(-1),min:a[0]};};
const groups=(rows,key)=>{const map=new Map();for(const row of rows){const k=key(row);if(!map.has(k))map.set(k,[]);map.get(k).push(row);}return map;};
function sourcePaths(root,dir='src'){
 const paths=[];for(const entry of readdirSync(join(root,dir),{withFileTypes:true})){const path=dir+'/'+entry.name;if(entry.isDirectory())paths.push(...sourcePaths(root,path));else if(entry.isFile()&&/\.(?:js|css)$/.test(path))paths.push(path);}return paths;
}
function artifact(dir,meta){
 const raw=readFileSync(recordedPath(dir,meta.file));assert.equal(sha(raw),meta.sha256,meta.file+' SHA');if(meta.utf8Bytes!==undefined)assert.equal(raw.length,meta.utf8Bytes,meta.file+' UTF-8 bytes');if(meta.characters!==undefined)assert.equal(raw.toString('utf8').length,meta.characters,meta.file+' characters');return raw.toString('utf8');
}
function pairing(section,name){
 assert.equal(section.runs.length,section.pairOrders.length*2,name+' complete pairs');
 for(const [index,pair]of section.pairOrders.entries()){
  assert.equal(pair.pair,index+1);assert.deepEqual(pair.order,index%2?['after','baseline']:['baseline','after']);
  const runs=section.runs.slice(index*2,index*2+2);assert.deepEqual(runs.map(run=>run.label),pair.order);
  for(const [position,run]of runs.entries()){assert.equal(run.pair,pair.pair);assert.equal(run.position,position+1);assert.deepEqual(run.pairOrder,pair.order);assert.equal(run.repeat,pair.repeat);for(const key of ['scene','width','height','effects'])if(pair[key]!==undefined)assert.equal(run[key],pair[key]);}
 }
}
function audit(dir){
 const r=json(recordedPath(dir,'performance-round.json')),name=basename(dir),version=Object.fromEntries(r.environments.map(env=>[env.label,env.http.release]));
 const batch={name,reportSha256:sha(readFileSync(recordedPath(dir,'performance-round.json'))),mode:r.mode,status:r.status,startedAt:r.startedAt,completedAt:r.completedAt,scriptSha256:r.scriptSha256,versionByLabel:version,contextCreationVersions:r.environments.map(env=>env.http.release),inventoryByVersion:{},inventoryPairs:[],windows:[],slowRafSamples:[],missingEffects:[],sourceIdentity:{}};
 result.batches.push(batch);
 check(name+' source identities, runtime HTTP and local metadata',()=>{
  assert.deepEqual(r.sourceBefore,r.sourceAfter);assert.equal(r.sourceStable,true);assert.equal(r.errors.length,0);assert.equal(r.activeCase,null);assert.equal(r.activeMeasurement,null);
  assert.deepEqual(Object.values(version).toSorted(),['5.11.0','5.12.0']);assert.equal(r.browserVersion,'155.0.8059.84');
  const scripts=[...new Set(['baseline','after'].map(label=>sourceRoot(r,label)))].map(root=>join(root,'scripts/qa-performance-round12.mjs')).filter(existsSync);
  assert(scripts.some(path=>sha(readFileSync(path))===r.scriptSha256),'The measurement script may live in either mapped tree; its exact SHA must match');
  const expectedPaths=[...new Set(['index.html','package.json',...sourcePaths(sourceRoot(r,'after')),...sourcePaths(sourceRoot(r,'baseline'))])].toSorted();
  for(const label of ['baseline','after']){
   const root=sourceRoot(r,label),files=r.sourceBefore[label],http=r.environments.find(env=>env.label===label).http;
   assert.deepEqual(files.map(row=>row.file),expectedPaths);assert.equal(files.length,http.assets.length);
   assert.equal(json(join(root,'package.json')).version,version[label]);assert.equal(http.documentStatus,200);assert.equal(http.documentSha256,sha(readFileSync(join(root,'index.html'))));
   const duplicate=r.sourceHttpIdentity.find(row=>row.label===label);const {label:_,...withoutLabel}=duplicate;assert.deepEqual(withoutLabel,http);
   let runtimePresent=0,runtimeAbsent=0,package404=0;
   for(const file of files){
    const path=join(root,file.file),served=http.assets.find(asset=>asset.file===file.file);assert(served);assert.equal(existsSync(path),file.exists);
    if(file.exists){const raw=readFileSync(path);assert.equal(raw.length,file.bytes);assert.equal(sha(raw),file.sha256);}else{assert.equal(file.bytes,0);assert.equal(file.sha256,null);}
    if(file.file==='package.json'){assert.equal(served.status,404);assert.equal(served.scope,'local-metadata-intentionally-not-served');package404++;}
    else if(file.exists){assert.equal(served.status,200);assert.equal(served.sha256,file.sha256);assert.equal(served.bytes,file.bytes);runtimePresent++;}
    else{assert([404,410].includes(served.status));runtimeAbsent++;}
   }
   for(const url of http.linkedStylesheets){const file=new URL(url).pathname.slice(1);assert(files.some(row=>row.file===file&&row.exists));}
   batch.sourceIdentity[version[label]]={root,localFiles:files.length,runtimePresent,runtimeAbsent,package404,release:http.release,documentUrl:http.documentUrl,renderer:r.environments.find(env=>env.label===label).renderer};
  }
  return {pathsPerVersion:expectedPaths.length,sourceBeforeAfterAndLocalFilesExact:true,allRuntimeHttpBytesExact:true};
 });
 check(name+' complete fixture manifest',()=>{assert.deepEqual(json(recordedPath(dir,'fixture-manifest.json')).manifest,r.fixtureManifest);assert.equal(r.fixtureManifest.length,10);assert(r.fixtureManifest.every(row=>row.seed===r.seed));return {fixtures:r.fixtureManifest.length};});
 const inv=r.inventory,diff=json(recordedPath(dir,inv.domDifferences.file)),domByVersion={};
 check(name+' complete 60-card artifacts and all lossless differences',()=>{
  artifact(dir,inv.domDifferences);assert.equal(diff.cards.length,60);assert.equal(inv.domDifferences.cardsCompared,60);
  const changed=diff.cards.filter(card=>!card.identical).length;assert.equal(changed,inv.domDifferences.cardsDifferent);assert.equal(changed,diff.cardsDifferent);
  for(const label of ['baseline','after']){
   const oracle=inv.oracles[label],cards=artifact(dir,oracle.cardHtml),actual=artifact(dir,inv.actualReferences[label]),game=artifact(dir,oracle.sourceGameHtml);
   assert.equal(actual,cards);assert.equal(oracle.cards,60);assert.equal(oracle.ids.length,60);assert.equal(new Set(oracle.ids).size,60);
   assert.equal(sha(oracle.ids),oracle.cardIdsSha256);assert.equal(sha(oracle.cardStates),oracle.cardStatesSha256);assert.equal(sha(oracle.completeItemStates),oracle.completeItemStatesSha256);
   assert.deepEqual(oracle.completeItemStates.map(row=>row.item.id),oracle.ids);assert.deepEqual(oracle.cardStates.map(row=>row.id),oracle.ids);
   assert.equal(oracle.viewsSourceSha256,r.sourceBefore[label].find(file=>file.file==='src/views.js').sha256);assert.equal(oracle.sourceStateUnchanged,true);
   assert.equal(diff.cards.map(pair=>pair[label].html).join(''),cards);assert.equal((cards.match(/<article class="item-card /g)||[]).length,60);assert.equal((game.match(/<article class="item-card /g)||[]).length,60);
   for(const [index,pair]of diff.cards.entries()){assert.equal(pair.index,index);assert.equal(pair.id,oracle.ids[index]);assert.equal(sha(pair[label].html),pair[label].sha256);assert.equal(Buffer.byteLength(pair[label].html),pair[label].utf8Bytes);}
   domByVersion[version[label]]={cardsSha256:sha(cards),cardBytes:Buffer.byteLength(cards),gameHtmlSha256:sha(game),gameHtmlBytes:Buffer.byteLength(game),fullStateSha256:oracle.stateSha256,rawSaveSha256:oracle.rawStateSha256,cardStatesSha256:oracle.cardStatesSha256,completeItemStatesSha256:oracle.completeItemStatesSha256};
  }
  for(const pair of diff.cards){
   const a=pair.baseline.html,b=pair.after.html;assert.equal(pair.identical,a===b);
   if(pair.difference){const d=pair.difference;assert.equal(a.slice(d.commonPrefixCharacters,a.length-d.commonSuffixCharacters),d.removed);assert.equal(b.slice(d.commonPrefixCharacters,b.length-d.commonSuffixCharacters),d.added);assert.equal(a.slice(0,d.commonPrefixCharacters)+d.added+a.slice(a.length-d.commonSuffixCharacters),b);}else assert.equal(a,b);
  }
  assert.deepEqual(inv.oracles.baseline.cardStates,inv.oracles.after.cardStates);assert.deepEqual(inv.oracles.baseline.completeItemStates,inv.oracles.after.completeItemStates);assert.deepEqual(inv.oracles.baseline.ids,inv.oracles.after.ids);
  assert.equal(inv.oracles.baseline.stateSha256,inv.oracles.after.stateSha256);assert.equal(inv.oracles.baseline.rawStateSha256,inv.oracles.after.rawStateSha256);
  assert.equal(inv.cardHtmlIdentical,diff.completeHtmlIdentical);assert.equal(inv.cardHtmlIdentical,false);assert.equal(inv.cardHtmlMatchedOwnSource,true);assert.equal(inv.cardSetsIdentical,true);assert.equal(inv.cardStatesIdentical,true);assert.equal(inv.completeStateIdentical,true);
  batch.dom={byVersion:domByVersion,cardsCompared:60,cardsChanged:changed,cardBytesAdded:domByVersion['5.12.0'].cardBytes-domByVersion['5.11.0'].cardBytes};return batch.dom;
 });
 check(name+' all inventory samples, warmups, ordering and full state references',()=>{
  assert.equal(inv.requestedSamplesPerVariant,12);assert.equal(inv.runs.length,24);assert.equal(inv.warmupsPerVariant,1);assert.equal(inv.storage.length,2);pairing(inv,'inventory');
  const fixture=r.fixtureManifest.find(row=>row.name==='inventory-10000');assert.equal(fixture.items,10000);
  for(const store of inv.storage){assert.equal(store.ok,true);assert.equal(store.writes.main.ok,true);assert.equal(store.writes.mirror.ok,true);assert.equal(store.writes.settings.ok,true);assert.equal(store.mainCharacters,fixture.rawCharacters);assert.equal(store.mirrorCharacters,fixture.rawCharacters);assert.equal(store.warmupMs,store.warmup.elapsedMs);}
  for(const run of [...inv.runs,...inv.storage.map(store=>({...store.warmup,label:store.label}))]){
   const o=inv.oracles[run.label];assert(Number.isFinite(run.elapsedMs)&&run.elapsedMs>0);assert.equal(run.trusted,true);assert.equal(run.cards,60);assert.equal(run.cardIdsSha256,o.cardIdsSha256);assert.equal(run.cardStatesSha256,o.cardStatesSha256);assert.equal(run.cardHtmlSha256,o.cardHtml.sha256);assert.equal(run.cardHtmlUtf8Bytes,o.cardHtml.utf8Bytes);assert.equal(run.expectedCardHtmlSha256,o.cardHtml.sha256);assert.equal(run.completeSourceDomMatched,true);assert.equal(run.completeHtmlStableWithinVariant,true);assert.equal(run.stateUnchanged,true);assert.equal(run.mirrorUnchanged,true);assert.equal(run.stateSha256,fixture.stateSha256);
  }
  for(const label of ['baseline','after']){
   const rows=inv.runs.filter(run=>run.label===label),summary=stats(rows.map(run=>run.elapsedMs));assert.deepEqual(summary,inv.aggregate[label]);
   batch.inventoryByVersion[version[label]]={...summary,mean:sum(rows.map(row=>row.elapsedMs))/rows.length,allChronologicalSamples:rows.map(row=>({repeat:row.repeat,pair:row.pair,position:row.position,elapsedMs:row.elapsedMs})),byPairPosition:Object.fromEntries([1,2].map(position=>[position,stats(rows.filter(row=>row.position===position).map(row=>row.elapsedMs))]))};
  }
  const a=inv.aggregate.after,b=inv.aggregate.baseline;assert.deepEqual(inv.comparison,{medianDeltaMs:a.p50-b.p50,medianPercentChange:(a.p50/b.p50-1)*100,p95DeltaMs:a.p95-b.p95,maxDeltaMs:a.max-b.max});
  for(const [pair,rows]of groups(inv.runs,run=>run.pair)){const old=rows.find(row=>version[row.label]==='5.11.0'),current=rows.find(row=>version[row.label]==='5.12.0');batch.inventoryPairs.push({pair,versionsInOrder:rows.map(row=>version[row.label]),oldMs:old.elapsedMs,currentMs:current.elapsedMs,currentMinusOldMs:current.elapsedMs-old.elapsedMs});}
  batch.currentSlowerPairs=batch.inventoryPairs.filter(pair=>pair.currentMinusOldMs>0).length;batch.currentFasterPairs=batch.inventoryPairs.filter(pair=>pair.currentMinusOldMs<0).length;
  return {formalSamples:24,retainedExcludedWarmups:2,fullStateSha256:fixture.stateSha256,rawCharactersPerStoredCopy:fixture.rawCharacters};
 });
 for(const sectionName of ['frames','coverage']){
  const section=r[sectionName];if(!section.runs.length){assert.equal(section.status,'NOT_RUN');continue;}
  check(name+' '+sectionName+' sample counts and alternating ordering',()=>{pairing(section,sectionName);assert.equal(section.requestedWindowMs,4200);assert.equal(section.requestedRepeatsPerCell,1);assert.equal(section.runs.length,sectionName==='frames'?32:14);return {windows:section.runs.length};});
  for(const [index,run]of section.runs.entries())check(name+' '+sectionName+' raw window '+(index+1),()=>{
   const a=run.rafIntervalsMs,summary=stats(a);assert.equal(run.frames,a.length);close(sum(a),run.actualWindowMs,'window sum');close(run.windowEndTimeMs-run.windowStartTimeMs,run.actualWindowMs,'timestamps');assert(sum(a.slice(0,-1))<4200);assert(sum(a)>=4200);close(run.actualWindowMs-4200,run.windowOverrunMs,'window overrun');assert.equal(run.firstFrameDelayMs,a[0]);for(const key of ['p50','p95','p99','max'])assert.equal(run[key],summary[key]);assert.equal(run.over50,a.filter(value=>value>50).length);assert.equal(run.over100,a.filter(value=>value>100).length);
   const tasks=run.longTasks,observed=tasks.observedSamples;assert.equal(tasks.supported,true);
   for(const task of observed){assert.equal(task.entryType,'longtask');assert.equal(task.start,task.startTime);assert(Number.isFinite(task.duration)&&task.duration>=50);assert(Array.isArray(task.attribution));}
   const overlapping=observed.filter(task=>task.start<run.windowEndTimeMs&&task.start+task.duration>run.windowStartTimeMs);
   const expected=overlapping.map(task=>({...task,startOffsetMs:task.start-run.windowStartTimeMs,durationMs:task.duration,overlapMs:Math.max(0,Math.min(run.windowEndTimeMs,task.start+task.duration)-Math.max(run.windowStartTimeMs,task.start))}));
   assert.deepEqual(tasks.samples,expected);assert.equal(tasks.count,expected.length);assert.equal(tasks.totalOverlapMs,sum(expected.map(task=>task.overlapMs)));assert.equal(tasks.maxMs,Math.max(0,...expected.map(task=>task.duration)));assert.deepEqual(tasks.largest,overlapping.toSorted((a,b)=>b.duration-a.duration).slice(0,3).map(task=>({startOffsetMs:task.start-run.windowStartTimeMs,durationMs:task.duration})));
   const fixture=r.fixtureManifest.find(row=>row.name===run.scene);assert(fixture);assert.equal(run.fixtureSha256,fixture.stateSha256);assert.equal(run.trusted,true);assert.equal(run.visibility,'visible');assert.equal(run.exactTransition,true);assert.equal(run.mirrorSaved,true);assert.equal(run.logBefore,6);assert.equal(run.logAfter,6);assert.equal(run.logMaxCharacters,180);
   const target=run.scene==='boss-burst'?'combat':`loot-${run.rarity}`,effectObserved=run.effects==='low'||run.effectKinds.includes(target);assert.equal(run.effectObserved,effectObserved);
   const brief={section:sectionName,index:index+1,version:version[run.label],scene:run.scene,width:run.width,height:run.height,effects:run.effects,frames:run.frames,actualWindowMs:run.actualWindowMs,overrunMs:run.windowOverrunMs,p50:run.p50,p95:run.p95,p99:run.p99,max:run.max,over50:run.over50,over100:run.over100,longTasks:tasks.count,longTaskOverlapMs:tasks.totalOverlapMs,effectKinds:run.effectKinds,effectObserved:run.effectObserved,persistedSha256:run.persistedSha256};
   batch.windows.push(brief);if(!effectObserved)batch.missingEffects.push(brief);
   let offset=0;for(const [sample,value]of a.entries()){if(value>50)batch.slowRafSamples.push({section:sectionName,window:index+1,version:version[run.label],scene:run.scene,width:run.width,height:run.height,effects:run.effects,sample:sample+1,startOffsetMs:offset,durationMs:value});offset+=value;}
   return {retainedRafIntervals:a.length,observedLongTasks:observed.length,overlappingLongTasks:tasks.count};
  });
  check(name+' '+sectionName+' all aggregate cells and persisted-state hashes',()=>{
   const all=[...groups(section.runs,run=>[run.label,run.scene,run.width,run.height,run.effects].join('/')).values()];
   assert.equal(all.length,section.aggregate.length);
   const rebuilt=all.map(runs=>({label:runs[0].label,scene:runs[0].scene,width:runs[0].width,height:runs[0].height,effects:runs[0].effects,repeats:runs.length,medianRunP50:stats(runs.map(run=>run.p50)).p50,medianRunP95:stats(runs.map(run=>run.p95)).p50,worstFrameMs:Math.max(...runs.map(run=>run.max)),longTasks:sum(runs.map(run=>run.longTasks.count)),longTaskOverlapMs:sum(runs.map(run=>run.longTasks.totalOverlapMs)),observedAllExpectedEffects:runs.every(run=>run.effectObserved)}));assert.deepEqual(rebuilt,section.aggregate);
   for(const runs of groups(section.runs,run=>run.scene).values())assert.equal(new Set(runs.map(run=>run.persistedSha256)).size,1,'Complete committed state hashes must agree across versions and viewports for each scene');
   return {aggregateCells:all.length};
  });
 }
 batch.retainedRafIntervals=sum(batch.windows.map(row=>row.frames));batch.retainedObservedLongTasks=sum(['frames','coverage'].flatMap(section=>r[section].runs.map(run=>run.longTasks.observedSamples.length)));
 batch.expectedLimitations={fewerThanThreeMainRepeats:r.frames.runs.length>0&&r.frames.requestedRepeatsPerCell<3,unobservedFullEffectWindows:batch.missingEffects.length,errors:r.errors.length};
 check(name+' final limitation status',()=>{assert.equal(r.status,batch.expectedLimitations.fewerThanThreeMainRepeats||batch.missingEffects.length?'MEASURED_WITH_LIMITATIONS':'MEASURED');return batch.expectedLimitations;});
 return {report:r,batch};
}

const a=audit(first),b=audit(second);
check('cross-batch exact fixtures, per-version source identities and complete DOM',()=>{
 assert.deepEqual(a.report.fixtureManifest,b.report.fixtureManifest);assert.equal(a.report.scriptSha256,b.report.scriptSha256);
 for(const version of ['5.11.0','5.12.0']){
  const firstLabel=Object.keys(a.batch.versionByLabel).find(label=>a.batch.versionByLabel[label]===version),secondLabel=Object.keys(b.batch.versionByLabel).find(label=>b.batch.versionByLabel[label]===version);
  assert.deepEqual(a.report.sourceBefore[firstLabel],b.report.sourceBefore[secondLabel]);assert.deepEqual(a.batch.dom.byVersion[version],b.batch.dom.byVersion[version]);
 }
 assert.deepEqual(a.batch.contextCreationVersions,['5.11.0','5.12.0']);assert.deepEqual(b.batch.contextCreationVersions,['5.12.0','5.11.0']);return {labelsMappedByHttpReleaseAndLocalPackage:true,sourceAndDomPerVersionIdenticalAcrossBatches:true};
});
result.inventoryComparison={batches:result.batches.map(batch=>({name:batch.name,contextCreationVersions:batch.contextCreationVersions,old:batch.inventoryByVersion['5.11.0'],current:batch.inventoryByVersion['5.12.0'],p50CurrentMinusOldMs:batch.inventoryByVersion['5.12.0'].p50-batch.inventoryByVersion['5.11.0'].p50,p95CurrentMinusOldMs:batch.inventoryByVersion['5.12.0'].p95-batch.inventoryByVersion['5.11.0'].p95,maxCurrentMinusOldMs:batch.inventoryByVersion['5.12.0'].max-batch.inventoryByVersion['5.11.0'].max,currentSlowerPairs:batch.currentSlowerPairs,currentFasterPairs:batch.currentFasterPairs})),pooledDescriptiveOnly:Object.fromEntries(['5.11.0','5.12.0'].map(version=>[version,stats(result.batches.flatMap(batch=>batch.inventoryByVersion[version].allChronologicalSamples.map(row=>row.elapsedMs)))])),pooledNotAReplacementForTwoBatches:true};
const full4k=a.batch.windows.filter(run=>run.section==='frames'&&run.scene==='eternal-open'&&run.width===3840&&run.effects==='full');
const framePairs=[...groups(a.batch.windows.filter(run=>run.section==='frames'),run=>[run.scene,run.width,run.height,run.effects].join('/')).values()].map(rows=>{
 const old=rows.find(row=>row.version==='5.11.0'),current=rows.find(row=>row.version==='5.12.0');
 return {scene:old.scene,width:old.width,height:old.height,effects:old.effects,old,current,maxCurrentMinusOldMs:current.max-old.max,p95CurrentMinusOldMs:current.p95-old.p95};
});
result.mainFrameComparison={pairs:framePairs,currentMaxLongerPairs:framePairs.filter(pair=>pair.maxCurrentMinusOldMs>0).length,totalPairs:framePairs.length,eternalMaxLongerPairs:framePairs.filter(pair=>pair.scene==='eternal-open'&&pair.maxCurrentMinusOldMs>0).length,eternalTotalPairs:framePairs.filter(pair=>pair.scene==='eternal-open').length,fullStageObserved:Object.fromEntries(['5.11.0','5.12.0'].map(version=>{const rows=a.batch.windows.filter(run=>run.section==='frames'&&run.version===version&&run.effects==='full');return [version,{observed:rows.filter(row=>row.effectObserved).length,windows:rows.length}];})),scope:'One window per version/cell, no reversed frame matrix. The inventory reversal does not close or explain the independently observed frame slowdowns.'};
result.requiredDisclosure4kEternal={windows:full4k,scope:'One measured window per version. The current build has a much longer retained interval and did not expose the target loot-7 stage during its measured window; this case remains an open software-renderer performance/coverage risk.'};
const fileGroups=new Map();for(const dir of [first,second])for(const entry of logicalHtml.filter(entry=>entry.originalArtifact.startsWith((dir===first?'main':'reverse')+'/'))){const file=basename(entry.originalArtifact),path=join(dir,file),raw=readFileSync(recordedPath(dir,file)),key=sha(raw);if(!fileGroups.has(key))fileGroups.set(key,{sha256:key,bytes:raw.length,paths:[]});fileGroups.get(key).paths.push(path);}
result.duplicateHtml={groups:[...fileGroups.values()],totalBytes:sum([...fileGroups.values()].map(group=>group.bytes*group.paths.length)),uniqueBytes:sum([...fileGroups.values()].map(group=>group.bytes)),potentialByteSavingsWithoutDeletingContent:sum([...fileGroups.values()].map(group=>group.bytes*(group.paths.length-1))),action:'No evidence is written or changed. Logical original HTML paths are resolved through the verified RETAINED_ARTIFACTS mapping to byte-identical shared bodies. Counts and duplicate-byte arithmetic retain all 12 original HTML references; all six original JSON files remain unchanged.'};
result.interpretation={inventory:'The direction reverses between complete batches after reversing context creation order. These data do not support a stable speed improvement or a fixed version-caused slowdown. This is an association with batch/order conditions, not proof that creation order is the bottleneck. All 48 timed inventory samples and four excluded-but-retained warmups remain visible.',frames:'The main matrix uses one window per cell. Current-build maximum intervals are longer in 13/16 paired cells, including all 8 eternal-open cells; this signal needs to remain visible even though its repeatability and version attribution are not established. No reversed frame matrix was measured. All five unobserved full-effect windows and every slow callback remain in the data. Near-16.7ms p50 and the fixed floor-rank p95/p99 can coexist with single multi-second gaps; use complete traces/max/overrun to assess stalls.',stateAndDom:'Offline checks validate artifact bytes, hashes, all 60 complete card pairs, lossless differences, every recorded state/DOM assertion and cross-scene committed-state hash consistency. Full decoded browser saves and a fresh native DOM parse were not re-executed in this offline review; those exact comparisons are performed by the recorded, fingerprinted measurement script.',longTasks:'Only two long tasks were recorded across 6204 RAF intervals in the main run. Missing long-task entries during large callback gaps do not identify the responsible subsystem or establish that the browser/main thread was fast.',hardware:'ANGLE SwiftShader software-rendered Chromium data are not physical GPU or physical 4K60 validation.'};
result.offlineHarnessCorrection='The first offline audit assumed --source contained the new measurement script. In the intentionally reversed batch --source is the old tree, while the same current-tree script drives both origins. The checker now locates the fingerprinted script in either mapped tree. The initial offline path error is retained separately and is not a product or measurement failure.';
result.summary={status:result.failures.length?'FAIL':'PASS',checksPassed:result.checks.length,failures:result.failures.length,inventoryTimedSamples:sum(result.batches.map(batch=>sum(Object.values(batch.inventoryByVersion).map(row=>row.samples)))),frameWindows:a.batch.windows.length,allRafIntervals:a.batch.retainedRafIntervals,allObservedLongTasks:a.batch.retainedObservedLongTasks,missingFullEffectWindows:a.batch.missingEffects.length};
writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({summary:result.summary,failures:result.failures,inventory:result.inventoryComparison.batches.map(batch=>({name:batch.name,p50Old:batch.old.p50,p50Current:batch.current.p50,p95Old:batch.old.p95,p95Current:batch.current.p95,maxOld:batch.old.max,maxCurrent:batch.current.max,currentSlowerPairs:batch.currentSlowerPairs,currentFasterPairs:batch.currentFasterPairs})),pooledDescriptiveOnly:result.inventoryComparison.pooledDescriptiveOnly,duplicateHtml:result.duplicateHtml,output},null,2));process.exitCode=result.failures.length?1:0;
