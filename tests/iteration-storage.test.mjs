import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

// The same regression cases can target the unmodified input during an audit.
const root=process.env.QA_STORAGE_ROOT?pathToFileURL(process.env.QA_STORAGE_ROOT.replace(/\/$/,'')+'/'):new URL('../',import.meta.url);
const E=await import(new URL('src/engine.js',root));
const S=await import(new URL('src/storage.js',root));
const V=await import(new URL('src/views.js',root));
const golden=JSON.parse(readFileSync(new URL('tests/fixtures/v4-baseline.json',root),'utf8'));
const ui={view:'game',busy:false};
const memory=()=>{const map=new Map(),writes=[];return {map,writes,getItem:key=>map.get(key)??null,setItem:(key,value)=>{writes.push(key);map.set(key,value);}};};
function envelope(state){
 const payload=JSON.stringify(state);let hash=2166136261;
 for(let i=0;i<payload.length;i++)hash=Math.imul(hash^payload.charCodeAt(i),16777619);
 return JSON.stringify({format:'dice-abyss',version:state.version,payload,checksum:(hash>>>0).toString(16)});
}
function room(type,seed=741){
 let s=E.newGame(seed);s.floor=200;s.player.level=50;s.player.gold=100000;s.player.hp=E.stats(s).maxHp;s.fate=[3,4];s.phase='route';
 s.route=[type,'combat','forge','combat','gold','boss'].map((type,i)=>({id:`f200r${i}`,type,done:false,quality:0}));
 return E.transition(s,{type:'enter'});
}
const roundtrip=state=>{assert(S.validateSave(state),state.phase);assert.deepEqual(S.decodeSave(S.encodeSave(state)),state);return state;};
function activeLegacy(version=4){
 const old=JSON.parse(JSON.parse(golden.saves[0].raw).payload);
 if(version<4){
  old.version=version;old.player.hp=1;
  for(const item of old.player.items){delete item.level;delete item.levelXp;item.growth=0;}
 }
 const raw=envelope(old);assert(S.decodeSave(raw));return raw;
}
function corruptPrimaryWithMirror(raw){
 const invalid=JSON.parse(JSON.parse(raw).payload);invalid.nextId=3;
 const store=memory();store.setItem(S.SAVE_KEY,envelope(invalid));store.setItem(S.BACKUP_KEY,raw);return store;
}

test('a normal commit archives the readable V4 mirror instead of a checksummed but invalid primary',()=>{
 const original=activeLegacy(),store=corruptPrimaryWithMirror(original),loaded=S.loadSave(store);
 assert(loaded.recovered);const next=E.transition(loaded.state,{type:'lock',id:loaded.state.player.equipped.weapon});
 S.saveGame(next,loaded.state,store);
 assert.equal(store.getItem(S.V4_BACKUP_KEY),original,'the original archive must match the run actually recovered');
 assert.equal(S.readLegacyBackup(store),original);assert(S.decodeSave(S.readLegacyBackup(store)));
 assert.deepEqual(S.loadSave(store).state,next);assert.equal(store.getItem(S.SAVE_KEY),store.getItem(S.BACKUP_KEY));
});

test('recovery from V1–V3 mirrors preserves both immutable original archives across later saves',()=>{
 for(const version of [1,2,3]){
  const original=activeLegacy(version),store=corruptPrimaryWithMirror(original),loaded=S.loadSave(store);assert(loaded.recovered);
  const next=E.transition(loaded.state,{type:'lock',id:loaded.state.player.equipped.weapon});S.saveGame(next,loaded.state,store);
  assert.equal(store.getItem(S.V4_BACKUP_KEY),original,`V${version} pre-V5 archive`);
  assert.equal(store.getItem(S.LEGACY_BACKUP_KEY),original,`V${version} pre-levels archive`);
  const after=E.transition(next,{type:'lock',id:next.player.equipped.armor});S.saveGame(after,next,store);
  assert.equal(S.readLegacyBackup(store),original);assert.deepEqual(S.loadSave(store).state,after);
 }
});

test('archive-write failure after mirror recovery leaves both active disk copies intact',()=>{
 for(const failureKey of [S.LEGACY_BACKUP_KEY,S.V4_BACKUP_KEY]){
  const original=activeLegacy(2),store=corruptPrimaryWithMirror(original),loaded=S.loadSave(store),main=store.getItem(S.SAVE_KEY),mirror=store.getItem(S.BACKUP_KEY);
  const next=E.transition(loaded.state,{type:'lock',id:loaded.state.player.equipped.weapon}),write=store.setItem;
  store.setItem=(key,value)=>{if(key===failureKey)throw Error('synthetic archive quota');write(key,value);};
  assert.throws(()=>S.saveGame(next,loaded.state,store),/无法保留/);
  assert.equal(store.getItem(S.SAVE_KEY),main);assert.equal(store.getItem(S.BACKUP_KEY),mirror);
  if(failureKey===S.V4_BACKUP_KEY)assert.equal(store.getItem(S.LEGACY_BACKUP_KEY),original);
 }
});

function rejectedImportDoesNotWrite(bad){
 const original=activeLegacy(),store=memory();store.setItem(S.SAVE_KEY,original);store.setItem(S.BACKUP_KEY,original);
 const expected=S.loadSave(store).state,before=new Map(store.map);store.writes.length=0;
 assert.throws(()=>S.saveImportedGame(bad,envelope(bad),expected,store),/内容不完整|不兼容/,'reject before replacing a valid active run');
 assert.equal(S.validateSave(bad),false);assert.throws(()=>S.decodeSave(envelope(bad)),/内容不完整|不兼容/);
 assert.deepEqual(store.writes,[]);assert.deepEqual(store.map,before);
}

