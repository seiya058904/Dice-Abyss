import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('flame geometry is cached and material-batched while RAF opacity and cleanup remain live',async()=>{
 const keys=['document','Path2D','requestAnimationFrame','cancelAnimationFrame','matchMedia','innerWidth','innerHeight','devicePixelRatio','__effectsTest'];
 const original=Object.fromEntries(keys.map(key=>[key,globalThis[key]])),queue=new Map(),calls=[],paths=[],created=[],strokes=[];let id=0,filled=0,reduced=false,curves=0,images=0;
 class Path {constructor(){this.curves=0;paths.push(this);}moveTo(){}lineTo(){}closePath(){}quadraticCurveTo(){}bezierCurveTo(){this.curves++;}}
 const ctx={setTransform(){},clearRect(){calls.push('clear');},stroke(){strokes.push(this.strokeStyle);},fill(){filled++;},beginPath(){},closePath(){},ellipse(){},moveTo(){},lineTo(){},quadraticCurveTo(){},bezierCurveTo(){curves++;},drawImage(){images++;},fillRect(){},strokeRect(){},save(){},restore(){},translate(){},rotate(){},createRadialGradient(){return{addColorStop(){}};},createLinearGradient(){return{addColorStop(){}};}};
 const bounds={left:0,top:0,width:2100,height:600,bottom:600};
 const canvas={style:{},dataset:{},getBoundingClientRect:()=>bounds,getContext:()=>ctx};
 const stage={style:{},append(){},getBoundingClientRect:()=>bounds,querySelector:()=>null,querySelectorAll:()=>Array.from({length:6},(_,i)=>({classList:{contains:key=>key==='resonant'},getBoundingClientRect:()=>({left:i*300+100,top:200,width:200,height:200})}))};
 canvas.parentElement={getBoundingClientRect:()=>bounds,prepend(){}};
 globalThis.document={querySelector:selector=>selector==='.scene-fx'?canvas:selector==='.combat-stage'?stage:selector==='.chest-art'?{getBoundingClientRect:()=>({left:950,top:250,width:200,height:100})}:selector==='.loot-reveal .item-card'?{getBoundingClientRect:()=>({left:600,top:350,width:700,height:220})}:null,createElement:()=>{const element={getContext:()=>ctx};created.push(element);return element;}};
 globalThis.Path2D=Path;globalThis.requestAnimationFrame=fn=>{queue.set(++id,fn);return id;};globalThis.cancelAnimationFrame=n=>queue.delete(n);
 globalThis.matchMedia=()=>({matches:reduced});globalThis.innerWidth=3840;globalThis.innerHeight=2160;globalThis.devicePixelRatio=1;
 globalThis.__effectsTest={mountDiceSurface:()=>{calls.push('mount');return{draw:()=>calls.push('gpu'),stop:()=>calls.push('surface-stop')};},animateDice:(seed,sound,draw)=>{calls.push('animate');assert.equal(typeof sound,'function');assert.equal(typeof draw,'function');return()=>calls.push('dice-stop');}};
 try{
  const source=(await fs.readFile(new URL('../src/effects.js',import.meta.url),'utf8'))
   .replace("import { animateDice, THROW_DURATION } from './dice-motion.js';","const {animateDice}=globalThis.__effectsTest;const THROW_DURATION=1280;")
   .replace("import { mountDiceSurface } from './dice-renderer.js';","const {mountDiceSurface}=globalThis.__effectsTest;")
   .replace("'./visual-timeline.js'",JSON.stringify(new URL('../src/visual-timeline.js',import.meta.url).href));
  const {mountEffects}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const state={revision:4,phase:'combat',enemy:{shield:0,type:'combat'},lastRoll:{best:3,critical:true,follow:false,absorbed:0}},ui={busy:true,view:'game',event:'roll'},settings={effects:'full'};
  mountEffects(state,ui,settings,()=>{});assert.equal(queue.size,1);assert.equal(canvas.dataset.fxParticles,'100');assert.equal(canvas.dataset.fxFlames,'90');assert.equal(canvas.dataset.fxFlameTiles,'6');assert.equal(canvas.dataset.fxFlameHz,'30');assert(Number(canvas.dataset.fxPixels)<=660000);
  const run=now=>{const [n,callback]=queue.entries().next().value;queue.delete(n);callback(now);};
  const now=performance.now()+100;run(now);const first=paths.length,firstCurves=curves,fills=filled,firstImages=images,tiles=created.filter(c=>c.width>64);
  assert(curves>=270,'all ninety independent tongues and hot cores remain');assert.equal(fills,6,'each die rasterizes its tongues once');
  run(now);assert.equal(paths.length,first,'display-only frame reuses flame and bolt paths');assert.equal(filled,fills,'display frames do not rasterize flame paths again');assert(images>firstImages,'cached material is still displayed every RAF');assert.equal(curves,firstCurves);
  run(now+34);assert(curves>firstCurves,'next 30 Hz step refreshes geometry');
  mountEffects(state,{...ui,rolling:true},settings,()=>{});assert(tiles.every(c=>c.width===1&&c.height===1),'scene material buffers release on cancellation');assert(calls.indexOf('surface-stop')<calls.lastIndexOf('mount'));assert.equal(queue.size,0,'rolling delegates only to animateDice');assert.equal(canvas.dataset.fxKind,'dice-only');
  mountEffects(state,ui,{effects:'low'},()=>{});assert(calls.includes('dice-stop'));assert.equal(queue.size,0);assert.equal(calls.at(-1),'mount','low effects still mount the static GPU surface');
  reduced=true;mountEffects(state,ui,settings,()=>{});assert.equal(queue.size,0);assert.equal(calls.at(-1),'mount','reduced motion still mounts the static GPU surface');
  reduced=false;
  const finish={...state,enemy:{type:'boss',shield:0},lastRoll:{...state.lastRoll,killed:true,phaseChanged:true,absorbed:50,follow:true}};
  mountEffects(finish,ui,settings,()=>{});assert.equal(canvas.dataset.fxParticles,'142');assert.equal(canvas.dataset.fxFlames,'108');run(performance.now()+100);assert(strokes.includes('#d28aff'),'phase impact remains');assert(strokes.includes('#e6fbff'),'shield-break fragments remain');assert(strokes.includes('#ffd45b'),'boss finisher remains');
  for(const grade of [0,1,2,3]){
   mountEffects({revision:4,phase:'loot',loot:{item:{rarity:grade}}},{...ui,event:'open'},settings,()=>{});assert.equal(canvas.dataset.fxParticles,String([30,58,86,132][grade]));assert.equal(canvas.dataset.fxRewardSquares,String(Math.ceil([30,58,86,132][grade]/3)));assert.equal(canvas.dataset.fxRewardColumns,String([3,5,7,9][grade]));
   const roi=JSON.parse(canvas.dataset.fxRoi);assert(roi.x>=0&&roi.y>=0&&roi.x+roi.width<=2100&&roi.y+roi.height<=600);assert(roi.width<2100,'reward viewport excludes unused horizontal area');
   if(grade===3){assert.equal(canvas.dataset.fxRewardRims,'4');assert(roi.x<=592&&roi.x+roi.width>=1308&&roi.y+roi.height>=578,'all four transient card edges are inside ROI');assert.equal(roi.y,0,'upward columns keep original top boundary');}
   const baked=filled;run(performance.now()+100);assert.equal(filled,baked,'reward material is baked once, not rerasterized per RAF');
  }
  for(const [grade,motif]of [[4,'seal'],[5,'spiral'],[6,'origin-star'],[7,'eternal-orbits']]){
   mountEffects({revision:4,phase:'loot',loot:{item:{rarity:grade}}},{...ui,event:'open'},settings,()=>{});
   assert.equal(canvas.dataset.fxRewardMotif,motif);assert.equal(canvas.dataset.fxRewardColumns,'9');assert.equal(canvas.dataset.fxRewardRims,'4');assert.equal(canvas.dataset.fxParticles,'132');
   assert(Number(canvas.dataset.fxPixels)<=660000,'high-tier silhouettes retain the same4K canvas budget');
   const roi=JSON.parse(canvas.dataset.fxRoi);assert(roi.x>=0&&roi.y>=0&&roi.x+roi.width<=2100&&roi.y+roi.height<=600);
   const baked=filled;run(performance.now()+100);assert.equal(filled,baked,'high-tier outlines add no per-RAF material fills');
  }
  const hidden=new Proxy({},{get(){throw Error('unrevealed quality must not be read');}});
  mountEffects({revision:4,phase:'chest',chest:hidden},{...ui,event:'open'},settings,()=>{});assert.equal(canvas.dataset.fxKind,'chest-charge');assert.equal(canvas.dataset.fxParticles,'22');assert.equal(canvas.dataset.fxRewardColumns,'3');
  mountEffects(state,ui,{effects:'low'},()=>{});assert.equal(queue.size,0);
 }finally{for(const key of keys){if(original[key]===undefined)delete globalThis[key];else globalThis[key]=original[key];}}
});
