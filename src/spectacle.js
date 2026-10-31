// Spectacle layer: hit-stop, shake, floating numbers, health-bar ghosts and a
// viewport particle canvas. Presentation only. It never reads or advances game
// RNG, never mutates saved state and never delays or replaces a committed
// result: every caller has already saved and rendered the outcome it decorates.
// The original effects.js paint program stays untouched beneath this layer.

const TAU=Math.PI*2,MAX_PARTICLES=900,WALL_LIMIT=6000,PIXEL_BUDGET=1600000;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
const ease={out:t=>1-Math.pow(1-t,3),outBack:t=>1+2.2*Math.pow(t-1,3)+1.2*Math.pow(t-1,2)};

export const PALETTES={
 normal:['#7df9ff','#ffffff','#4fa8ff'],
 cyan:['#22f0ff','#9bfcff','#ffffff','#38a8ff'],
 gold:['#ffd23f','#ff9a1f','#fff3b0','#ff5e3a'],
 magenta:['#ff3df2','#b84dff','#ffd0ff','#ff5f9e'],
 critical:['#ff2d55','#ff7a1a','#ff4dd2','#ffffff'],
 follow:['#3d8bff','#7fd0ff','#ffffff'],
 phase:['#b84dff','#ff3df2','#7a5cff','#ffffff'],
 finish:['#ffd23f','#fff3b0','#ff9a1f','#ffffff'],
 dust:['#9fdcff','#d9f4ff','#7aa4c0'],
};
export const RARITY_PALETTES=[
 ['#dfe7f1','#ffffff','#9fb2c6'],
 ['#3da5ff','#8fd3ff','#ffffff'],
 ['#b05cff','#e2a8ff','#ff7cf2'],
 ['#ffc531','#ffe58a','#ff8a1f','#ffffff'],
 ['#ff4d5e','#ff9aa3','#ffd0a0','#ff2fa0'],
 ['#2fe0c0','#9fffe9','#4fc3ff','#ffffff'],
 ['#ffe9a8','#fff8dc','#ffc861','#ffffff'],
 null, // Eternal cycles through the whole spectrum.
];
const RARITY_LABEL=['','RARE','EPIC','LEGENDARY','MYTHIC','ANCIENT','ORIGIN','ETERNAL'];

// Visual-only deterministic sequence, seeded from the committed revision.
export function visualRandom(seed){let s=(Math.imul(seed>>>0,2654435761)+0x9e3779b9)>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
const rainbow=(rand)=>`hsl(${Math.floor(rand()*12)*30},100%,62%)`;

let host=null,canvas=null,ctx=null,frame=0,lastTime=0,startedAt=0,ratio=1,vw=0,vh=0;
const particles=[],rings=[],rays=[],slashes=[],timers=new Set(),counters=new Set(),animations=new Set(),restores=new Set(),sprites=new Map();
let visibilityBound=false;

function supported(){return typeof document!=='undefined'&&typeof document.createElement==='function'&&!!document.body&&typeof requestAnimationFrame==='function';}
function reducedMotion(){try{return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;}catch{return false;}}
function lowEffects(){return document.documentElement?.dataset?.effects==='low';}
function allowed(){return supported()&&!reducedMotion()&&!lowEffects();}

function ensureHost(){
 if(host?.isConnected)return host;
 host=document.createElement('div');host.className='spectacle-layer';host.setAttribute('aria-hidden','true');
 canvas=document.createElement('canvas');canvas.className='spectacle-fx';host.append(canvas);
 ctx=canvas.getContext?.('2d')||null;document.body.append(host);
 if(!visibilityBound){visibilityBound=true;document.addEventListener?.('visibilitychange',()=>{if(document.visibilityState==='hidden')stopSpectacle();});}
 return host;
}
function sprite(color){
 if(sprites.has(color))return sprites.get(color);
 const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');
 if(g){const r=g.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,'#ffffff');r.addColorStop(.12,color);r.addColorStop(.4,color.startsWith('hsl')?color.replace(')',',.35)').replace('hsl','hsla'):color+'59');r.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=r;g.fillRect(0,0,64,64);}
 if(sprites.size>96)sprites.clear();sprites.set(color,c);return c;
}
function later(ms,fn){const id=setTimeout(()=>{timers.delete(id);try{fn();}catch{/* Presentation is optional. */}},Math.max(0,ms));timers.add(id);return id;}
function animate(el,keyframes,options){
 if(!el?.isConnected||typeof el.animate!=='function')return null;
 try{const a=el.animate(keyframes,options);animations.add(a);a.finished?.then(()=>animations.delete(a),()=>animations.delete(a));return a;}catch{return null;}
}
function rectOf(el){if(!el?.isConnected)return null;const r=el.getBoundingClientRect();return r.width>0&&r.height>0?r:null;}
function centerOf(r){return{x:r.left+r.width/2,y:r.top+r.height/2};}

