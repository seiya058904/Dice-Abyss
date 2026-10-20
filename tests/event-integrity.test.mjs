import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

// Reuse these behavioral assertions against the unmodified input. Failures
// there are the original import/payment gaps, not reconstructed old code.
const root=process.env.QA_EVENT_INTEGRITY_ROOT?pathToFileURL(process.env.QA_EVENT_INTEGRITY_ROOT.replace(/\/$/,'')+'/'):new URL('../',import.meta.url);
const E=await import(new URL('src/engine.js',root));
const S=await import(new URL('src/storage.js',root));
const C=await import(new URL('src/encounters.js',root));
const {eventFixture}=await import(new URL('scripts/audit-event-context.mjs',root));
const legacy=JSON.parse(readFileSync(new URL('tests/fixtures/v4-baseline.json',root),'utf8'));
const consumingChoices=[['exchange','salvage'],['exchange','relic'],['relic_exchange','accept'],['silent_anvil','accept'],['offering','accept'],['relicloom','accept']];
const targetEvents=['hollow_scale','silent_anvil'];
const fixtureCache=new Map();
function fixture(key){
 if(!fixtureCache.has(key)){
  const mystery=['hollow_scale','silent_anvil','relic_exchange'].includes(key);
  for(let seed=17017;seed<17317;seed++){
   const s=eventFixture({E,S},mystery?'mystery':key,{seed,floor:140,rich:true});
   if(mystery&&s.event.key!==key)continue;
   s.extraAudit={nested:[{text:'未知字段与原 ID 均保留 😀'}]};
   s.event.extraAudit={identity:[s.event.offerId,s.event.targetId]};
   for(const item of s.player.items)item.extraAudit={keep:[item.id,item.catalogId]};
   fixtureCache.set(key,s);break;
  }
  assert(fixtureCache.has(key),`real seeded entry must reach ${key}`);
 }
 return structuredClone(fixtureCache.get(key));
}
function envelope(s){
 const payload=JSON.stringify(s);let hash=2166136261;
 for(let i=0;i<payload.length;i++)hash=Math.imul(hash^payload.charCodeAt(i),16777619);
 return JSON.stringify({format:'dice-abyss',version:s.version,payload,checksum:(hash>>>0).toString(16)});
}
function memory(raw){
 const map=new Map(raw?[[S.SAVE_KEY,raw],[S.BACKUP_KEY,raw]]:[]),writes=[];
 return {map,writes,getItem:key=>map.get(key)??null,setItem:(key,value)=>{writes.push(key);map.set(key,value);}};
}
const option=(s,id)=>C.eventChoices(s).find(choice=>choice.id===id);
const act=(s,id,confirmed=true)=>E.transition(s,{type:'event-choice',id,confirmed});
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
function rejectsAction(s,id){
 const before=JSON.stringify(s);
 const displayed=option(s,id);
 assert(!displayed||displayed.disabled===true,'the choice must be absent or disabled for the rejected transaction');
 assert.strictEqual(act(s,id),s,'rejection must return the untouched input, including RNG and revision');
 const api=new Proxy({}, {get:()=>{throw Error('a rejected payment must not inspect or call the mutation API');}});
 assert.equal(C.applyEvent(s,{id,confirmed:true},api),false,'direct event settlement must also reject before doing work');
 assert.equal(JSON.stringify(s),before,'no assets, metadata, IDs, RNG, logs or revision may change');
}
function rejectsImport(s,pattern){
 const raw=envelope(s),before=JSON.stringify(s),store=memory(legacy.saves[0].raw);
 const expected=S.loadSave(store).state,records=new Map(store.map);
 assert.equal(S.validateSave(s),false);
 assert.throws(()=>S.decodeSave(raw),pattern);
 assert.throws(()=>S.saveImportedGame(s,raw,expected,store),pattern);
 assert.deepEqual(store.writes,[],'no archive, primary, mirror or unrelated storage write');
 assert.deepEqual(store.map,records,'all original browser strings remain exact');
 assert.equal(JSON.stringify(s),before,'the rejected imported graph is not repaired or trimmed');
 assert.equal(raw,envelope(s),'the caller still holds the original source string');
}
function readable(s){
 const raw=S.encodeSave(s);assert(S.validateSave(s));assert.deepEqual(S.decodeSave(raw),s);return raw;
}
function sameIdAnvil(){
 let s=fixture('silent_anvil');
 s.player.items.find(item=>item.id===s.event.targetId).enhance=5;
 const replacement=E.makeItem(s,'weapon',0);s.player.items.push(replacement);
 s=E.transition(s,{type:'equip',id:replacement.id});s.event.offerId=s.event.targetId;
 return s;
}

test('same-ID imported anvil references are rejected before any original save or archive is replaced',()=>{
 rejectsImport(sameIdAnvil(),/升级目标.*待消耗旧物.*同一件装备/);
});
test('same-ID anvil rejection retains the actual target, every asset, RNG and revision',()=>{
 const s=sameIdAnvil();rejectsAction(freeze(s),'accept');
 assert(s.player.items.some(item=>item.id===s.event.targetId));
});

