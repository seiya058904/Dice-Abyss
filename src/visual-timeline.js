// A presentation clock, never a simulation clock. Calibrate only its first
// sample so a late start cannot expire a short effect before its first draw.
// Later gaps advance real elapsed time; they must not extend moving dice.
export const MAX_VISUAL_STEP=100;
export const VISUAL_WALL_LIMIT=8000;

// Observe an entire already-bounded drawing surface. Unknown visibility stays
// drawable, and browsers without this API retain the complete original path.
// This only gates presentation work; it never pauses its clock or the game.
export function observeVisualSurface(target,onVisible=()=>{}){
  let active=true,visible=true,observer;
  if(typeof globalThis.IntersectionObserver==='function'){
    observer=new IntersectionObserver(entries=>{
      if(!active)return;
      const entry=entries.filter(item=>item.target===target).at(-1);if(!entry)return;
      const wasVisible=visible;visible=!!entry.isIntersecting;
      if(visible&&!wasVisible)onVisible();
    });
    observer.observe(target);
  }
  return {get visible(){return visible;},stop(){if(!active)return;active=false;observer?.disconnect();}};
}

// CSS playback rate includes delays, iterations, transitions and pseudo-elements.
// Only finite, owned scene animations can extend a reveal; ambient loops cannot.
// Optional browser surface: a missing or failing API keeps the original
// bounded presentation clock instead of throwing out of an asynchronous reveal.
export function paceSceneAnimations(root, playbackRate) {
  if(typeof root?.getAnimations!=='function')return [];
  let animations;
  try{animations=root.getAnimations({subtree:true});}
  catch{return [];}
  const finite=[];
  for(const animation of animations||[]){
    try{if(typeof animation?.updatePlaybackRate==='function')animation.updatePlaybackRate(playbackRate);}
    catch{ /* Keep this animation at its original timing. */ }
    let end;
    try{end=animation?.effect?.getComputedTiming?.().endTime;}
    catch{end=undefined;}
    if(Number.isFinite(end))finite.push(animation);
  }
  return finite;
}

export function createVisualTimeline(onStop=()=>{}, playbackRate=1) {
  if(![1,2].includes(playbackRate))throw new RangeError('Invalid presentation rate');
  const tracks=new Map(),waiters=new Set();
  let nextTrack=0,frame=0,timer=0,last=0,elapsed=0,frames=0,started=false,alive=true,reason,cleanupError;
  const result=why=>({reason:why,elapsed,frames,...(cleanupError?{cleanupError}: {})});
  const stop=(why='cancelled')=>{
    if(!alive)return;alive=false;reason=why;
    if(frame)cancelAnimationFrame(frame);if(timer)clearTimeout(timer);
    frame=timer=0;tracks.clear();
    document.removeEventListener?.('visibilitychange',visibility);
    try{onStop(result(why));}
    catch(error){cleanupError=String(error);}
    finally{for(const waiter of waiters)waiter.resolve(result(why));waiters.clear();}
  };
  const visibility=()=>{if(document.visibilityState==='hidden')stop('hidden');};
  const tick=now=>{
    frame=0;if(!alive)return;
    if(document.visibilityState==='hidden'){stop('hidden');return;}
    const step=Math.max(0,now-last);
    elapsed+=frames?step*playbackRate:Math.min(MAX_VISUAL_STEP,step*playbackRate);last=Math.max(last,now);frames++;
    for(const [id,track]of [...tracks]){
      track.draw(Math.min(elapsed,track.duration));
      if(elapsed>=track.duration)tracks.delete(id);
      if(!alive)return;
    }
    for(const waiter of [...waiters])if(elapsed>=waiter.duration){waiters.delete(waiter);waiter.resolve(result('elapsed'));}
    if(tracks.size||waiters.size)frame=requestAnimationFrame(tick);else stop('complete');
  };
  const start=()=>{
    if(!alive||started)return;started=true;last=performance.now();
    document.addEventListener?.('visibilitychange',visibility);
    if(document.visibilityState==='hidden'){stop('hidden');return;}
    // RAF may stop altogether in an occluded/failed renderer. This is an explicit
    // lifecycle deadline, not a fabricated successful visual completion.
    timer=setTimeout(()=>stop('deadline'),VISUAL_WALL_LIMIT);
    frame=requestAnimationFrame(tick);
  };
  const durationOf=value=>{
    if(!Number.isFinite(value)||value<0)throw new RangeError('Invalid visual duration');
    return value;
  };
  return {
    play(duration,draw){
      durationOf(duration);if(!alive)return()=>{};
      const id=++nextTrack;tracks.set(id,{duration,draw});start();
      return()=>tracks.delete(id);
    },
    wait(duration){
      durationOf(duration);
      if(!alive)return Promise.resolve(result(reason));
      if(elapsed>=duration)return Promise.resolve(result('elapsed'));
      return new Promise(resolve=>{waiters.add({duration,resolve});start();});
    },
    stop,
    get status(){return {...result(reason||'running'),started,active:alive};},
  };
}