// ---------------------------------------------------------------- particles
function resize(){
 vw=globalThis.innerWidth||0;vh=globalThis.innerHeight||0;if(!canvas||!vw||!vh)return false;
 ratio=Math.min(globalThis.devicePixelRatio||1,1.25,Math.sqrt(PIXEL_BUDGET/(vw*vh)));
 const w=Math.max(1,Math.floor(vw*ratio)),h=Math.max(1,Math.floor(vh*ratio));
 if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;return true;
}
function busyCount(){return particles.length+rings.length+rays.length+slashes.length;}
function start(){
 if(frame||!ctx)return;if(!resize())return;
 canvas.classList.add('active');lastTime=0;startedAt=performance.now();frame=requestAnimationFrame(tick);
}
function tick(now){
 frame=0;if(!ctx)return;
 if(!lastTime)lastTime=now;const dt=Math.min(.05,Math.max(0,(now-lastTime)/1000));lastTime=now;
 if(now-startedAt>WALL_LIMIT){clearParticles();return;}
 if((globalThis.innerWidth||0)!==vw||(globalThis.innerHeight||0)!==vh)resize();
 ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.setTransform(ratio,0,0,ratio,0,0);
 ctx.globalCompositeOperation='lighter';
 step(rays,dt,drawRay);step(rings,dt,drawRing);step(slashes,dt,drawSlash);
 for(let i=particles.length-1;i>=0;i--){const p=particles[i];if(!advance(p,dt)){particles.splice(i,1);continue;}if(p.kind!=='confetti')drawSpark(p);}
 ctx.globalCompositeOperation='source-over';
 for(const p of particles)if(p.kind==='confetti')drawConfetti(p);
 ctx.globalAlpha=1;
 if(busyCount())frame=requestAnimationFrame(tick);else{ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);canvas.classList.remove('active');}
}
function step(list,dt,draw){for(let i=list.length-1;i>=0;i--){const it=list[i];it.age+=dt*1000*it.rate;if(it.age<0)continue;if(it.age>=it.life){list.splice(i,1);continue;}draw(it,it.age/it.life);}}
function advance(p,dt){
 const t=dt*p.rate;p.age+=t*1000;if(p.age<0)return true;if(p.age>=p.life)return false;
 const drag=Math.pow(p.drag,t*60);p.vx*=drag;p.vy=p.vy*drag+p.gravity*t;
 if(p.kind==='confetti'){p.flip+=p.vflip*t;p.rot+=p.vr*t;p.vx+=Math.sin(p.flip*1.7)*p.flutter*t;}
 p.px=p.x;p.py=p.y;p.x+=p.vx*t;p.y+=p.vy*t;return true;
}
function drawSpark(p){
 const life=p.age/p.life,a=(life<.12?life/.12:1)*Math.pow(1-life,1.4);if(a<=0)return;
 const g=p.size*6;ctx.globalAlpha=a*.85;ctx.drawImage(p.sprite,p.x-g/2,p.y-g/2,g,g);
 ctx.globalAlpha=a;ctx.strokeStyle=p.color;ctx.lineWidth=Math.max(.8,p.size*.55);ctx.lineCap='round';
 const sx=p.vx*.028,sy=p.vy*.028;ctx.beginPath();ctx.moveTo(p.x-sx,p.y-sy);ctx.lineTo(p.x,p.y);ctx.stroke();
}
function drawConfetti(p){
 const life=p.age/p.life,a=Math.min(1,life*8)*Math.pow(1-life,.6);if(a<=0)return;
 const c=Math.cos(p.rot),s=Math.sin(p.rot),squash=Math.abs(Math.cos(p.flip));
 ctx.setTransform(c*ratio,s*ratio,-s*ratio*squash,c*ratio*squash,p.x*ratio,p.y*ratio);
 ctx.globalAlpha=a;ctx.fillStyle=p.color;ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);
 ctx.setTransform(ratio,0,0,ratio,0,0);
}
function drawRing(r,t){
 const k=ease.out(t),radius=r.r0+(r.r1-r.r0)*k,a=Math.pow(1-t,1.6)*r.alpha;if(a<=0)return;
 ctx.strokeStyle=r.color;ctx.globalAlpha=a;ctx.lineWidth=r.width*(1-t*.7);
 ctx.beginPath();ctx.ellipse(r.x,r.y,radius,radius*r.squash,0,0,TAU);ctx.stroke();
 ctx.globalAlpha=a*.35;ctx.lineWidth=r.width*3*(1-t*.6);ctx.stroke();
}
function drawRay(r,t){
 const a=Math.sin(Math.PI*clamp(t))*r.alpha;if(a<=0)return;
 const angle=r.angle+r.spin*t,len=r.length*(.35+.65*ease.out(t)),half=r.width*(1-t*.5);
 const ex=r.x+Math.cos(angle)*len,ey=r.y+Math.sin(angle)*len,nx=-Math.sin(angle)*half,ny=Math.cos(angle)*half;
 const g=ctx.createLinearGradient(r.x,r.y,ex,ey);g.addColorStop(0,r.color);g.addColorStop(1,'rgba(0,0,0,0)');
 ctx.globalAlpha=a;ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(r.x+nx*.15,r.y+ny*.15);ctx.lineTo(ex+nx,ey+ny);ctx.lineTo(ex-nx,ey-ny);ctx.lineTo(r.x-nx*.15,r.y-ny*.15);ctx.closePath();ctx.fill();
}
function drawSlash(s,t){
 const head=ease.out(clamp(t/.55)),tail=ease.out(clamp((t-.18)/.7));if(head<=tail)return;
 const x0=s.from.x+(s.to.x-s.from.x)*tail,y0=s.from.y+(s.to.y-s.from.y)*tail+Math.sin(tail*Math.PI)*s.arc;
 const x1=s.from.x+(s.to.x-s.from.x)*head,y1=s.from.y+(s.to.y-s.from.y)*head+Math.sin(head*Math.PI)*s.arc;
 const mx=(x0+x1)/2,my=(y0+y1)/2+(s.arc*.15);
 ctx.lineCap='round';
 for(const [w,col,al]of [[s.width*3.2,s.color,.22],[s.width,s.color,.85],[s.width*.35,'#ffffff',1]]){ctx.globalAlpha=al*(1-t*.4);ctx.strokeStyle=col;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(x0,y0);ctx.quadraticCurveTo(mx,my,x1,y1);ctx.stroke();}
 const g=s.width*7;ctx.globalAlpha=1-t*.5;ctx.drawImage(sprite(s.color),x1-g/2,y1-g/2,g,g);
}
function spark(x,y,color,o={}){
 if(particles.length>=MAX_PARTICLES)return;
 const p={kind:'spark',x,y,px:x,py:y,vx:o.vx||0,vy:o.vy||0,gravity:o.gravity??380,drag:o.drag??.94,size:o.size||2,life:o.life||700,age:-(o.delay||0),rate:o.rate||1,color,sprite:sprite(color)};
 particles.push(p);
}
function confetti(x,y,color,rand,o={}){
 if(particles.length>=MAX_PARTICLES)return;
 particles.push({kind:'confetti',x,y,px:x,py:y,vx:o.vx||0,vy:o.vy||0,gravity:o.gravity??520,drag:o.drag??.965,w:4+rand()*6,h:2.5+rand()*4,rot:rand()*TAU,vr:(rand()-.5)*14,flip:rand()*TAU,vflip:6+rand()*10,flutter:60+rand()*80,life:o.life||1800+rand()*900,age:-(o.delay||0),rate:o.rate||1,color});
}
function burst(x,y,palette,rand,count,o={}){
 const speed=o.speed||420,rate=o.rate||1;
 for(let i=0;i<count;i++){
  const a=o.cone?o.cone[0]+rand()*(o.cone[1]-o.cone[0]):rand()*TAU,v=speed*(.25+rand()*.95);
  const color=palette?palette[i%palette.length]:rainbow(rand);
  spark(x+(rand()-.5)*(o.spread||8),y+(rand()-.5)*(o.spread||8),color,{vx:Math.cos(a)*v,vy:Math.sin(a)*v*(o.flat||1)-(o.lift||0),size:(o.size||2)*(.6+rand()*.9),life:(o.life||650)*(.6+rand()*.7),delay:(o.delay||0)+rand()*(o.jitter||0),gravity:o.gravity,drag:o.drag,rate});
 }
}
function ring(x,y,color,o={}){rings.push({x,y,color,r0:o.r0||6,r1:o.r1||140,width:o.width||3,squash:o.squash??1,alpha:o.alpha??.9,life:o.life||520,age:-(o.delay||0),rate:o.rate||1});}
function raysAt(x,y,palette,rand,count,o={}){for(let i=0;i<count;i++)rays.push({x,y,color:palette?palette[i%palette.length]:rainbow(rand),angle:i/count*TAU+rand()*.3,spin:(o.spin||.6)*(rand()<.5?-1:1),length:(o.length||260)*(.6+rand()*.6),width:(o.width||18)*(.6+rand()*.8),alpha:o.alpha??.55,life:o.life||900,age:-(o.delay||0),rate:o.rate||1});}
function slash(from,to,color,o={}){slashes.push({from,to,color,width:o.width||3,arc:o.arc||0,life:o.life||260,age:-(o.delay||0),rate:o.rate||1});}
function confettiShower(rect,palette,rand,count,o={}){
 for(let i=0;i<count;i++){const x=rect.left+rand()*rect.width,color=palette?palette[i%palette.length]:rainbow(rand);
  confetti(x,rect.top-10-rand()*40,color,rand,{vx:(rand()-.5)*160,vy:60+rand()*120,delay:(o.delay||0)+rand()*(o.spread||500),rate:o.rate,life:o.life});}
}
function confettiFountain(x,y,palette,rand,count,o={}){
 for(let i=0;i<count;i++){const a=-Math.PI/2+(rand()-.5)*(o.width||1.6),v=(o.speed||620)*(.55+rand()*.6),color=palette?palette[i%palette.length]:rainbow(rand);
  confetti(x+(rand()-.5)*20,y,color,rand,{vx:Math.cos(a)*v,vy:Math.sin(a)*v,delay:(o.delay||0)+rand()*(o.jitter||120),rate:o.rate});}
}
function clearParticles(){
 particles.length=0;rings.length=0;rays.length=0;slashes.length=0;
 if(frame){cancelAnimationFrame(frame);frame=0;}
 if(ctx&&canvas){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);canvas.classList.remove('active');}
}