for(const key of targetEvents)for(const slot of ['armor','relic'])test(`${key} rejects an imported ${slot} target instead of performing a weapon upgrade on it`,()=>{
 const s=fixture(key);s.event.targetId=s.player.equipped[slot];
 rejectsImport(s,/升级目标不是武器/);rejectsAction(s,'accept');
});

for(const [key,id]of consumingChoices)test(`${key}/${id} rejects unissued material IDs without guessing another safe item`,()=>{
 for(const value of [s=>`i${s.nextId}`,s=>`i${s.nextId+50}`,()=>'i999999999999999999999999']){
  const s=fixture(key);s.event.offerId=value(s);
  rejectsImport(s,/旧物 ID.*已分配/);rejectsAction(s,id);
 }
});
for(const key of targetEvents)test(`${key} rejects unissued target IDs without using the currently equipped weapon`,()=>{
 const s=fixture(key);s.event.targetId=`i${s.nextId}`;
 rejectsImport(s,/武器目标 ID.*已分配/);rejectsAction(s,'accept');
});

for(const [key,id]of consumingChoices)test(`${key}/${id} rejects duplicate material IDs at both import and direct payment boundaries`,()=>{
 const s=fixture(key),offered=s.player.items.find(item=>item.id===s.event.offerId);
 s.player.items.push({...structuredClone(offered),locked:true,name:'同 ID 的另一件物品'});
 rejectsAction(s,id);rejectsImport(s,/旧物 ID 对应多件/);
});
for(const key of targetEvents)test(`${key} rejects duplicate target IDs without selecting the first matching object`,()=>{
 const s=fixture(key),target=s.player.items.find(item=>item.id===s.event.targetId);
 s.player.items.push({...structuredClone(target),locked:true,name:'同 ID 的另一件目标'});
 rejectsAction(s,'accept');rejectsImport(s,/武器目标 ID 对应多件/);
});

for(const [key,id]of consumingChoices)test(`${key}/${id} keeps legally removed or unregistered materials readable but never replaces them`,()=>{
 const entered=fixture(key),removed=E.transition(entered,{type:'salvage',ids:[entered.event.offerId]});
 assert.notStrictEqual(removed,entered,'material disappearance must be a real permitted inventory action');
 const unregistered=fixture(key);unregistered.event.offerId=null;
 for(const s of [removed,unregistered]){
  const bytes=readable(s);rejectsAction(s,id);assert.equal(S.encodeSave(s),bytes);
  const left=act(s,'leave',false);assert.notStrictEqual(left,s);assert.deepEqual(left.player,s.player);assert.equal(left.rng,s.rng);readable(left);
 }
});
for(const key of targetEvents)test(`${key} keeps a legally salvaged or absent registered weapon readable and never chooses a replacement`,()=>{
 let s=fixture(key);const targetId=s.event.targetId,replacement=E.makeItem(s,'weapon',0);s.player.items.push(replacement);
 s=E.transition(s,{type:'equip',id:replacement.id});s=E.transition(s,{type:'salvage',ids:[targetId]});
 assert(!s.player.items.some(item=>item.id===targetId));
 const unregistered=fixture(key);unregistered.event.targetId=null;
 for(const state of [s,unregistered]){const bytes=readable(state);rejectsAction(state,'accept');assert.equal(S.encodeSave(state),bytes);}
});

for(const [key,id]of consumingChoices)test(`${key}/${id} rechecks material protection changes and can resume with the original unlocked object`,()=>{
 const entered=fixture(key),offerId=entered.event.offerId;
 const locked=E.transition(entered,{type:'lock',id:offerId}),equipped=E.transition(entered,{type:'equip',id:offerId});
 const lootProtected=fixture(key);lootProtected.loot={item:structuredClone(lootProtected.player.items.find(item=>item.id===offerId)),gold:0,type:'chest',source:'登记后受保护的既有战利品'};
 for(const s of [locked,equipped,lootProtected]){readable(s);rejectsAction(s,id);assert.equal(s.event.offerId,offerId);}
 const unlocked=E.transition(locked,{type:'lock',id:offerId});readable(unlocked);assert.equal(option(unlocked,id).disabled,false);
 assert.strictEqual(act(unlocked,id,false),unlocked,'restoring eligibility never waives explicit confirmation');
 const paid=act(unlocked,id);assert.notStrictEqual(paid,unlocked);assert.equal(paid.event.offerId,offerId);
 assert.deepEqual(paid.player.items,unlocked.player.items.filter(item=>item.id!==offerId).map(item=>key==='silent_anvil'&&item.id===unlocked.event.targetId?{...item,enhance:Math.min(20,item.enhance+2)}:item));
 assert.strictEqual(act(paid,id),paid);readable(paid);
});
for(const key of targetEvents)test(`${key} upgrades the original registered weapon after a real swap and lock without touching the replacement`,()=>{
 let s=fixture(key);const originalId=s.event.targetId,replacement=E.makeItem(s,'weapon',0);s.player.items.push(replacement);
 s=E.transition(s,{type:'equip',id:replacement.id});s=E.transition(s,{type:'lock',id:originalId});
 const original=structuredClone(s.player.items.find(item=>item.id===originalId)),replacementBefore=structuredClone(s.player.items.find(item=>item.id===replacement.id));
 const raw=readable(s),decoded=S.decodeSave(raw);assert.equal(option(decoded,'accept').disabled,false);
 const after=act(decoded,'accept'),target=after.player.items.find(item=>item.id===originalId);
 assert.equal(after.event.targetId,originalId);assert.equal(after.player.equipped.weapon,replacement.id);assert.equal(target.locked,true);
 assert.equal(target[key==='hollow_scale'?'level':'enhance'],original[key==='hollow_scale'?'level':'enhance']+(key==='hollow_scale'?3:2));
 assert.deepEqual(after.player.items.find(item=>item.id===replacement.id),replacementBefore);assert.deepEqual(target.extraAudit,original.extraAudit);
 assert.equal(after.rng,s.rng);assert.equal(after.revision,s.revision+1);assert.equal(S.encodeSave(s),raw);readable(after);
});

