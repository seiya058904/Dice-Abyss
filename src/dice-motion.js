// Visual rigid bodies in die-width units. This never reads or advances game RNG.
// A fixed step makes throws independent of frame rate; the final face is already
// committed by the engine. Rotation settles onto that face after the last bounce.
import {createVisualTimeline} from './visual-timeline.js';
export const THROW_DURATION = 1280;
export function restPose(index=0){const [rx,ry,rz]=[[-18,-24,-3],[-15,18,4],[-20,-16,-4],[-16,20,3],[-20,-20,-2],[-14,14,3]][index%6];return{x:0,y:0,z:0,rx,ry,rz};}

export function throwFrames(count, seed, spacing = 1.5, bound = 6) {
  let rng = seed >>> 0;
  const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
  const bodies = Array.from({ length: count }, (_, i) => ({
    x: (i - (count - 1) / 2) * spacing, y: 0, z: 0,
    vx: (i % 2 ? -1 : 1) * (1.1 + random() * .9),
    vy: -5.5 - random() * 1.5, vz: (random() - .5) * 1.8,
    turns: [2 + Math.floor(random() * 2), (i % 2 ? -1 : 1) * (2 + Math.floor(random() * 2)), (random() - .5) * 2],
    home: (i - (count - 1) / 2) * spacing, hits: 0,
  }));
  const frames = [], dt = 1 / 120, duration = THROW_DURATION / 1000;
  for (let step = 0; step <= Math.ceil(duration / dt); step++) {
    const t = step * dt, impacts = [];
    if (step) {
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        b.vy += 19 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        if (b.y > 0) {
          b.y = 0;
          if (b.vy > .8 && t < 1.05) { b.vy *= -.34; b.vx *= .58; b.vz *= .45; b.hits++; impacts.push({ index: i, force: Math.min(1, -b.vy / 3) }); }
          else { b.vy = 0; b.vx *= .86; b.vz *= .86; }
        }
        if (Math.abs(b.x) > bound) { b.x = Math.sign(b.x) * bound; b.vx *= -.65; }
        if (Math.abs(b.z) > .65) { b.z = Math.sign(b.z) * .65; b.vz *= -.5; }
      }
      for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], b = bodies[j], dx = b.x - a.x, dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 1.12 && Math.abs(b.z - a.z) < .8 && distance > .001) {
          const nx = dx / distance, ny = dy / distance, overlap = (1.12 - distance) / 2;
          a.x -= nx * overlap; b.x += nx * overlap; a.y -= ny * overlap; b.y += ny * overlap;
          const speed = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (speed < 0) { const impulse = speed * .72; a.vx += impulse * nx; a.vy += impulse * ny; b.vx -= impulse * nx; b.vy -= impulse * ny; impacts.push({index:i,force:.25}); }
        }
      }
    }
    frames.push({ t: Math.min(1, t / duration), impacts, dice: bodies.map((b,i) => {
      const settle = Math.max(0, Math.min(1, (t - .86) / (duration - .86)));
      const blend = settle * settle * (3 - 2 * settle), spin = 1 - Math.pow(1 - Math.min(1, t / 1.12), 2.35);
      const rock = t > .58 ? Math.sin((t - .58) * 28) * Math.exp(-(t - .58) * 9) * 12 * (1 - blend) : 0;
      const rest=restPose(i);
      return {x: (b.x - b.home) * (1 - blend), y: Math.min(0,b.y) * (1 - blend), z: b.z * (1 - blend),
        rx: rest.rx + 360 * b.turns[0] * (spin - 1) + rock,
        ry: rest.ry + 360 * b.turns[1] * (spin - 1), rz: rest.rz + 360 * b.turns[2] * (spin - 1) - rock * .5};
    }) });
  }
  frames[frames.length - 1].dice = bodies.map((_,i) => restPose(i));
  return frames;
}

export function animateDice(seed, onImpact = () => {}, onFrame = () => {}, presentation = null, onRest = () => {}) {
  const dice = [...document.querySelectorAll('.rolling .cube-die')];
  if (!dice.length) return () => {};
  const width = dice[0].getBoundingClientRect().width;
  const row = dice[0].parentElement.getBoundingClientRect();
  const spacing = dice.length > 1 ? (dice[1].getBoundingClientRect().x - dice[0].getBoundingClientRect().x) / width : 1.5;
  const frames = throwFrames(dice.length, seed, spacing, Math.max(.8,row.width / width / 2 - .66));
  const gpu=()=>dice[0].parentElement.classList?.contains('gpu-dice');
  const nodes = dice.map(el => ({ flight:el.querySelector('.die-flight'), cube:el.querySelector('.die-cube'), shadow:el.querySelector('.die-shadow') }));
  const clear=()=>nodes.forEach(n=>{n.flight.style.transform='';n.cube.style.transform='';n.shadow.style.transform='';n.shadow.style.opacity='';});
  const timeline=presentation||createVisualTimeline(clear);
  let previous = -1, lastSound = -100, previousGPU;
  const draw = elapsed => {
    const index = Math.min(frames.length - 1, Math.floor(elapsed / THROW_DURATION * (frames.length - 1)));
    const sample = frames[index], landed = elapsed >= THROW_DURATION;
    // The throw already has fixed 120 Hz samples. Faster displays can request
    // the same pose again; neither its pixels nor its shadows changed. A lost
    // or restored context still needs that sample in its current fallback mode.
    if(index===previous&&!landed&&!!gpu()===previousGPU)return;
    // The renderer can submit the final pose directly at resting quality,
    // without first drawing an immediately overwritten motion-sized buffer.
    onFrame(sample.dice, landed);
    const renderedOnGPU=!!gpu();
    sample.dice.forEach((d,i) => {
      if(!renderedOnGPU){
        nodes[i].flight.style.transform = `translate3d(${d.x * width}px,${d.y * width}px,${d.z * width}px)`;
        nodes[i].cube.style.transform = `rotateX(${d.rx}deg) rotateY(${d.ry}deg) rotateZ(${d.rz}deg)`;
      }
      nodes[i].shadow.style.transform = `translateX(${d.x * width}px) scale(${1 + d.y * .22})`;
      nodes[i].shadow.style.opacity = String(Math.max(.15, 1 + d.y * .4));
    });
    for (let i = previous + 1; i <= index; i++) if (frames[i].impacts.length && elapsed - lastSound > 75) { onImpact('bounce'); lastSound = elapsed; }
    previous = index;previousGPU=renderedOnGPU;
    if(landed)onRest();
  };
  const stopTrack=timeline.play(THROW_DURATION,draw);
  return () => { stopTrack();if(!presentation)timeline.stop();clear(); };
}