// ------------------------------------------------------------- DOM effects
function shake(el,strength,duration,rand,rate=1){
 if(!el||strength<=0)return;
 const steps=Math.max(4,Math.round(duration/28)),frames=[];
 for(let i=0;i<=steps;i++){const k=i===steps?0:Math.pow(1-i/steps,1.6)*strength,x=(rand()-.5)*2*k,y=(rand()-.5)*2*k*.8,r=(rand()-.5)*k*.12;frames.push({transform:`translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotate(${r.toFixed(3)}deg)`});}
 animate(el,frames,{duration:duration/rate,easing:'linear',composite:'add'});
}
function flash(palette,strength,duration,rate=1,origin=null){
 ensureHost();const node=document.createElement('div');node.className='sp-flash';
 const x=origin?`${(origin.x/(globalThis.innerWidth||1)*100).toFixed(1)}%`:'50%',y=origin?`${(origin.y/(globalThis.innerHeight||1)*100).toFixed(1)}%`:'45%';
 node.style.background=`radial-gradient(circle at ${x} ${y},${palette[2]||'#fff'} 0,${palette[0]}aa 18%,${palette[1]}33 46%,transparent 72%)`;
 host.append(node);const a=animate(node,[{opacity:strength},{opacity:0}],{duration:duration/rate,easing:'cubic-bezier(.2,.7,.3,1)',fill:'forwards'});
 const done=()=>node.remove();if(a?.finished)a.finished.then(done,done);else later(duration/rate,done);
}
function vignette(palette,duration,rate=1){
 ensureHost();const node=document.createElement('div');node.className='sp-vignette';
 node.style.boxShadow=`inset 0 0 18vmin ${palette[0]}99,inset 0 0 42vmin ${palette[1]||palette[0]}44`;host.append(node);
 const a=animate(node,[{opacity:0},{opacity:1,offset:.18},{opacity:0}],{duration:duration/rate,easing:'ease-out',fill:'forwards'});
 const done=()=>node.remove();if(a?.finished)a.finished.then(done,done);else later(duration/rate,done);
}
function popText(text,x,y,cls,o={}){
 ensureHost();const node=document.createElement('div');node.className=`sp-pop ${cls||''}`;node.textContent=text;
 node.style.left=`${x}px`;node.style.top=`${y}px`;host.append(node);
 const rise=o.rise??70,d=(o.duration||1100)/(o.rate||1),drift=o.drift||0;
 // Pop in, hold fully legible, then drift away. Easing is per segment so the
 // readable plateau keeps its real share of the duration.
 const a=animate(node,[
  {transform:'translate(-50%,-50%) scale(.2)',opacity:0,easing:'cubic-bezier(.2,1.6,.4,1)'},
  {transform:`translate(-50%,-50%) scale(${o.peak||1.45})`,opacity:1,offset:.1,easing:'cubic-bezier(.3,0,.3,1)'},
  {transform:'translate(-50%,-50%) scale(1)',opacity:1,offset:.22,easing:'linear'},
  {transform:`translate(calc(-50% + ${drift*.4}px),calc(-50% - ${rise*.35}px)) scale(1)`,opacity:1,offset:.68,easing:'cubic-bezier(.4,0,.8,.6)'},
  {transform:`translate(calc(-50% + ${drift}px),calc(-50% - ${rise}px)) scale(.9)`,opacity:0},
 ],{duration:d,delay:(o.delay||0)/(o.rate||1),easing:'linear',fill:'both'});
 const done=()=>node.remove();if(a?.finished)a.finished.then(done,done);else later(d+(o.delay||0),done);
}
function rollNumber(el,format,duration,rate=1){
 if(!el?.isConnected)return;const original=el.textContent;
 const value=Number(original.replace(/,/g,''));if(!/^[\d,]+$/.test(original)||!Number.isSafeInteger(value)||value<10)return;
 const restore=()=>{if(el.isConnected)el.textContent=original;};restores.add(restore);
 const begin=performance.now(),d=duration/rate;
 const run=now=>{if(!restores.has(restore))return;const t=clamp((now-begin)/d);
  if(t>=1){restore();restores.delete(restore);el.classList.add('sp-punch');return;}
  el.textContent=format(Math.round(value*ease.out(t)));queue();};
 const queue=()=>{const id=requestAnimationFrame(now=>{counters.delete(id);run(now);});counters.add(id);};queue();
}
function ghostBar(track,fromPercent,toPercent,rate=1){
 const bar=track?.querySelector(':scope>span');if(!bar||!(fromPercent>toPercent))return;
 const ghost=document.createElement('i');ghost.className='sp-ghost';ghost.setAttribute('aria-hidden','true');
 ghost.style.width=`calc((100% - 6px) * ${(fromPercent/100).toFixed(4)})`;track.prepend(ghost);
 animate(bar,[{width:`${fromPercent}%`},{width:`${toPercent}%`}],{duration:170/rate,easing:'cubic-bezier(.3,1.4,.5,1)'});
 const a=animate(ghost,[{width:`calc((100% - 6px) * ${(fromPercent/100).toFixed(4)})`,opacity:1},{width:`calc((100% - 6px) * ${(toPercent/100).toFixed(4)})`,opacity:.85}],{duration:620/rate,delay:380/rate,easing:'cubic-bezier(.5,0,.3,1)',fill:'forwards'});
 const done=()=>ghost.remove();if(a?.finished)a.finished.then(done,done);else later(1000/rate,done);
}
function flag(el,cls,ms,rate=1){if(!el?.isConnected)return;el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls);later(ms/rate,()=>el.classList.remove(cls));}

