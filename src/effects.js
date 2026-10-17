import { animateDice, THROW_DURATION } from './dice-motion.js';
import { mountDiceSurface } from './dice-renderer.js';

// Revision-seeded visuals only. Saved combat state and game RNG are never changed.
const PIXEL_BUDGET=840000,TAU=Math.PI*2,FLAME_STEP=1000/30;
const colors={fire:['#ff721a','#ffd247','#fff9d0'],red:['#e92739','#ff8050','#fff0cd'],blue:['#1471ff','#45cfff','#e6fbff'],purple:['#7934eb','#d28aff','#f8e4ff'],white:['#a6b5c7','#e5eef9','#ffffff'],gold:['#df841a','#ffd45b','#fff6bd']};
Object.assign(colors,{mythic:['#af3945','#ff8992','#ffe9df'],ancient:['#247f72','#76ddcc','#e0fff5'],origin:['#b1842c','#eed59c','#ffffea'],eternal:['#73899e','#ccedff','#ffffff']});
const textures=new Map();
let cancel=()=>{};
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));

function texture(key,beam=false){
 const id=`${key}:${beam}`;if(textures.has(id))return textures.get(id);
 const canvas=document.createElement('canvas');canvas.width=beam?96:64;canvas.height=beam?256:64;
 const ctx=canvas.getContext('2d'),c=colors[key];if(!ctx)return canvas;
 const g=beam?ctx.createLinearGradient(0,256,0,0):ctx.createRadialGradient(32,32,0,32,32,32);
 if(beam){g.addColorStop(0,c[2]);g.addColorStop(.12,c[1]+'bc');g.addColorStop(.6,c[0]+'28');g.addColorStop(1,c[0]+'00');}
 else{g.addColorStop(0,c[2]);g.addColorStop(.08,c[1]+'e8');g.addColorStop(.25,c[0]+'68');g.addColorStop(1,c[0]+'00');}
 ctx.fillStyle=g;ctx.fillRect(0,0,canvas.width,canvas.height);textures.set(id,canvas);return canvas;
}

