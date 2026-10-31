// One persistent GPU surface replaces 36 independently composited CSS faces.
// DOM faces remain the accessible, complete fallback on unsupported/lost contexts.
import {restPose} from './dice-motion.js';
import {observeVisualSurface} from './visual-timeline.js';
let surface,unavailable=false;
// Fast motion tolerates a smaller backing buffer. Resting faces regain full detail.
const REST_PIXELS=1800000,MOTION_PIXELS=900000;
const vertex=`attribute vec3 aPosition;attribute vec3 aNormal;attribute vec2 aUV;attribute float aFace;
uniform vec3 uAngles;uniform vec3 uOrigin;uniform float uSize;uniform highp vec2 uViewport;uniform vec4 uSurface;
varying vec3 vNormal;varying vec2 vUV;varying float vFace;
void main(){vec3 c=cos(uAngles),s=sin(uAngles);mat3 x=mat3(1.,0.,0.,0.,c.x,s.x,0.,-s.x,c.x);mat3 y=mat3(c.y,0.,-s.y,0.,1.,0.,s.y,0.,c.y);mat3 z=mat3(c.z,s.z,0.,-s.z,c.z,0.,0.,0.,1.);mat3 r=z*y*x;
vec3 p=r*aPosition*uSize+uOrigin;float focal=uViewport.x*1.35;vec2 pos=p.xy*focal/(focal-p.z);gl_Position=vec4((pos.x-uSurface.x)/(uSurface.z*.5),-(pos.y-uSurface.y)/(uSurface.w*.5),-p.z/focal,1.);vNormal=r*aNormal;vUV=aUV;vFace=aFace;}`;
const fragment=`precision mediump float;varying vec3 vNormal;varying vec2 vUV;varying float vFace;
uniform vec3 uColor;uniform sampler2D uAtlas;uniform float uValues[6];
void main(){vec3 n=normalize(vNormal);vec3 light=normalize(vec3(-.5,-.75,1.));float diffuse=max(0.,dot(n,light));float edge=min(min(vUV.x,1.-vUV.x),min(vUV.y,1.-vUV.y));
float frame=1.-smoothstep(.003,.012,abs(edge-.041));float inner=1.-smoothstep(.001,.004,abs(edge-.078));
float bevel=pow(max(0.,dot(n,normalize(vec3(-.4,-.5,1.)))),28.);float sheen=pow(max(0.,dot(n,normalize(vec3(.5,.6,1.)))),42.);
vec3 metal=vec3(.02,.027,.036)+vec3(.06,.075,.09)*diffuse+vec3(.34,.39,.44)*bevel+uColor*sheen*.22;metal+=uColor*frame*(.35+diffuse*.35)+vec3(.16,.19,.21)*inner;
// Broad steel reflection stays in the material, with no new per-frame texture.
metal+=vec3(.046,.056,.067)*(1.-vUV.y)*(.4+.6*diffuse);
// Neon rim and a coloured kicker light make each die read as lit by its own energy.
float rim=pow(1.-clamp(n.z,0.,1.),2.4);float kick=max(0.,dot(n,normalize(vec3(.75,.55,.45))));
metal+=uColor*(rim*.62+kick*.16)+vec3(.9,.95,1.)*pow(max(0.,dot(n,normalize(vec3(-.35,-.6,1.)))),90.)*.55;
int face=int(floor(vFace+.5));float value=1.;for(int i=0;i<6;i++){if(i==face)value=uValues[i];}
vec2 uv=vec2((value-1.+vUV.x)/6.,(face==0?0.:1.)*.5+vUV.y*.5);float ink=texture2D(uAtlas,uv).a;
vec3 color=mix(metal,uColor*(.96+diffuse*.3)+vec3(.06),ink);gl_FragColor=vec4(color,1.);}`;