// ------------------------------------------------------------------ public
export function stopSpectacle(){
 for(const id of timers)clearTimeout(id);timers.clear();
 for(const a of animations){try{a.cancel();}catch{/* already gone */}}animations.clear();
 for(const id of counters)cancelAnimationFrame(id);counters.clear();
 for(const restore of restores)restore();restores.clear();
 clearParticles();
 host?.querySelectorAll?.('.sp-pop,.sp-flash,.sp-vignette').forEach(node=>node.remove());
 globalThis.document?.querySelectorAll?.('.sp-ghost').forEach(node=>node.remove());
}
function cancelPending(){for(const id of timers)clearTimeout(id);timers.clear();}

export function spectacleBounce(force=1,seed=1){
 if(!allowed())return;ensureHost();
 const row=rectOf(document.querySelector('.cube-row'));if(!row)return;
 const rand=visualRandom(seed+Math.floor(performance.now()));
 const y=row.top+row.height*.78,x=row.left+row.width*(.3+rand()*.4);
 burst(x,y,PALETTES.dust,rand,6+Math.round(force*6),{speed:200,flat:.35,lift:60,size:1.4,life:420,gravity:300});
 ring(x,y,'#7df9ff',{r0:4,r1:40+force*30,width:1.6,squash:.3,alpha:.55,life:360});
 shake(document.querySelector('.game-layout'),1.2+force*1.6,110,rand);start();
}