function prepareCanvas(canvas,stage,panel,reward){
 // The combat layer belongs to the stage; its bottom stops before damage text.
 let top=0,height=panel.getBoundingClientRect().height,width=panel.getBoundingClientRect().width;
 if(!reward){
  const bounds=stage.getBoundingClientRect(),row=stage.querySelector('.cube-row')?.getBoundingClientRect(),damage=stage.querySelector('.damage-result')?.getBoundingClientRect();
  const start=Math.max(bounds.top,row?row.top-row.height*.32:bounds.top),end=Math.min(bounds.bottom,damage?damage.top+4:bounds.bottom);
  top=start-bounds.top;height=Math.max(1,end-start);width=bounds.width;stage.style.position='relative';stage.append(canvas);
 }else panel.prepend(canvas);
 canvas.style.cssText=`position:absolute;inset:auto;left:0;top:${top}px;width:${width}px;height:${height}px;pointer-events:none;z-index:${reward?0:2}`;
 const box=canvas.getBoundingClientRect();if(box.width<=0||box.height<=0)return null;
 // Keep the original 1080p detail; larger viewports spend less on transparent overdraw.
 const viewportPixels=globalThis.innerWidth*globalThis.innerHeight;
 const budget=viewportPixels>=7000000?660000:viewportPixels>=3500000?760000:PIXEL_BUDGET;
 const ratio=Math.min(globalThis.devicePixelRatio||1,1.5,Math.sqrt(budget/Math.max(1,box.width*box.height)));
 const ctx=canvas.getContext('2d');if(!ctx)return null;
 return {ctx,canvas,box,w:box.width,h:box.height,ratio,top,reward};
}
function extent(){return {left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity};}
function include(area,x,y,width,height){area.left=Math.min(area.left,x);area.top=Math.min(area.top,y);area.right=Math.max(area.right,x+width);area.bottom=Math.max(area.bottom,y+height);}
function cropCanvas(prepared,area){
 const {canvas,ctx,w,h,ratio,top,reward}=prepared;
 const left=clamp(Math.floor(area.left-3),0,w-1),start=clamp(Math.floor(area.top-3),0,h-1),right=clamp(Math.ceil(area.right+3),left+1,w),bottom=clamp(Math.ceil(area.bottom+3),start+1,h);
 const width=right-left,height=bottom-start;
 canvas.style.cssText=`position:absolute;inset:auto;left:${left}px;top:${top+start}px;width:${width}px;height:${height}px;pointer-events:none;z-index:${reward?0:2}`;
 canvas.width=Math.max(1,Math.floor(width*ratio));canvas.height=Math.max(1,Math.floor(height*ratio));
 // Positions remain in the original logical frame. Cropping only translates its viewport.
 const sx=canvas.width/width,sy=canvas.height/height;ctx.setTransform(sx,0,0,sy,-left*sx,-start*sy);
 canvas.dataset.fxPixels=String(canvas.width*canvas.height);canvas.dataset.fxRoi=JSON.stringify({x:left,y:start,width,height});canvas.dataset.fxLogical=JSON.stringify({width:w,height:h});
 return {x:left,y:start,width,height};
}
function materialTile(bounds,ratio,maxSide=512){
 const canvas=document.createElement('canvas'),scale=Math.min(ratio,maxSide/Math.max(bounds.width,bounds.height));
 canvas.width=Math.max(1,Math.ceil(bounds.width*scale));canvas.height=Math.max(1,Math.ceil(bounds.height*scale));
 const ctx=canvas.getContext('2d');if(!ctx)return null;
 ctx.setTransform(canvas.width/bounds.width,0,0,canvas.height/bounds.height,-bounds.x*canvas.width/bounds.width,-bounds.y*canvas.height/bounds.height);
 return {canvas,ctx,...bounds};
}
function particleExtent(area,p,unit,duration,combat){
 const seconds=Math.min(p.life,Math.max(0,duration-p.delay))/1000,size=p.size*(combat?clamp(unit/130,.8,2):1.2),pad=size*4+Math.max(Math.abs(p.vx),Math.abs(p.vy))*.022+2;
 const ys=[p.y,p.y+p.vy*seconds+unit*.23*seconds*seconds],turn=-p.vy/(unit*.46);
 if(turn>0&&turn<seconds)ys.push(p.y+p.vy*turn+unit*.23*turn*turn);
 const end=p.x+p.vx*seconds,wiggle=unit*.025;
 include(area,Math.min(p.x,end)-wiggle-pad,Math.min(...ys)-pad,Math.abs(end-p.x)+wiggle*2+pad*2,Math.max(...ys)-Math.min(...ys)+pad*2);
}
function makeBolt(from,to,rand,width=12){
 const points=[from],dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy)||1,steps=Math.max(5,Math.min(14,Math.round(length/18)));
 for(let i=1;i<steps;i++){const q=i/steps,j=(rand()-.5)*width*Math.sin(q*Math.PI);points.push({x:from.x+dx*q-dy/length*j,y:from.y+dy*q+dx/length*j});}
 points.push(to);const joint=points[Math.floor(points.length*.55)];
 return {points,branch:[joint,{x:joint.x+(rand()-.5)*width*2,y:joint.y-width*.7},{x:joint.x+(rand()-.5)*width*3,y:joint.y-width*1.6}]};
}
function strokeBolts(ctx,bolts,key,alpha){
 if(alpha<=0||!bolts.length)return;
 // A bolt collection changes at 24 Hz. Reuse its geometry between display frames.
 const path=bolts.path||(bolts.path=new Path2D());if(!bolts.ready){for(const bolt of bolts)for(const p of [bolt.points,bolt.branch]){path.moveTo(p[0].x,p[0].y);for(let i=1;i<p.length;i++)path.lineTo(p[i].x,p[i].y);}bolts.ready=true;}
 ctx.lineJoin='round';const c=colors[key];
 for(const [width,color,opacity]of [[7,c[0],.15],[2.4,c[1],.78],[.75,c[2],1]]){ctx.lineWidth=width;ctx.strokeStyle=color;ctx.globalAlpha=alpha*opacity;ctx.stroke(path);}
}
function ring(ctx,x,y,r,key,alpha,squash=.32){
 if(alpha<=0)return;ctx.strokeStyle=colors[key][1];ctx.lineWidth=1.2;ctx.globalAlpha=alpha;
 ctx.beginPath();ctx.ellipse(x,y,r,r*squash,-.08,.08,Math.PI*1.92);ctx.stroke();ctx.strokeStyle=colors[key][0];ctx.lineWidth=3;ctx.globalAlpha=alpha*.18;ctx.stroke();
}

