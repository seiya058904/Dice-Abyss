import test from 'node:test';
import assert from 'node:assert/strict';
import {spectacleImpact,spectacleReveal,spectacleForge,spectacleFate,spectacleBounce,stopSpectacle,visualRandom} from '../src/spectacle.js';

function element(name,rect={left:0,top:0,width:100,height:40}){
 const classes=new Set(),children=[];
 const node={name,style:{},dataset:{},children,isConnected:true,textContent:'',offsetWidth:1,
  classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)},classes,
  setAttribute(){},append(...nodes){children.push(...nodes);},prepend(...nodes){children.unshift(...nodes);},remove(){node.isConnected=false;},
  getBoundingClientRect:()=>({...rect,right:rect.left+rect.width,bottom:rect.top+rect.height}),
  querySelector:()=>null,querySelectorAll:()=>[],
  animate(){const animation={cancelled:false,finished:new Promise(()=>{}),cancel(){animation.cancelled=true;}};scene.animations.push(animation);return animation;},
  getContext:()=>new Proxy({},{get:(_target,key)=>key==='createRadialGradient'||key==='createLinearGradient'?()=>({addColorStop(){}}):()=>{} ,set:()=>true}),
 };
 return node;
}
let scene;
function mount({effects='full',reduced=false}={}){
 const keys=['document','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout','matchMedia','performance','innerWidth','innerHeight'];
 const saved=Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const timers=new Map(),frames=new Map();let id=0;
 scene={timers,frames,animations:[],created:[]};
 const track=element('track',{left:100,top:100,width:600,height:30}),bar=element('bar');track.querySelector=()=>bar;
 const room=element('room',{left:50,top:50,width:900,height:700}),title=element('title'),strong=element('strong');strong.textContent='1,234';
 const die=element('die',{left:300,top:400,width:90,height:90});
 const map={'#current-room':room,'.combat-screen .health-track':track,'.combat-screen h1':title,'.damage-number>strong':strong,'.game-layout':element('layout'),'.cube-row':element('row',{left:200,top:380,width:500,height:120}),'.loot-reveal .item-card':element('card',{left:300,top:300,width:300,height:200})};
 const body=element('body');
 const doc={body,documentElement:{dataset:{effects}},visibilityState:'visible',addEventListener(){},
  createElement:tag=>{const n=element(tag);scene.created.push(n);return n;},
  querySelector:s=>map[s]||null,querySelectorAll:s=>s==='.combat-stage .cube-die'?[die,die]:[]};
 Object.assign(globalThis,{document:doc,innerWidth:1920,innerHeight:1080,
  requestAnimationFrame:cb=>{frames.set(++id,cb);return id;},cancelAnimationFrame:k=>frames.delete(k),
  setTimeout:(cb,ms)=>{timers.set(++id,{cb,ms});return id;},clearTimeout:k=>timers.delete(k),
  matchMedia:()=>({matches:reduced})});
 Object.defineProperty(globalThis,'performance',{value:{now:()=>0},configurable:true,writable:true});
 return{body,strong,track,restore(){for(const k of keys){if(saved[k])Object.defineProperty(globalThis,k,saved[k]);else delete globalThis[k];}}};
}
const roll={values:[6,6,6],best:3,critical:true,follow:true,extra:12,killed:true,total:1234,hpDamage:1234,main:1222};

test('spectacle is inert without a browser document',()=>{
 const saved=Object.getOwnPropertyDescriptor(globalThis,'document');delete globalThis.document;
 try{assert.doesNotThrow(()=>{stopSpectacle();spectacleImpact({roll});spectacleReveal({rarity:7});spectacleForge();spectacleFate();spectacleBounce();});}
 finally{if(saved)Object.defineProperty(globalThis,'document',saved);}
});

for(const options of [{effects:'low'},{reduced:true}])test(`spectacle mounts nothing with ${options.effects?'low effects':'reduced motion'}`,()=>{
 const env=mount(options);
 try{spectacleImpact({roll,enemyType:'boss',beforePercent:80,afterPercent:0,seed:9});spectacleReveal({rarity:7,seed:9});spectacleBounce();
  assert.equal(env.body.children.length,0);assert.equal(scene.timers.size,0);assert.equal(scene.frames.size,0);}
 finally{env.restore();}
});

test('impact never touches Math.random or the committed roll, and stop releases every owned resource',()=>{
 const env=mount(),random=Math.random;let calls=0;Math.random=()=>{calls++;return random();};
 const frozen=JSON.stringify(roll);
 try{
  spectacleImpact({roll,enemyType:'boss',beforePercent:80,afterPercent:0,seed:42,format:n=>n.toLocaleString('en-US')});
  assert(env.body.children.length>0,'the overlay mounts');assert(scene.timers.size>0,'the strike is scheduled');
  for(const [key,timer]of [...scene.timers].sort((a,b)=>a[1].ms-b[1].ms)){scene.timers.delete(key);timer.cb();}
  assert(scene.frames.size>0,'particles animate');
  assert.equal(calls,0);assert.equal(JSON.stringify(roll),frozen);
  stopSpectacle();
  assert.equal(scene.timers.size,0);assert.equal(scene.frames.size,0);
  assert(scene.animations.every(a=>a.cancelled),'shake, ghost and pops are cancelled');
  assert.equal(env.strong.textContent,'1,234','the committed damage text is restored');
 }finally{Math.random=random;stopSpectacle();env.restore();}
});

test('visual randomness is reproducible per seed',()=>{
 const a=visualRandom(7),b=visualRandom(7),c=visualRandom(8);
 const take=r=>Array.from({length:5},r);
 assert.deepEqual(take(a),take(b));assert.notDeepEqual(take(visualRandom(7)),take(c));
});