export function spectacleImpact({roll,enemyType,beforePercent,afterPercent,seed=1,rate=1,format=String}={}){
 if(!roll||!allowed())return;
 try{
  cancelPending();ensureHost();const rand=visualRandom(seed);
  const room=document.querySelector('#current-room'),layout=document.querySelector('.game-layout');
  const dice=[...document.querySelectorAll('.combat-stage .cube-die')].map(rectOf).filter(Boolean);
  const track=document.querySelector('.combat-screen .health-track'),title=document.querySelector('.combat-screen h1');
  const trackRect=rectOf(track),roomRect=rectOf(room);if(!trackRect||!roomRect)return;
  const finish=roll.killed&&enemyType==='boss',crit=!!roll.critical,best=roll.best||0;
  const palette=finish?PALETTES.finish:crit?PALETTES.critical:best>=5?null:best===4?PALETTES.magenta:best===3?PALETTES.gold:best===2?PALETTES.cyan:PALETTES.normal;
  const accent=palette||['#ff4dd2','#22f0ff','#ffffff','#ffd23f'];
  // Strike toward the drained end, but keep the burst inside the room's focus.
  const hit={x:trackRect.left+trackRect.width*(.5+(clamp((afterPercent??0)/100)-.5)*.3),y:trackRect.top+trackRect.height/2};
  const stop=finish?190:crit?140:best>=3?110:70,travel=150;
  const power=finish?1:crit?.8:best>=3?.65:best===2?.45:.3;
  // Hit-stop: a short frozen frame (flash only) before the strike lands.
  flash(['#ffffff',accent[0],'#ffffff'],.18+power*.3,stop+120,rate,dice[0]?centerOf(dice[0]):null);
  later(stop/rate,()=>{
   dice.forEach((r,i)=>{const c=centerOf(r);slash({x:c.x,y:r.top+r.height*.2},{x:hit.x+(rand()-.5)*30,y:hit.y},palette?palette[i%palette.length]:rainbow(rand),{width:2.2+power*2.6,arc:-(60+rand()*80),life:travel+80,delay:i*18,rate});
    burst(c.x,r.top+r.height*.35,accent,rand,4+Math.round(power*6),{speed:260,size:1.6,life:420,delay:i*18,rate,gravity:200});});
   start();
  });
  later((stop+travel)/rate,()=>{
   const count=Math.round(26+power*90+(best>=2?best*14:0));
   burst(hit.x,hit.y,palette,rand,count,{speed:380+power*360,size:2+power*1.4,life:640+power*400,rate,jitter:60,gravity:420});
   ring(hit.x,hit.y,accent[0],{r0:8,r1:90+power*200,width:2.5+power*3,squash:.55,life:480+power*240,rate});
   if(best>=2)ring(hit.x,hit.y,accent[1],{r0:4,r1:60+power*140,width:2,squash:.55,delay:90,life:520,rate});
   if(crit||finish)raysAt(hit.x,hit.y,crit?PALETTES.critical:PALETTES.finish,rand,finish?18:12,{length:180+power*260,width:14+power*16,life:760,rate});
   if(best>=5)raysAt(hit.x,hit.y,null,rand,14,{length:320,width:20,life:900,rate,alpha:.45});
   shake(layout,3+power*11,260+power*260,rand,rate);
   flag(title,'sp-hit',420,rate);flag(track,'sp-hit',420,rate);flag(room,crit?'sp-crit-tint':finish?'sp-finish-tint':'sp-hit-tint',520,rate);
   ghostBar(track,beforePercent??afterPercent,afterPercent??0,rate);
   rollNumber(document.querySelector('.damage-number>strong'),format,460,rate);
   const tone=finish?'finish':crit?'crit':best>=5?'rainbow':best===4?'magenta':best===3?'gold':best===2?'cyan':'normal';
   popText(format(roll.hpDamage??roll.total),hit.x,hit.y-trackRect.height*.9,`sp-damage sp-${tone}`,{rate,peak:1.4+power*.6,rise:60+power*40,drift:(rand()-.5)*40,duration:1100+power*400});
   const tags=[];if(finish)tags.push(['FINISH!','sp-finish']);else if(roll.killed)tags.push(['K.O.','sp-gold']);
   if(crit)tags.push(['CRITICAL!','sp-crit']);if(best>=2)tags.push([`COMBO ×${best}`,`sp-${best>=5?'rainbow':best===4?'magenta':best===3?'gold':'cyan'}`]);
   if(roll.phaseChanged)tags.push(['PHASE BREAK','sp-magenta']);if(roll.absorbed>0&&roll.shieldBroken)tags.push(['SHIELD BREAK','sp-cyan']);
   tags.forEach(([text,cls],i)=>popText(text,roomRect.left+roomRect.width/2,roomRect.top+roomRect.height*(.3+i*.075),`sp-tag ${cls}`,{rate,delay:80+i*110,rise:30,peak:1.6,duration:1200}));
   if(roll.phaseChanged){ring(hit.x,hit.y,'#b84dff',{r0:20,r1:roomRect.width*.6,width:4,squash:.4,life:700,rate});vignette(PALETTES.phase,900,rate);}
   if(finish){confettiShower(roomRect,null,rand,180,{rate,spread:700});confettiFountain(hit.x,hit.y,PALETTES.finish,rand,90,{rate});vignette(PALETTES.finish,1300,rate);ring(hit.x,hit.y,'#ffd23f',{r0:20,r1:roomRect.width*.9,width:6,squash:.5,life:900,rate});}
   else if(roll.killed){confettiFountain(hit.x,hit.y,palette,rand,50,{rate,speed:520});}
   if(crit)vignette(PALETTES.critical,700,rate);
   start();
  });
  if(roll.follow){
   later((stop+travel+430)/rate,()=>{
    const d=dice.at(-1);if(!d)return;const c=centerOf(d);
    slash({x:c.x,y:c.y},{x:hit.x,y:hit.y},'#3d8bff',{width:3,arc:-90,life:240,rate});
    later(200/rate,()=>{burst(hit.x,hit.y,PALETTES.follow,rand,40,{speed:420,size:1.8,life:600,rate});ring(hit.x,hit.y,'#7fd0ff',{r1:110,width:2.5,squash:.55,life:420,rate});
     shake(layout,4,200,rand,rate);if(roll.extra)popText(`+${format(roll.extra)}`,hit.x+40,hit.y-trackRect.height*1.6,'sp-damage sp-follow',{rate,peak:1.3,rise:50,duration:1000});start();});
   });
  }
 }catch{/* Presentation is optional; the committed result is already rendered. */}
}