const meshFaces=[([x,y])=>[x,y,.5],([x,y])=>[.5,y,-x],([x,y])=>[-x,y,-.5],([x,y])=>[-.5,y,x],([x,y])=>[x,-.5,y],([x,y])=>[x,.5,-y]];
function roundedCubePoint(face,u,v,radius){
  const p=meshFaces[face]([u-.5,v-.5]),inner=.5-radius,q=p.map(a=>Math.max(-inner,Math.min(inner,a))),d=p.map((a,i)=>a-q[i]),length=Math.hypot(...d)||1,n=d.map(a=>a/length);
  return [...q.map((a,i)=>a+n[i]*radius),...n,u,v,face];
}
export function roundedCubeMesh(steps=12, radius=.075) {
  const rows=[],point=(face,u,v)=>roundedCubePoint(face,u,v,radius);
  for(let f=0;f<6;f++)for(let y=0;y<steps;y++)for(let x=0;x<steps;x++){
    const a=point(f,x/steps,y/steps),b=point(f,(x+1)/steps,y/steps),c=point(f,(x+1)/steps,(y+1)/steps),d=point(f,x/steps,(y+1)/steps);
    rows.push(...a,...b,...c,...a,...c,...d);
  }
  return new Float32Array(rows);
}
export function indexedRoundedCubeMesh(steps=12,radius=.075){
  // Share only complete per-face attributes. Faces retain separate UVs, normals
  // and face numbers; the original triangle order and every float stay intact.
  if(!Number.isInteger(steps)||steps<1||6*(steps+1)**2>65536)throw new RangeError('Dice mesh exceeds 16-bit indices');
  const side=steps+1,vertices=new Float32Array(6*side*side*9),indices=new Uint16Array(6*steps*steps*6);
  let vertex=0,index=0;
  for(let face=0;face<6;face++){
    const start=face*side*side;
    for(let y=0;y<=steps;y++)for(let x=0;x<=steps;x++){vertices.set(roundedCubePoint(face,x/steps,y/steps,radius),vertex);vertex+=9;}
    for(let y=0;y<steps;y++)for(let x=0;x<steps;x++){
      const a=start+y*side+x,b=a+1,c=b+side,d=a+side;
      indices.set([a,b,c,a,c,d],index);index+=6;
    }
  }
  return {vertices,indices};
}
// The projection stays in row coordinates. Cropping only changes the final clip
// window, so resting/flight switches never move or magnify a die.
function dieProjector(d,p,rowWidth){
  const [rx,ry,rz]=[p.rx,p.ry,p.rz].map(a=>a*Math.PI/180),[cx,cy,cz]=[rx,ry,rz].map(Math.cos),[sx,sy,sz]=[rx,ry,rz].map(Math.sin);
  return point=>{
  const [x,y,z]=point,ay=y*cx-z*sx,az=y*sx+z*cx,bx=x*cy+az*sy,bz=-x*sy+az*cy;
  const px=(bx*cz-ay*sz)*d.size+d.x+p.x*d.size,py=(bx*sz+ay*cz)*d.size+d.y+p.y*d.size,pz=bz*d.size+p.z*d.size,focal=rowWidth*1.35;
  return {x:px*focal/(focal-pz),y:py*focal/(focal-pz)};
  };
}
export function projectDiePoint(d,p,point,rowWidth){
  return dieProjector(d,p,rowWidth)(point);
}
function motionFitsBounds(records,poses,rowWidth,rowHeight,previous){
  if(!poses||!previous||!records.length||!Number.isFinite(rowWidth)||rowWidth<=0||!Number.isFinite(rowHeight))return false;
  const {left,top,right,bottom,width,height}=previous,focal=rowWidth*1.35;
  if(!Number.isFinite(left)||!Number.isFinite(top)||!Number.isFinite(right)||!Number.isFinite(bottom)
      ||width!==right-left||height!==bottom-top||width<=0||height<=0||!Number.isFinite(focal))return false;
  // An enclosing sphere needs no rotation or eight-corner projection. Only a
  // proven fit may reuse the existing flight envelope; every uncertain or
  // expanding pose still takes the exact original path below.
  for(let i=0;i<records.length;i++){
    const d=records[i],p=poses[i];
    if(!p||!Number.isFinite(d.x)||!Number.isFinite(d.y)||!Number.isFinite(d.size)||d.size<=0
        ||!Number.isFinite(p.x)||!Number.isFinite(p.y)||!Number.isFinite(p.z)
        ||!Number.isFinite(p.rx*Math.PI/180)||!Number.isFinite(p.ry*Math.PI/180)||!Number.isFinite(p.rz*Math.PI/180))return false;
    const x=d.x+p.x*d.size,y=d.y+p.y*d.size,z=p.z*d.size;
    const radius=d.size*Math.sqrt(.75)+Math.max(1,Math.abs(x),Math.abs(y),Math.abs(z),d.size)*1e-10;
    const near=focal-z-radius,far=focal-z+radius;
    if(!(near>0&&far>0))return false;
    const lo=focal/far,hi=focal/near,x0=x-radius,x1=x+radius,y0=y-radius,y1=y+radius;
    // Interval projection accounts for both coordinate signs and depth. Use
    // the original outward rounding, including fractional previous edges.
    if(!(Math.floor(x0*(x0<0?hi:lo)-4)>=left&&Math.ceil(x1*(x1<0?lo:hi)+4)<=right
        &&Math.floor(y0*(y0<0?hi:lo)-4)>=top&&Math.ceil(y1*(y1<0?lo:hi)+4)<=bottom))return false;
  }
  return true;
}
export function diceSurfaceBounds(records,poses,rowWidth,rowHeight,previous=null){
  if(motionFitsBounds(records,poses,rowWidth,rowHeight,previous)){
    const {left,top,right,bottom}=previous;
    return {left,top,right,bottom,width:right-left,height:bottom-top};
  }
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for(let i=0;i<records.length;i++){const project=dieProjector(records[i],poses?.[i]||restPose(i),rowWidth);for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5]){
    const q=project([x,y,z]);
    left=Math.min(left,q.x);top=Math.min(top,q.y);right=Math.max(right,q.x);bottom=Math.max(bottom,q.y);
  }}
  // Bounding the unrounded cube also bounds every rounded mesh triangle. Four
  // CSS pixels protect edge antialiasing independently of DPR and user scale.
  left=Math.floor(left-4);top=Math.floor(top-4);right=Math.ceil(right+4);bottom=Math.ceil(bottom+4);
  if(poses){
    // Allocate the usual throw envelope once, then grow only if an actual pose
    // needs more room. Keep it until rest; never shrink/reallocate each frame.
    const overscan=Math.max(...records.map(d=>d.size))*2.2;
    left=Math.min(left,previous?.left??-rowWidth/2);right=Math.max(right,previous?.right??rowWidth/2);
    top=Math.min(top,previous?.top??(-rowHeight/2-overscan));bottom=Math.max(bottom,previous?.bottom??(rowHeight/2+overscan));
  }
  return {left,top,right,bottom,width:right-left,height:bottom-top};
}
export function resizeDiceBuffer(canvas,width,height){
  // Shrink first: a portrait→landscape resize must not allocate new width × old
  // height before settling at the requested pixel budget (and vice versa).
  if(width<canvas.width)canvas.width=width;if(height<canvas.height)canvas.height=height;
  if(width!==canvas.width)canvas.width=width;if(height!==canvas.height)canvas.height=height;
}
function initializeSurface(s){
  const {gl}=s,compiled=[];let program,buffer,indexBuffer,texture;
  const shader=(type,source)=>{const sh=gl.createShader(type);if(!sh)throw Error('Dice shader unavailable');compiled.push(sh);gl.shaderSource(sh,source);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error('Dice shader unavailable');return sh;};
  try{
    program=gl.createProgram();if(!program)throw Error('Dice program unavailable');
    for(const [type,source]of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]])gl.attachShader(program,shader(type,source));
    gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Dice program unavailable');
    gl.useProgram(program);const mesh=indexedRoundedCubeMesh();buffer=gl.createBuffer();if(!buffer)throw Error('Dice buffer unavailable');gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,mesh.vertices,gl.STATIC_DRAW);
    indexBuffer=gl.createBuffer();if(!indexBuffer)throw Error('Dice index buffer unavailable');gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.STATIC_DRAW);
    for(const [name,length,offset]of [['aPosition',3,0],['aNormal',3,3],['aUV',2,6],['aFace',1,8]]){const location=gl.getAttribLocation(program,name);if(location<0)throw Error('Dice attribute unavailable');gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,length,gl.FLOAT,false,36,offset*4);}
    const uniforms=Object.fromEntries(['uAngles','uOrigin','uSize','uViewport','uSurface','uColor','uValues','uAtlas'].map(n=>[n,gl.getUniformLocation(program,n)]));
    if(Object.values(uniforms).some(location=>location===null))throw Error('Dice uniform unavailable');
    texture=gl.createTexture();if(!texture)throw Error('Dice texture unavailable');gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    Object.assign(s,{program,uniforms,buffer,indexBuffer,texture,count:mesh.indices.length,font:''});
    Object.assign(s.canvas.dataset,{meshVertices:String(mesh.vertices.length/9),meshIndices:String(mesh.indices.length),meshBytes:String(mesh.vertices.byteLength+mesh.indices.byteLength)});return true;
  }catch{
    if(texture)gl.deleteTexture(texture);if(indexBuffer)gl.deleteBuffer(indexBuffer);if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);return false;
  }finally{for(const sh of compiled)gl.deleteShader(sh);}
}
function createSurface(){
  const canvas=document.createElement('canvas');canvas.className='dice-surface';canvas.setAttribute('aria-hidden','true');
  let gl;try{gl=canvas.getContext('webgl',{alpha:true,antialias:true,powerPreference:'high-performance',premultipliedAlpha:false});}catch{return null;}
  if(!gl)return null;
  const s={canvas,gl,lost:false,restore:null};
  if(!initializeSurface(s)){gl.getExtension('WEBGL_lose_context')?.loseContext();return null;}
  canvas.dataset.contextState='ready';
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();s.lost=true;canvas.dataset.contextState='lost';canvas.parentElement?.classList.remove('gpu-dice');});
  canvas.addEventListener('webglcontextrestored',()=>{
    if(surface!==s)return;
    // A restored context has no valid old programs, buffers or textures. Keep
    // the canvas and active mount, rebuild resources, then redraw that scene.
    s.lost=!initializeSurface(s);canvas.dataset.contextState=s.lost?'fallback':'ready';
    if(s.lost){canvas.parentElement?.classList.remove('gpu-dice');return;}
    s.restore?.();
  });
  return s;
}
function uploadAtlas(s){
  const font=document.fonts.check('96px "Abyss Pixel"')?'"Abyss Pixel"':'Consolas';if(s.font===font)return false;s.font=font;
  const atlas=document.createElement('canvas');atlas.width=1536;atlas.height=512;const ctx=atlas.getContext('2d');
  ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`400 190px ${font}`;
  const pips=[[[1,1]],[[0,0],[2,2]],[[0,0],[1,1],[2,2]],[[0,0],[2,0],[0,2],[2,2]],[[0,0],[2,0],[1,1],[0,2],[2,2]],[[0,0],[2,0],[0,1],[2,1],[0,2],[2,2]]];
  for(let v=1;v<=6;v++){const x=(v-1)*256;ctx.fillText(String(v),x+128,128);for(const [px,py]of pips[v-1]){ctx.beginPath();ctx.arc(x+69+px*59,256+69+py*59,14,0,Math.PI*2);ctx.fill();}}
  s.gl.bindTexture(s.gl.TEXTURE_2D,s.texture);s.gl.texImage2D(s.gl.TEXTURE_2D,0,s.gl.RGBA,s.gl.RGBA,s.gl.UNSIGNED_BYTE,atlas);
  return true;
}
export function mountDiceSurface(){
  const row=document.querySelector('.cube-row');if(!row)return null;
  if(!surface&&!unavailable){surface=createSurface();unavailable=!surface;}
  const s=surface;if(!s)return null;
  const dice=[...row.querySelectorAll('.cube-die')];if(!dice.length)return null;
  // A render can replace the row during a loss. Its mount must still become
  // the restoration owner so recovery never paints a detached earlier scene.
  row.prepend(s.canvas);if(!s.lost){row.classList.add('gpu-dice');uploadAtlas(s);}
  let alive=true,w=0,h=0,records=[],lastPoses,clip=null,motionClip=null,visibility,dirty=false;
  const sizeBuffer=moving=>{
    const budget=moving?MOTION_PIXELS:REST_PIXELS,ratio=Math.min(devicePixelRatio||1,1.5,Math.sqrt(budget/Math.max(1,clip.width*clip.height)));
    const width=Math.max(1,Math.floor(clip.width*ratio)),height=Math.max(1,Math.floor(clip.height*ratio));
    resizeDiceBuffer(s.canvas,width,height);
    s.canvas.dataset.pixelBudget=String(budget);s.canvas.dataset.motionQuality=moving?'motion':'rest';
  };
  const measure=()=>{
    const bounds=row.getBoundingClientRect();w=bounds.width;h=bounds.height;motionClip=null;clip=null;
    records=dice.map(el=>{const b=el.getBoundingClientRect(),color=getComputedStyle(el).color.match(/[\d.]+/g).slice(0,3).map(Number);return{x:b.x-bounds.x+b.width/2-w/2,y:b.y-bounds.y+b.width/2-h/2,size:b.width,color:color.map(c=>c/255),values:[...el.querySelectorAll('.cube-face')].map(f=>Number(f.dataset.face))};});
  };
  measure();
  const draw=poses=>{
    lastPoses=poses;
    if(!alive||s.lost||!row.isConnected||s.canvas.parentElement!==row)return;
    const next=diceSurfaceBounds(records,poses,w,h,motionClip);if(poses)motionClip=next;else motionClip=null;
    if(!clip||clip.left!==next.left||clip.top!==next.top||clip.width!==next.width||clip.height!==next.height){clip=next;s.canvas.style.cssText=`position:absolute;pointer-events:none;left:${clip.left+w/2}px;top:${clip.top+h/2}px;width:${clip.width}px;height:${clip.height}px;z-index:2`;}
    // Keep the conservative flight envelope current while clipped out of view.
    // IntersectionObserver then sees a die approaching the viewport without a
    // per-frame layout read, while invisible frames allocate and submit no GL.
    dirty=true;if(visibility&&!visibility.visible)return;
    // Projection flips Y; outward mesh faces therefore arrive clockwise.
    sizeBuffer(!!poses);const {gl,uniforms:u}=s;gl.viewport(0,0,s.canvas.width,s.canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.frontFace(gl.CW);gl.cullFace(gl.BACK);gl.useProgram(s.program);gl.uniform2f(u.uViewport,w,h);gl.uniform4f(u.uSurface,clip.left+clip.width/2,clip.top+clip.height/2,clip.width,clip.height);gl.uniform1i(u.uAtlas,0);
    records.forEach((d,i)=>{const p=poses?.[i]||restPose(i);gl.uniform3f(u.uAngles,p.rx*Math.PI/180,p.ry*Math.PI/180,p.rz*Math.PI/180);gl.uniform3f(u.uOrigin,d.x+p.x*d.size,d.y+p.y*d.size,p.z*d.size);gl.uniform1f(u.uSize,d.size);gl.uniform3fv(u.uColor,d.color);gl.uniform1fv(u.uValues,d.values);gl.drawElements(gl.TRIANGLES,s.count,gl.UNSIGNED_SHORT,0);});
    dirty=false;
  };
  const restore=()=>{if(!alive||!row.isConnected||s.canvas.parentElement!==row||s.lost)return;measure();uploadAtlas(s);row.classList.add('gpu-dice');draw(lastPoses);};s.restore=restore;
  draw();visibility=observeVisualSurface(s.canvas,()=>{if(dirty)draw(lastPoses);});
  // A sized fallback is optional browser surface: without ResizeObserver the
  // CSS faces remain complete, and this listener keeps the GPU surface honest
  // on real window resizes. The mount owns it and stop() releases it.
  const onResize=()=>{if(alive&&row.isConnected){const bounds=row.getBoundingClientRect();if(Math.abs(bounds.width-w)>.01||Math.abs(bounds.height-h)>.01){measure();draw(lastPoses);}}};
  let observer=null,detachResize=null;
  if(typeof globalThis.ResizeObserver==='function'){observer=new globalThis.ResizeObserver(onResize);observer.observe(row);}
  else if(typeof globalThis.addEventListener==='function'){globalThis.addEventListener('resize',onResize);detachResize=()=>globalThis.removeEventListener?.('resize',onResize);}
  document.fonts.ready.then(()=>{if(alive&&!s.lost&&row.isConnected&&!row.classList.contains('rolling')&&uploadAtlas(s))draw(lastPoses);});
  return {draw,stop:()=>{if(!alive)return;alive=false;observer?.disconnect();detachResize?.();visibility.stop();if(s.restore===restore)s.restore=null;}};
}