for(const [key,id]of consumingChoices)test(`${key}/${id} displays empty and whitespace names as the actual registered ID and still consumes only that object`,()=>{
 for(const name of ['', '   ', '\t\r\n']){
  const s=fixture(key),offered=s.player.items.find(item=>item.id===s.event.offerId);offered.name=name;
  const before=readable(s),choice=option(s,id);assert.equal(choice.disabled,false);
  assert(choice.cost.includes(offered.id));assert.match(choice.cost,/未命名/);assert(!choice.cost.includes('不存在'));
  assert.strictEqual(act(s,id,false),s);const paid=act(s,id);assert.notStrictEqual(paid,s);
  assert(!paid.player.items.some(item=>item.id===offered.id));assert.equal(S.encodeSave(s),before);assert.equal(offered.name,name);readable(paid);
 }
});

test('resolved historical anvil records remain readable without inventing an asset that an older version consumed',()=>{
 const s=sameIdAnvil();s.player.items=s.player.items.filter(item=>item.id!==s.event.offerId);
 s.event.status='resolved';s.event.choice='accept';s.event.outcome='旧版本已提交的原始结果';
 const raw=readable(s);assert.deepEqual(C.eventChoices(s),[]);assert.strictEqual(act(s,'accept'),s);
 assert.equal(S.encodeSave(S.decodeSave(raw)),raw);assert(!s.player.items.some(item=>item.id===s.event.targetId));
});
test('exact legacy item IDs, including leading zeroes, and unknown nested fields survive read-only reference checks',()=>{
 const s=fixture('silent_anvil'),target=s.player.items.find(item=>item.id===s.event.targetId),old=target.id;
 target.id=`i000${old.slice(1)}`;s.event.targetId=target.id;s.player.equipped.weapon=target.id;
 const raw=readable(s);freeze(s);
 for(let i=0;i<4;i++){C.eventChoices(s);assert(S.validateSave(s));assert.equal(S.encodeSave(s),raw);}
 const after=act(S.decodeSave(raw),'accept');assert.equal(after.event.targetId,target.id);assert(after.player.items.some(item=>item.id===target.id));
 assert.deepEqual(after.extraAudit,s.extraAudit);assert.deepEqual(after.event.extraAudit,s.event.extraAudit);readable(after);
});
test('normal V1–V4 migrations retain original strings, identities and unknown metadata through import',()=>{
 for(const version of [1,2,3,4]){
  const old=JSON.parse(JSON.parse(legacy.saves[0].raw).payload);old.version=version;old.extraAudit={unknown:['旧档原文',version]};
  if(version<4){old.player.hp=1;for(const item of old.player.items){delete item.level;delete item.levelXp;item.growth=0;}}
  const raw=envelope(old),imported=S.decodeSave(raw),before=E.newGame(9876),store=memory(S.encodeSave(before));
  S.saveImportedGame(imported,raw,before,store);assert.deepEqual(S.loadSave(store).state,imported);assert.equal(S.readLegacyBackup(store),raw);
  assert.equal(imported.rng,old.rng);assert.equal(imported.revision,old.revision);assert.equal(imported.nextId,old.nextId);assert.deepEqual(imported.extraAudit,old.extraAudit);
  assert.deepEqual(imported.player.items.map(item=>item.id),old.player.items.map(item=>item.id));
  assert.equal(envelope(old),raw,'migration never rewrites the source object or raw file');
 }
 for(const {raw}of legacy.saves){const decoded=S.decodeSave(raw);assert.deepEqual(S.decodeSave(S.encodeSave(decoded)),decoded);}
});
test('full expected snapshots still reject same-revision unknown-field conflicts before a valid event import writes anything',()=>{
 const expected=E.newGame(34567);expected.extraAudit={nested:{value:'期望'}};
 const actual=structuredClone(expected);actual.extraAudit.nested.value='另一个窗口';
 const store=memory(S.encodeSave(actual)),records=new Map(store.map),imported=fixture('silent_anvil'),raw=readable(imported);
 assert.throws(()=>S.saveImportedGame(imported,raw,expected,store),/另一窗口/);assert.deepEqual(store.writes,[]);assert.deepEqual(store.map,records);
});