export function spectacleFate({doubles=false,seed=1,rate=1}={}){
 if(!allowed())return;
 try{
  cancelPending();ensureHost();const rand=visualRandom(seed);
  const row=rectOf(document.querySelector('.cube-row'))||rectOf(document.querySelector('#current-room'));if(!row)return;
  const c=centerOf(row),palette=doubles?PALETTES.gold:PALETTES.cyan;
  ring(c.x,c.y+row.height*.3,palette[0],{r1:row.width*.5,width:3,squash:.32,life:600,rate});
  burst(c.x,c.y,palette,rand,doubles?90:40,{speed:420,size:2,life:700,rate,cone:[-Math.PI,0],gravity:380});
  if(doubles){confettiFountain(c.x,c.y,null,rand,70,{rate});popText('DOUBLE!',c.x,row.top-10,'sp-tag sp-gold',{rate,peak:1.7,duration:1200});}
  shake(document.querySelector('.game-layout'),doubles?6:3,240,rand,rate);start();
 }catch{/* optional */}
}

export function spectacleReveal({rarity=0,seed=1,rate=1}={}){
 if(!allowed())return;
 try{
  cancelPending();ensureHost();const rand=visualRandom(seed);
  const target=rectOf(document.querySelector('.loot-reveal .item-card'))||rectOf(document.querySelector('.chest-art'))||rectOf(document.querySelector('#current-room'));if(!target)return;
  const room=rectOf(document.querySelector('#current-room'))||target,c=centerOf(target),r=clamp(rarity,0,7);
  const palette=RARITY_PALETTES[r],accent=palette||['#ff4dd2','#22f0ff','#ffffff'];
  flash(accent,.2+r*.07,380+r*60,rate,c);
  ring(c.x,c.y,accent[0],{r0:20,r1:target.width*.6+r*40,width:2.5+r*.6,squash:.55,life:560+r*50,rate});
  for(let i=1;i<=Math.floor(r/2);i++)ring(c.x,c.y,palette?palette[i%palette.length]:rainbow(rand),{r0:10,r1:target.width*.5+r*50+i*40,width:2,squash:.55,delay:i*110,life:640,rate});
  burst(c.x,c.y,palette,rand,30+r*34,{speed:300+r*55,size:1.8+r*.15,life:700+r*80,rate,jitter:120,spread:target.width*.4,gravity:260});
  if(r>=3){confettiFountain(c.x,target.top+target.height*.2,palette,rand,40+(r-3)*45,{rate,speed:560+r*30,delay:120});}
  if(r>=4){raysAt(c.x,c.y,palette,rand,10+r*2,{length:Math.max(room.width,room.height)*.55,width:22+r*3,life:1200+r*80,rate,alpha:.35,spin:.35});vignette(accent,1200+r*120,rate);confettiShower(room,palette,rand,40+(r-4)*50,{rate,delay:250,spread:600});}
  if(r>=2)popText(`${RARITY_LABEL[r]}!`,c.x,target.top-8,`sp-tag sp-rarity-${r}`,{rate,delay:140,peak:1.5+r*.06,rise:34,duration:1400+r*80});
  if(r>=3)shake(document.querySelector('.game-layout'),2+r*1.3,280+r*30,rand,rate);
  start();
 }catch{/* optional */}
}

export function spectacleForge({kind='forge',seed=1,rate=1}={}){
 if(!allowed())return;
 try{
  cancelPending();ensureHost();const rand=visualRandom(seed);
  const target=rectOf(document.querySelector('.fusion-result-target'))||rectOf(document.querySelector('.forge-result'))||rectOf(document.querySelector('#current-room'));if(!target)return;
  const c=centerOf(target),palette=kind==='fuse'?PALETTES.magenta:kind==='bless'?PALETTES.cyan:PALETTES.gold;
  flash(palette,.22,420,rate,c);
  ring(c.x,c.y,palette[0],{r1:target.width*.55,width:3,squash:.5,life:560,rate});
  burst(c.x,c.y,palette,rand,70,{speed:460,size:2,life:720,rate,cone:[-Math.PI*1.05,.05],gravity:520,spread:30});
  shake(document.querySelector('.game-layout'),4,220,rand,rate);start();
 }catch{/* optional */}
}