export function mountEffects(state,ui,settings,onSound){
 cancel();
 // Static, low and reduced-motion views still mount and draw the GPU dice once.
 const surface=mountDiceSurface();
 let stopDice=()=>{},frame=0,timer=0,ctx=null,w=0,h=0,alive=true;const materials=[];
 const stop=()=>{alive=false;clearTimeout(timer);stopDice();surface?.stop();if(frame)cancelAnimationFrame(frame);if(ctx)ctx.clearRect(0,0,w,h);for(const tile of materials){tile.canvas.width=1;tile.canvas.height=1;}materials.length=0;};cancel=stop;
 const canvas=document.querySelector('.scene-fx');
 if(!canvas||!ui.busy||settings.effects==='low'||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 if(ui.rolling||ui.forging){
  // No second fullscreen animation while the dice themselves are moving.
  stopDice=animateDice(state.revision+113,onSound,surface?.draw);
  timer=setTimeout(()=>{if(alive){stopDice();surface?.draw();surface?.stop();}},THROW_DURATION+30);
  canvas.dataset.fxKind='dice-only';return;
 }
 const last=state.lastRoll,combat=ui.view==='game'&&state.phase==='combat'&&ui.event==='roll'&&last;
 const anticipation=ui.view==='game'&&ui.event==='open'&&state.phase==='chest',reveal=ui.view==='game'&&ui.event==='open'&&state.phase==='loot';
 const stage=combat?document.querySelector('.combat-stage'):null,panel=canvas.parentElement;
 if((!combat&&!anticipation&&!reveal)||(combat&&!stage)||!panel)return;
 const prepared=prepareCanvas(canvas,stage,panel,anticipation||reveal);if(!prepared)return;
 ({ctx,w,h}=prepared);const {box}=prepared;
 let seed=(Math.imul(state.revision,7919)+137)>>>0;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const finish=combat&&last.killed&&state.enemy?.type==='boss',charged=combat&&(last.best>=2||last.critical);
 const grade=reveal?state.loot?.item.rarity??0:0; // Never read unrevealed chest rarity.
 const rewardKey=anticipation?'white':['white','blue','purple','gold','mythic','ancient','origin','eternal'][grade];
 const duration=anticipation?800:reveal?(grade>=3?1850:grade===0?720:1100):finish?1450:1150;
 canvas.dataset.fxKind=combat?'combat':anticipation?'chest-charge':`loot-${grade}`;canvas.dataset.fxLightningHz='24';
 const dice=combat?[...stage.querySelectorAll('.cube-die')].map(el=>{
  const r=el.getBoundingClientRect(),key=el.classList.contains('resonant')?'fire':el.classList.contains('charged')?'blue':last.critical?'red':'white';
  return{x:r.left-box.left+r.width*.5,y:r.top-box.top+r.width*.5,size:r.width,key,active:el.classList.contains('resonant')||el.classList.contains('charged')||last.critical,phase:rand()*TAU};
 }):[];
 const chest=anticipation||reveal?document.querySelector('.chest-art')?.getBoundingClientRect():null;
 const center=combat?{x:dice.reduce((n,d)=>n+d.x,0)/Math.max(1,dice.length)||w*.5,y:dice[0]?.y??h*.5}:{x:chest?chest.left-box.left+chest.width*.5:w*.5,y:chest?chest.top-box.top+chest.height*.56:h*.48};
 const unit=dice[0]?.size??Math.min(w*.23,h*.3);
 // Subdivided projected cube outline; ribbons hug the edges rather than radiate.
 const outline=[[-.53,-.35],[-.35,-.55],[.37,-.55],[.56,-.29],[.53,.34],[.3,.53],[-.38,.5],[-.57,.24]];
 const edges=outline.flatMap((p,i)=>{const next=outline[(i+1)%outline.length];return Array.from({length:3},(_,j)=>({x:p[0]+(next[0]-p[0])*j/3,y:p[1]+(next[1]-p[1])*j/3,phase:rand()*TAU}));});
 const activeDice=dice.filter(d=>d.active);
 const flames=activeDice.flatMap(d=>Array.from({length:finish?18:last.best>=3?15:11},()=>({d,anchor:rand(),lift:.14+rand()*.38,width:.028+rand()*.055,phase:rand()*TAU,speed:.012+rand()*.015})));
 const count=anticipation?22:reveal?[30,58,86,132,132,132,132,132][grade]:finish?142:charged?Math.min(118,52+dice.length*8):18;
 const particles=Array.from({length:count},(_,i)=>{
  const d=dice[i%Math.max(1,dice.length)],a=rand()*TAU,follow=combat&&last.follow&&i%4===0;
  return{x:d?d.x+Math.cos(a)*d.size*.52:center.x+(rand()-.5)*unit*.9,y:d?d.y+Math.sin(a)*d.size*.45:center.y+(rand()-.5)*unit*.18,vx:(rand()-.5)*(combat?unit*1.6:unit*2.2),vy:-unit*(.3+rand()*1.4),life:450+rand()*800,delay:follow?450+rand()*90:rand()*(anticipation?500:220),size:.7+rand()*1.8,key:follow?'blue':combat?d?.key??'fire':rewardKey,square:reveal&&i%3===0,phase:rand()*TAU};
 });
 canvas.dataset.fxParticles=String(count);
 // Tiny cached glow sprites replace per-particle shadows, filters and gradients.
 for(const p of particles){p.sprite=texture(p.key);p.ink=colors[p.key][2];p.stroke=colors[p.key][1];}if(anticipation||reveal)texture(rewardKey,true);
 // Raster material caches are local to each die. The ninety tongues in a six-die
 // resonance still curl independently, but display frames submit six images.
 for(const d of activeDice){d.flames=[];d.sprite=texture(d.key);d.tile=materialTile({x:d.x-d.size*1.12,y:d.y-d.size*1.12,width:d.size*2.24,height:d.size*1.82},prepared.ratio);if(d.tile)materials.push(d.tile);}
 for(const f of flames){const edge=f.anchor*(outline.length-1),i=Math.floor(edge),mix=edge-i,a=outline[i],b=outline[(i+1)%outline.length],d=f.d;
  f.x=d.x+(a[0]+(b[0]-a[0])*mix)*d.size;f.y=d.y+(a[1]+(b[1]-a[1])*mix)*d.size;f.width=d.size*f.width;f.shape={lift:0,tx:0,ty:0};d.flames.push(f);}
 const area=extent();for(const p of particles)particleExtent(area,p,unit,duration,combat);
 for(const d of activeDice)include(area,d.x-d.size*1.2,d.y-d.size*1.3,d.size*2.4,d.size*2);
 const sweep=(x,y,r,squash)=>{const rx=r*Math.hypot(Math.cos(.08),squash*Math.sin(.08)),ry=r*Math.hypot(Math.sin(.08),squash*Math.cos(.08));include(area,x-rx-5,y-ry-5,rx*2+10,ry*2+10);};
 if(combat){
  sweep(center.x,center.y+unit*.5,unit*(.4+420/270),.32);
  if(last.phaseChanged){sweep(center.x,center.y,unit*2.8,.65);sweep(center.x+unit*.08,center.y,unit*(.5+540/260),.62);}
  if(finish)sweep(center.x,center.y+unit*.35,unit*4.3,.28);
  if(last.absorbed>0&&state.enemy?.shield===0)sweep(center.x,center.y,unit*1.5,.58);
  if(last.follow){const x=clamp(center.x-unit*.6,unit*.4,w-unit*.4),y=Math.min(h-12,center.y+unit*.65),d=dice.at(-1);if(d)include(area,Math.min(x,d.x)-unit*.5,Math.min(y,d.y)-unit*.7,Math.abs(x-d.x)+unit,Math.abs(y-d.y)+unit*1.4);}
 }
 const columns=anticipation?3:grade>=3?9:grade===2?7:grade===1?5:3,rewardRims=[];
 let rewardMaterial=null;
 if(anticipation||reveal){
  const c=colors[rewardKey],spread=unit*(anticipation?.6:1.4),radius=unit*(anticipation?.85:grade>=3?1.2:.7),beamHeight=Math.min(center.y+20,h*.86);
  const halfWidth=Math.max(radius,spread*.5+unit*.24);
  const bounds={x:center.x-halfWidth-5,y:center.y-Math.max(beamHeight,radius*.5)-5,width:halfWidth*2+10,height:Math.max(beamHeight,radius*.5)+radius*.5+10};
  rewardMaterial=materialTile(bounds,prepared.ratio,1024);
  if(rewardMaterial){materials.push(rewardMaterial);const target=rewardMaterial.ctx;target.globalCompositeOperation='lighter';
   for(let i=0;i<columns;i++){
    const q=(i-(columns-1)/2)/Math.max(1,columns-1),width=unit*(anticipation?.035:grade>=3?.13:.07)*(i%2?.55:1),height=beamHeight*(1-Math.abs(q)*.45),x=center.x+q*spread;
    target.globalAlpha=anticipation?.24:grade>=3?.57:.36;target.drawImage(texture(rewardKey,true),x-width*.5,center.y-height,width,height);
    target.beginPath();target.moveTo(x,center.y);target.lineTo(x+q*unit*.4,center.y-height*.82);target.lineWidth=.8;target.strokeStyle=c[1];target.globalAlpha=.5;target.stroke();
    if(reveal&&grade>=2){target.beginPath();target.moveTo(x-width*.12,center.y);target.lineTo(x+width*.08,center.y-height*.6);target.lineTo(x+width*.15,center.y-height*.28);target.lineTo(x+width*.22,center.y);target.closePath();target.fillStyle=c[2];target.globalAlpha=i%2?.23:.45;target.fill();}
   }
   if(reveal){target.globalAlpha=.7;target.drawImage(texture(rewardKey),center.x-radius,center.y-radius*.5,radius*2,radius);}
   // A short hot seam follows the real chest geometry; no radial star or picture asset.
   const chestFace=document.querySelector('.chest-art svg')?.getBoundingClientRect()||chest;
   if(chestFace){const x=chestFace.left-box.left,y=chestFace.top-box.top,cw=chestFace.width,ch=chestFace.height;
    target.beginPath();target.moveTo(x+cw*.15,y+ch*.55);target.lineTo(x+cw*.25,y+ch*.45);target.lineTo(x+cw*.75,y+ch*.45);target.lineTo(x+cw*.85,y+ch*.55);
    for(const [width,color,alpha]of [[5,c[0],.2],[1.8,c[1],.75],[.65,c[2],.95]]){target.lineWidth=width;target.strokeStyle=color;target.globalAlpha=alpha;target.stroke();}
   }
   include(area,bounds.x,bounds.y,bounds.width,bounds.height);
  }
  if(anticipation)sweep(center.x,center.y,radius,.5);
  if(reveal){sweep(center.x,center.y+unit*.24,unit*1.8,.32);include(area,center.x-unit*.74-3,center.y-unit*.42-3,unit*1.48+6,unit*.7+6);if(grade>=4)include(area,center.x-unit*1.32,center.y-unit*1.58,unit*2.64,unit*2.3);}
  // Only a transient edge material. The permanent card and its text belong to CSS.
  const card=reveal&&grade>=3?document.querySelector('.loot-reveal .item-card')?.getBoundingClientRect():null;
  if(card){const x=card.left-box.left,y=card.top-box.top,cw=card.width,ch=card.height;
   const sides=[{x:x-8,y:y-8,width:cw+16,height:18,a:[x+8,y-2],b:[x+cw-8,y-2]},{x:x-8,y:y+ch-10,width:cw+16,height:18,a:[x+8,y+ch+2],b:[x+cw-8,y+ch+2]},{x:x-8,y:y+8,width:18,height:Math.max(1,ch-16),a:[x-2,y+12],b:[x-2,y+ch-12]},{x:x+cw-10,y:y+8,width:18,height:Math.max(1,ch-16),a:[x+cw+2,y+12],b:[x+cw+2,y+ch-12]}];
   for(const [index,side]of sides.entries()){const tile=materialTile(side,prepared.ratio,1024);if(!tile)continue;const target=tile.ctx;target.globalCompositeOperation='lighter';target.beginPath();target.moveTo(...side.a);target.lineTo(...side.b);
    for(const [width,color,alpha]of [[7,c[0],.16],[2.2,c[1],.65]]){target.lineWidth=width;target.strokeStyle=color;target.globalAlpha=alpha;target.stroke();}
    target.beginPath();for(let segment=0;segment<5;segment++){const from=.03+segment*.19,to=from+.04+(index+segment)%3*.025;target.moveTo(side.a[0]+(side.b[0]-side.a[0])*from,side.a[1]+(side.b[1]-side.a[1])*from);target.lineTo(side.a[0]+(side.b[0]-side.a[0])*to,side.a[1]+(side.b[1]-side.a[1])*to);}target.lineWidth=.8;target.strokeStyle=c[2];target.globalAlpha=.85;target.stroke();
    rewardRims.push(tile);materials.push(tile);include(area,side.x,side.y,side.width,side.height);
   }
  }
 }
 const roi=cropCanvas(prepared,area);
 canvas.dataset.fxRewardColumns=String(combat?0:columns);canvas.dataset.fxRewardSquares=String(particles.filter(p=>p.square).length);canvas.dataset.fxRewardRims=String(rewardRims.length);
 canvas.dataset.fxRewardMotif=reveal?['motes','sparks','facets','rays','seal','spiral','origin-star','eternal-orbits'][grade]:'none';
 canvas.dataset.fxMaterialPixels=String(materials.reduce((n,t)=>n+t.canvas.width*t.canvas.height,0));
 let lightning=[],followBolts=[],tick=-1,flameTick=-1,start=performance.now();
 canvas.dataset.fxFlameHz='30';canvas.dataset.fxFlames=String(flames.length);canvas.dataset.fxFlameTiles=String(activeDice.filter(d=>d.tile).length);
 function traceFilaments(target,d,ms,layers){
  target.beginPath();for(const layer of layers){const offset=Math.floor(ms*.008+d.phase*4+layer*7)%edges.length;
   for(let step=0;step<13;step++){
    const p=edges[(offset+step)%edges.length],wave=Math.sin(ms*.012+p.phase+layer)*d.size*(.018+layer*.009);
    const x=d.x+p.x*d.size*(1.04+layer*.025)+wave,y=d.y+p.y*d.size*(1.04+layer*.025)-Math.abs(wave)*.8;
    if(!step)target.moveTo(x,y);else target.lineTo(x,y);
   }
  }
 }
 function rebuildFlames(ms){
  for(const d of activeDice){
   const tile=d.tile;if(!tile)continue;const target=tile.ctx,c=colors[d.key],size=d.size,cold=d.key==='fire'?'#e33b0f':c[0];
   target.clearRect(tile.x,tile.y,tile.width,tile.height);target.globalCompositeOperation='lighter';target.lineJoin='round';target.beginPath();
   edges.forEach((p,i)=>{const wobble=Math.sin(ms*.016+p.phase+d.phase)*size*.018,x=d.x+p.x*size+wobble,y=d.y+p.y*size+Math.sin(ms*.021+p.phase)*size*.013;
    if(!i)target.moveTo(x,y);else{const prev=edges[i-1];target.quadraticCurveTo(d.x+(prev.x+p.x)*size*.5+wobble*1.8,d.y+(prev.y+p.y)*size*.5-wobble,x,y);}});target.closePath();
   // A warm uneven mantle supports the broken hot filaments; the body stays black.
   for(const [width,color,opacity]of [[size*.085,cold,.2],[size*.032,c[1],.4],[Math.max(.7,size*.009),c[2],.25]]){target.lineWidth=width;target.strokeStyle=color;target.globalAlpha=opacity;target.stroke();}
   traceFilaments(target,d,ms,[0,2]);target.lineWidth=Math.max(.8,size*.012);target.strokeStyle=c[1];target.globalAlpha=.62;target.stroke();
   traceFilaments(target,d,ms,[1]);target.lineWidth=Math.max(.7,size*.009);target.strokeStyle=c[2];target.globalAlpha=.9;target.stroke();
   if(!d.tongueGradient){
    d.tongueGradient=target.createLinearGradient(0,d.y-size*1.1,0,d.y+size*.65);d.tongueGradient.addColorStop(0,c[0]+'15');d.tongueGradient.addColorStop(.25,c[1]+'a0');d.tongueGradient.addColorStop(.6,c[0]);d.tongueGradient.addColorStop(1,cold+'35');
    d.coreGradient=target.createLinearGradient(0,d.y-size*1.05,0,d.y+size*.55);d.coreGradient.addColorStop(0,c[1]+'28');d.coreGradient.addColorStop(.22,c[2]);d.coreGradient.addColorStop(.7,c[1]+'a8');d.coreGradient.addColorStop(1,c[0]+'18');
   }
   target.beginPath();for(const f of d.flames){const x=f.x,y=f.y,width=f.width;
    const lift=size*f.lift*(.7+.3*Math.sin(ms*f.speed+f.phase)),tx=x+Math.sin(ms*.009+f.phase)*lift*.65,ty=y-lift;f.shape.lift=lift;f.shape.tx=tx;f.shape.ty=ty;
    target.moveTo(x-width,y+width*.4);target.bezierCurveTo(x-width*.4,y-lift*.4,tx+width*1.6,ty+lift*.2,tx,ty);target.bezierCurveTo(tx+width*.25,ty+lift*.5,x+width*1.8,y-lift*.2,x+width,y);target.closePath();
   }target.fillStyle=d.tongueGradient;target.globalAlpha=.7;target.fill();
   target.beginPath();for(const f of d.flames){const {lift,tx,ty}=f.shape,x=f.x,y=f.y,width=f.width,breakup=.1+.15*(.5+.5*Math.sin(f.phase+ms*.011));
    target.moveTo(x+width*.15,y-lift*breakup);target.bezierCurveTo(x+width,y-lift*.3,tx-width,ty+lift*.6,tx,ty+lift*.24);
   }target.lineWidth=Math.max(.65,size*.007);target.strokeStyle=d.coreGradient;target.globalAlpha=.94;target.stroke();target.globalAlpha=1;
  }
 }
 function drawFlames(ms,envelope){
  if(!charged||envelope<=0)return;
  const current=Math.floor(ms/FLAME_STEP);if(current!==flameTick){flameTick=current;rebuildFlames(current*FLAME_STEP);}
  for(const d of activeDice){
   if(d.tile){ctx.globalAlpha=envelope;ctx.drawImage(d.tile.canvas,d.tile.x,d.tile.y,d.tile.width,d.tile.height);}
   for(let knot=0;knot<3;knot++){
    const radius=d.size*(.12+.025*Math.sin(ms*.018+knot+d.phase)),x=d.x+(knot-1)*d.size*.34,y=d.y-d.size*.46;
    ctx.globalAlpha=envelope*.3;ctx.drawImage(d.sprite,x-radius,y-radius,radius*2,radius*2);
   }
  }
 }
 function drawParticles(ms,fade){
  for(const p of particles){const age=ms-p.delay;if(age<0||age>p.life)continue;
   const life=age/p.life,seconds=age/1000,x=p.x+p.vx*seconds+Math.sin(p.phase+seconds*4)*unit*.025,y=p.y+p.vy*seconds+unit*.23*seconds*seconds;
   const alpha=Math.sin(Math.min(1,life*3)*Math.PI*.5)*(1-life)*fade;if(alpha<=0)continue;
   const size=p.size*(combat?clamp(unit/130,.8,2):1.2),glow=size*8;ctx.globalAlpha=alpha*.74;ctx.drawImage(p.sprite,x-glow*.5,y-glow*.5,glow,glow);
   ctx.fillStyle=p.ink;ctx.strokeStyle=p.stroke;ctx.lineWidth=.7;ctx.globalAlpha=alpha;
   if(p.square){ctx.save();ctx.translate(x,y);ctx.rotate(p.phase+seconds*.7);ctx.strokeRect(-size,-size,size*2,size*2);ctx.restore();}
   else{ctx.fillRect(x,y,size*.7,size*.7);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-p.vx*.022,y-p.vy*.022);ctx.stroke();}
  }
 }
 function drawRelicMotif(ms,strength){
  if(!reveal||grade<4)return;
  const x=center.x,y=center.y-unit*.42,r=unit*(.79+.08*Math.sin(ms*.0015)),c=colors[rewardKey];
  ctx.strokeStyle=c[1];ctx.lineWidth=1.05;ctx.globalAlpha=strength*.7;ctx.beginPath();
  if(grade===4){
   // Mythic: a forged six-sided seal, with opposed points of light.
   for(let i=0;i<=6;i++){const a=-Math.PI/2+i*TAU/6,px=x+Math.cos(a)*r*.8,py=y+Math.sin(a)*r*.8;if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);}
   ctx.moveTo(x-r*.43,y);ctx.lineTo(x+r*.43,y);ctx.moveTo(x,y-r*.5);ctx.lineTo(x,y+r*.5);ctx.stroke();
  }else if(grade===5||grade===7){
   // Ancient spirals and Eternal crossing orbits have distinct silhouettes.
   const orbitCount=grade===7?3:2;
   for(let i=0;i<orbitCount;i++){ctx.beginPath();ctx.ellipse(x,y,r*(1+i*.09),r*(i===2?.72:.3),-.3+i*.92+Math.sin(ms*.0008)*.08,.14+i*.6,TAU-.15+i*.6);ctx.stroke();}
  }else{
   // Origin: eight angular rays converge into an engraved diamond.
   for(let i=0;i<=16;i++){const a=i*Math.PI/8-Math.PI/2,rr=r*(i%2?.4:1),px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr;if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);}ctx.stroke();
  }
  if(grade===7){ctx.strokeStyle=c[2];ctx.globalAlpha=strength*.63;ctx.beginPath();for(let i=0;i<5;i++){const px=x+(i-2)*unit*.31,progress=(ms*.00055+i*.21)%1,py=center.y-unit*.15-progress*unit*1.28;ctx.moveTo(px,py);ctx.lineTo(px,py-unit*.08);}ctx.stroke();}
 }
 function drawReward(ms,t){
  const c=colors[rewardKey],strength=anticipation?Math.pow(t,1.7):Math.pow(1-t,1.25);
  if(rewardMaterial){ctx.globalAlpha=strength*(.9+.1*Math.sin(ms*.013));ctx.drawImage(rewardMaterial.canvas,rewardMaterial.x,rewardMaterial.y,rewardMaterial.width,rewardMaterial.height);}
  if(anticipation){const radius=unit*(.45+t*.4);ctx.globalAlpha=strength*.55;ctx.drawImage(texture(rewardKey),center.x-radius,center.y-radius*.5,radius*2,radius);}
  else{
   // Thin moving highlights retain a 60 Hz shimmer over the cached warm columns.
   for(let i=0;i<3;i++){const x=center.x+(i-1)*unit*.29,height=Math.min(center.y+20,h*.86)*(.65+.13*Math.sin(ms*.009+i*2));ctx.globalAlpha=strength*(.23+.12*Math.sin(ms*.015+i));ctx.drawImage(texture(rewardKey,true),x-unit*.009,center.y-height,unit*.018,height);}
   for(const [index,tile]of rewardRims.entries()){ctx.globalAlpha=clamp((ms-200)/180)*Math.pow(1-t,.8)*(.8+.2*Math.sin(ms*.012+index*1.7));ctx.drawImage(tile.canvas,tile.x,tile.y,tile.width,tile.height);}
  }
  drawRelicMotif(ms,strength);
  if(reveal){ring(ctx,center.x,center.y+unit*.24,unit*(.5+t*1.3),rewardKey,strength*.7);ctx.strokeStyle=c[1];ctx.lineWidth=1;ctx.globalAlpha=strength*.62;
   const rx=unit*(.62+t*.12),ry=unit*.42;for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(center.x+side*(rx-unit*.18),center.y-ry);ctx.lineTo(center.x+side*rx,center.y-ry);ctx.lineTo(center.x+side*rx,center.y+ry*.65);ctx.stroke();}}
 }
 function draw(now){
  if(!alive)return;const ms=Math.max(0,now-start),t=clamp(ms/duration);ctx.clearRect(roi.x,roi.y,roi.width,roi.height);ctx.globalCompositeOperation='lighter';
  if(combat){
   const envelope=clamp(ms/65)*Math.pow(1-t,finish?1.25:1.7);drawFlames(ms,envelope);
   const currentTick=Math.floor(ms/(1000/24));if(currentTick!==tick){
    tick=currentTick;lightning=[];followBolts=[];
    if(charged&&ms<900)for(let i=0;i<dice.length;i++){const d=dice[i];if(!d.active)continue;
     const from={x:d.x+(rand()-.5)*d.size*.7,y:d.y-d.size*.45},next=dice[i+1],to=next&&next.active&&rand()>.4?{x:next.x-next.size*.4,y:next.y-next.size*.35}:{x:from.x+(rand()-.5)*d.size*.9,y:from.y-d.size*(.12+rand()*.38)};
     lightning.push(makeBolt(from,to,rand,d.size*.17));}
    if(last.follow&&ms>=450&&ms<1050&&dice.length){const d=dice.at(-1);followBolts.push(makeBolt({x:d.x+d.size*.35,y:d.y+d.size*.15},{x:clamp(center.x-unit*.6,unit*.4,w-unit*.4),y:Math.min(h-12,center.y+unit*.65)},rand,unit*.23));}
   }
   strokeBolts(ctx,lightning,'blue',envelope*.74);strokeBolts(ctx,followBolts,'blue',ms>=450?Math.sin(clamp((ms-450)/600)*Math.PI)*.95:0);
   if(ms<420)ring(ctx,center.x,center.y+unit*.5,unit*(.4+ms/270),last.critical?'red':charged?'fire':'white',Math.pow(1-ms/420,2)*.65);
   if(last.phaseChanged&&ms<540){ring(ctx,center.x,center.y,unit*(.55+ms/240),'purple',Math.pow(1-ms/540,1.5)*.85,.65);ring(ctx,center.x+unit*.08,center.y,unit*(.5+ms/260),'red',Math.pow(1-ms/540,2)*.5,.62);}
   if(last.absorbed>0&&state.enemy?.shield===0&&ms<650){
    ctx.strokeStyle=colors.blue[2];ctx.lineWidth=1;ctx.globalAlpha=Math.pow(1-ms/650,2)*.75;const shards=new Path2D();
    for(let i=0;i<12;i++){const a=i*2.399963,travel=unit*(.45+ms*.0013),x=center.x+Math.cos(a)*travel,y=center.y+Math.sin(a)*travel*.5;shards.moveTo(x,y);shards.lineTo(x+Math.cos(a)*unit*.075,y+Math.sin(a)*unit*.12);shards.lineTo(x+unit*.025,y+unit*.035);}ctx.stroke(shards);
   }
   if(finish&&ms<600)ring(ctx,center.x,center.y+unit*.35,unit*(.55+ms/160),'gold',Math.pow(1-ms/600,2),.28);
   drawParticles(ms,Math.pow(1-t,.6));
  }else{drawReward(ms,t);drawParticles(ms,anticipation?clamp(t*1.5):Math.pow(1-t,.5));}
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';if(t<1)frame=requestAnimationFrame(draw);else stop();
 }
 frame=requestAnimationFrame(draw);
}
