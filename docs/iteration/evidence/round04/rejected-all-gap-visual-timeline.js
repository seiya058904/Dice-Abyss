// A presentation clock, never a simulation clock. Long browser scheduling gaps
// cannot consume an entire short effect before its first submitted frame.
export const MAX_VISUAL_STEP=100;
export const VISUAL_WALL_LIMIT=8000;

export function createVisualTimeline(onStop=()=>{}) {
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
    elapsed+=Math.min(MAX_VISUAL_STEP,Math.max(0,now-last));last=Math.max(last,now);frames++;
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