test('a pending auction without its committed reward is rejected before importing or claiming archive slots',()=>{
 const bad=roundtrip(room('abyssauction'));delete bad.event.reward;rejectedImportDoesNotWrite(bad);
});

test('event-triggered combat or death without an enemy cannot replace valid progress',()=>{
 const battle=roundtrip(E.transition(room('oathgate'),{type:'event-choice',id:'accept',confirmed:true}));
 for(const phase of ['combat','dead'])for(const missing of [null,undefined]){
  const bad=structuredClone(battle);bad.phase=phase;if(phase==='dead')bad.player.hp=0;
  if(missing===undefined)delete bad.enemy;else bad.enemy=missing;
  rejectedImportDoesNotWrite(bad);
 }
});

test('pending auction reward collisions with owned equipment are rejected before any import writes',()=>{
 for(const spare of [false,true]){
  const bad=roundtrip(room('abyssauction'));
  const owned=spare?E.makeItem(bad,'relic',1):bad.player.items[0];
  if(spare)bad.player.items.push(owned);
  bad.event.reward.item.id=owned.id;
  rejectedImportDoesNotWrite(bad);
 }
});

test('resolved auction history can retain its owned reward through a later import',()=>{
 const offered=roundtrip(room('abyssauction'));
 const bought=roundtrip(E.transition(offered,{type:'event-choice',id:'accept',confirmed:true}));
 const claimed=roundtrip(E.transition(bought,{type:'open'}));
 assert.equal(claimed.event.status,'resolved');
 assert.equal(claimed.player.items.filter(item=>item.id===claimed.event.reward.item.id).length,1);
 const active=E.newGame(76),store=memory();S.saveGame(active,null,store);
 const raw=S.encodeSave(claimed);S.saveImportedGame(claimed,raw,active,store);
 assert.deepEqual(S.loadSave(store).state,claimed);
 assert.equal(store.getItem(S.SAVE_KEY),raw);assert.equal(store.getItem(S.BACKUP_KEY),raw);
});

test('a valid auction remains deterministic through import, purchase, chest, loot and a rejected second claim',()=>{
 const offered=roundtrip(room('abyssauction')),raw=S.encodeSave(offered),store=memory(),active=E.newGame(75);S.saveGame(active,null,store);
 S.saveImportedGame(offered,raw,active,store);assert.deepEqual(S.loadSave(store).state,offered);assert.doesNotThrow(()=>V.center(offered,ui));
 const bought=roundtrip(E.transition(offered,{type:'event-choice',id:'accept',confirmed:true}));
 assert.equal(bought.phase,'chest');assert.equal(bought.enemy,null);assert.deepEqual(bought.chest,offered.event.reward);assert.equal(bought.rng,offered.rng);
 const opened=roundtrip(E.transition(bought,{type:'open'}));assert.equal(opened.phase,'loot');assert.equal(opened.rng,bought.rng);
 assert.equal(opened.player.items.filter(item=>item.id===offered.event.reward.item.id).length,1);
 assert.strictEqual(E.transition(opened,{type:'open'}),opened);assert.doesNotThrow(()=>V.center(opened,ui));
 roundtrip(E.transition(opened,{type:'next'}));
});

test('ordinary events and direct chests keep their legal null enemy; resolved history does not require an optional auction preview',()=>{
 for(const type of ['spring','prayer','chest','abyssauction']){
  const state=roundtrip(room(type));assert.equal(state.enemy,null);assert.doesNotThrow(()=>V.center(state,ui));
 }
 const departed=roundtrip(E.transition(room('abyssauction'),{type:'event-choice',id:'leave'}));
 delete departed.event.reward;roundtrip(departed);assert.doesNotThrow(()=>V.center(departed,ui));
});

test('event combat retains valid multi-wave, death and retry transitions without regenerating committed rewards on load',()=>{
 let battle=roundtrip(E.transition(room('oathgate'),{type:'event-choice',id:'accept',confirmed:true}));
 battle.enemy.hp=1;battle.enemy.shield=0;
 const killed=roundtrip(E.transition(battle,{type:'roll'}));assert.equal(killed.phase,'chest');assert.equal(killed.enemy.hp,0);
 const opened=roundtrip(E.transition(killed,{type:'open'})),second=roundtrip(E.transition(opened,{type:'next'}));
 assert.equal(second.phase,'combat');assert.equal(second.route[second.roomIndex].wave,2);assert(second.enemy.hp>0);
 const dead=structuredClone(second);dead.player.hp=0;dead.phase='dead';roundtrip(dead);assert.doesNotThrow(()=>V.center(dead,ui));
 const retried=roundtrip(E.transition(dead,{type:'retry'}));assert.equal(retried.phase,'combat');assert.equal(retried.player.hp,E.stats(retried).maxHp);assert(retried.enemy.hp>0);
});

test('10,000 generated items still round-trip and primary-write failure leaves the current transaction intact',()=>{
 const original=E.newGame(713);while(original.player.items.length<10000)original.player.items.push(E.makeItem(original,undefined,0));
 roundtrip(original);const store=memory();S.saveGame(original,null,store);const before=new Map(store.map);
 const next=E.transition(original,{type:'lock',id:original.player.equipped.weapon}),write=store.setItem;
 store.setItem=(key,value)=>{if(key===S.SAVE_KEY)throw Error('synthetic main quota');write(key,value);};
 assert.throws(()=>S.saveGame(next,original,store),/无法保存/);assert.deepEqual(store.map,before);assert.equal(original.player.items[0].locked,false);
 store.setItem=write;S.saveGame(next,original,store);assert.deepEqual(S.loadSave(store).state,next);assert.equal(store.getItem(S.SAVE_KEY),store.getItem(S.BACKUP_KEY));
});
