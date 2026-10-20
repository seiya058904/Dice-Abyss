// Headless integration harness for the real app module. Only browser rendering,
// focus and effects are replaced; game/storage/view modules and event handlers
// execute unchanged. Native two-tab delivery is covered by the browser driver.
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {webcrypto} from 'node:crypto';

export async function recoveryFixture(source, options = {}) {
  source=path.resolve(source);
  const E=await import(pathToFileURL(path.join(source,'src/engine.js')));
  const S=await import(pathToFileURL(path.join(source,'src/storage.js')));
  const initial=options.state||E.newGame(13013);
  initial.qaRecovery={unicode:'完整旅途 雪',nested:{unknown:[null,7,{keep:true}]}};
  const original=S.encodeSave(initial),map=new Map([[S.SAVE_KEY,original],[S.BACKUP_KEY,original]]),writes=[];
  const storage={getItem:key=>map.get(key)??null,setItem(key,value){writes.push([key,String(value)]);map.set(key,String(value));},removeItem:key=>map.delete(key),clear:()=>map.clear()};
  const listeners={document:new Map(),window:new Map()},downloads=[],blobs=[],lockTasks=[];
  const noop=()=>{},classes={add:noop,remove:noop,contains:()=>false};
  let doc;
  const element=(tag='div')=>({tagName:tag.toUpperCase(),dataset:{},style:{setProperty:noop},classList:classes,innerHTML:'',textContent:'',open:false,
    setAttribute:noop,append:noop,remove:noop,getClientRects:()=>[{}],querySelector:()=>null,querySelectorAll:()=>[],contains:()=>false,
    focus(){doc.activeElement=this;},showModal(){this.open=true;},close(){this.open=false;},addEventListener:noop,
    click(){if(tag==='a')downloads.push({href:this.href,name:this.download});}});
  const app=element(),announcer=element(),body=element('body'),documentElement=element('html');
  doc={body,documentElement,activeElement:body,visibilityState:'visible',createElement:element,
    querySelector:selector=>selector==='#app'?app:selector==='#announcement'?announcer:null,querySelectorAll:()=>[],
    addEventListener(type,handler){listeners.document.set(type,handler);}};
  app.ownerDocument=doc;
  const window={addEventListener(type,handler){listeners.window.set(type,handler);},scrollTo:noop};
  const locks={request(name,task){lockTasks.push(name);return options.lock?options.lock(task):Promise.resolve().then(task);}};
  const bindings={document:doc,window,localStorage:storage,navigator:options.noLocks?{}:{locks},crypto:webcrypto,
    Blob,TextEncoder,JSON,Math,Promise,Error,SyntaxError,Uint32Array,structuredClone,matchMedia:()=>({matches:false}),
    setTimeout:()=>1,clearTimeout:noop,requestAnimationFrame:noop,
    URL:{createObjectURL(blob){blobs.push(blob);return `blob:fixture-${blobs.length}`;},revokeObjectURL:noop}};
  const focus=()=>({capture:noop,cancel:noop,observe:noop,restore:noop});
  const stubs={createActionFocus:focus,createSettingsFocus:focus,
    createFusionController:()=>({closeTooltip:noop,closeMenu:noop,reconcile:()=>({}),afterRender:noop,reset:noop,committed:noop,handleClick:()=>false,handleInput:()=>false,handleChange:()=>false,handleKeydown:()=>false}),
    captureWorkbenchPosition:()=>({x:0,y:0,scroll:[]}),restoreWorkbenchPosition:noop,updateFusionDOM:()=>false,
    captureInventoryPosition:()=>null,restoreInventoryPosition:noop,
    mountEffects:()=>({wait:()=>Promise.resolve({reason:'settled'})})};
  // Storage's default argument resolves in its own ES-module realm. Supply the
  // same browser store explicitly while retaining every real storage check.
  const storageBindings={loadSave:()=>S.loadSave(storage),loadSettings:()=>S.loadSettings(storage),
    readLegacyBackup:()=>S.readLegacyBackup(storage),saveGame:(state,expected)=>S.saveGame(state,expected,storage),
    saveImportedGame:(state,raw,expected)=>S.saveImportedGame(state,raw,expected,storage),
    inspectSaveRecovery:()=>S.inspectSaveRecovery(storage),
    restoreMissingSave:(state,raw)=>S.restoreMissingSave(state,raw,storage)};
  const originalSource=await fs.readFile(path.join(source,'src/app.js'),'utf8');
  const imports=[...originalSource.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?\s*$/gm)];
  for(const match of imports){
    const names=match[1].split(',').map(value=>value.trim()).filter(Boolean);
    const needed=names.filter(name=>!Object.hasOwn(stubs,name));
    const module=needed.length?await import(pathToFileURL(path.resolve(source,'src',match[2]))):{};
    for(const name of names)bindings[name]=stubs[name]||storageBindings[name]||module[name];
  }
  const sourceText=originalSource.replace(/^import\s*\{[^}]+\}\s*from\s*['"][^'"]+['"];?\s*$/gm,'');
  const context=vm.createContext(bindings);
  new vm.Script(sourceText+'\n;globalThis.__recoveryProbe={get state(){return state},get ui(){return ui},get pending(){return pending},get dialog(){return dialog},get generation(){return animationGeneration},get visualState(){return visualState},act,begin,arm(callback){pending=callback;dialog.showModal()},present(){ui.busy=true;ui.rolling=true;visualState={...state,qaPresentation:true};animationGeneration++}};', {filename:path.join(source,'src/app.js')}).runInContext(context);
  const probe=context.__recoveryProbe;
  const click=async(action,data={})=>{
    const target={dataset:{action,...data},disabled:false,closest:()=>target,setAttribute:noop};
    await listeners.document.get('click')({target,preventDefault:noop});
  };
  return {E,S,storage,map,writes,original,initial,app,announcer,probe,downloads,blobs,lockTasks,listeners,
    emit(key,storageArea=storage,values={}){return listeners.window.get('storage')({key,storageArea,...values});},click,
    async exportRaw(){await click('export');return blobs.at(-1)?.text();}};
}
