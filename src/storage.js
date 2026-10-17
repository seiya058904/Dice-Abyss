import {ABILITY_DEFS} from './deep-content.js';
import { ROOM_NAMES, TALENTS, EQUIP_SLOTS } from './content.js';
import { VERSION, stats } from './engine.js';
import {validEquipment,migrateEquipment,legacyItemValue,itemValue,itemStats,levelXpNeeded,MAX_ITEM_LEVEL,MAX_ITEM_XP} from './equipment.js';
import {ENCOUNTER_MECHANICS,EVENT_KEYS,COMBAT_ROOMS,EVENT_ROOMS} from './encounters.js';

export const SAVE_KEY = 'dice-abyss:save:v1';
export const BACKUP_KEY = 'dice-abyss:mirror:v1';
export const LEGACY_BACKUP_KEY = 'dice-abyss:pre-levels:v1';
export const V4_BACKUP_KEY = 'dice-abyss:pre-v5:v1';
export const SETTINGS_KEY = 'dice-abyss:settings:v1';
const phases = ['fate', 'route', 'combat', 'chest', 'loot', 'gold', 'merchant', 'forge', 'cleared', 'dead', 'complete','fusion','vault','blackmarket','altar','rest','event'];
const roomTypes = Object.keys(ROOM_NAMES);
const integer = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
const text = (s, max = 180) => typeof s === 'string' && s.length <= max;
const validItem=validEquipment;
const combatRooms=[...COMBAT_ROOMS];
const eventRooms=[...EVENT_ROOMS];
const statKeys=['attack','hp','defense','crit','follow','fourBonus','fiveBonus','sixBonus','pairBonus','sumBonus','bossBonus','firstBonus','critBonus','followBonus','healBonus','luck','echoChance','critDamage','pierce','reduction','dodge','regen','barrier','pairWard','criticalFollow','followDamage','goldBonus',...Object.keys(ABILITY_DEFS)];
const finite=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
const validStats=st=>st&&typeof st==='object'&&!Array.isArray(st)&&Object.entries(st).every(([key,n])=>statKeys.includes(key)&&finite(n,0,Number.MAX_SAFE_INTEGER));
const validProgress=p=>p&&integer(p.level,1,MAX_ITEM_LEVEL)&&integer(p.levelXp,0,p.level===MAX_ITEM_LEVEL?0:levelXpNeeded(p.level)-1)&&validStats(p.stats);
function validEvent(e){
 return e&&EVENT_KEYS.includes(e.key)&&eventRooms.includes(e.roomType)&&text(e.title,40)&&text(e.text)&&['pending','resolved'].includes(e.status)&&(e.choice===null||text(e.choice,32))&&text(e.outcome)&&integer(e.costGold,0,1e8)&&integer(e.costHp,0,1e15)&&[e.offerId,e.targetId].every(id=>id===null||/^i\d+$/.test(id))&&integer(e.rewardRarity,0,7)&&(e.roll===undefined||integer(e.roll,1,6))&&(e.rolls===undefined||(Array.isArray(e.rolls)&&e.rolls.length===2&&e.rolls.every(v=>integer(v,1,6))))&&(e.reward===undefined||validReward(e.reward));
}
function validReward(c) { return c && validItem(c.item) && integer(c.gold, 0, 1e8) && roomTypes.includes(c.type) && text(c.source); }
export function validateSave(s) {
  try {
    if (!s || s.version !== VERSION || !text(s.runId, 100) || !integer(s.revision, 0, 1e9) || !integer(s.rng, 1, 4294967295) || !integer(s.nextId, 4, 1e8) || !integer(s.floor, 1, Number.MAX_SAFE_INTEGER) || !phases.includes(s.phase)) return false;
    const p = s.player;
    if (!p || !integer(p.level, 1, 1e6) || !integer(p.xp, 0, 1e8) || !integer(p.gold, 0, 1e10) || !integer(p.hp, 0, 1e15) || !integer(p.talentPoints, 0, 2e6)) return false;
    if (!p.talents || !Object.keys(p.talents).every(k=>Object.hasOwn(TALENTS,k)) || !Object.entries(TALENTS).every(([k,t])=>integer(p.talents[k]??0,0,t.cap))) return false;
    if ((p.pactScars!==undefined&&!integer(p.pactScars,0,5))||(p.fateBlessings!==undefined&&!integer(p.fateBlessings,0,5)))return false;
    if (!Array.isArray(p.items) || p.items.length < 3 || p.items.length > 10000 || !p.items.every(validItem)) return false;
    if (new Set(p.items.map(i => i.id)).size !== p.items.length || p.items.some(i => Number(i.id.slice(1)) >= s.nextId)) return false;
    const inventoryIds=new Set(p.items.map(item=>item.id));
    const issuedId=id=>/^i\d+$/.test(id)&&integer(Number(id.slice(1)),0,s.nextId-1);
    if (!p.equipped || !['weapon', 'armor', 'relic'].every(slot => p.items.some(i => i.id === p.equipped[slot] && i.slot === slot))) return false;
    if(!Object.keys(p.equipped).every(key=>Object.hasOwn(EQUIP_SLOTS,key)))return false;
    if (new Set(Object.values(p.equipped).filter(Boolean)).size!==Object.values(p.equipped).filter(Boolean).length || !['relic2','relic3'].every(k=>p.equipped[k]==null||p.items.some(i=>i.id===p.equipped[k]&&i.slot==='relic'))) return false;
    if (s.blessing!==undefined&&!integer(s.blessing,0,100))return false;
    if (s.ward!==undefined&&!integer(s.ward,0,1e15))return false;
    if (s.roomUsed!==undefined&&typeof s.roomUsed!=='boolean')return false;
    if((s.eventLuck!==undefined&&!integer(s.eventLuck,0,20))||(s.eventPower!==undefined&&!integer(s.eventPower,0,30)))return false;
    if(p.deepOfferings!==undefined&&!integer(p.deepOfferings,0,20))return false;
    if(s.nextLuck!==undefined&&!integer(s.nextLuck,0,24))return false;
    if(s.v5Boons!==undefined&&(!s.v5Boons||!Object.keys(s.v5Boons).every(k=>['echo','ward'].includes(k))||!Object.values(s.v5Boons).every(v=>integer(v,0,1))))return false;
    if(s.routeMemory!==undefined){const m=s.routeMemory;if(!m||!Array.isArray(m.services)||m.services.length>4||new Set(m.services).size!==m.services.length||!m.services.every(k=>['merchant','forge','fusion','rest'].includes(k))||!m.last||typeof m.last!=='object'||Array.isArray(m.last)||!Object.entries(m.last).every(([key,floor])=>roomTypes.includes(key)&&integer(floor,1,s.floor))||!integer(m.hiddenFloor,0,s.floor))return false;}
    if(s.v5Migration!==undefined){const m=s.v5Migration;if(!m||!integer(m.fromVersion,1,4)||m.toVersion!==5||m.preservedRng!==true||!integer(m.inventory,3,10000))return false;}
    if(s.encounterHistory!==undefined&&(!Array.isArray(s.encounterHistory)||s.encounterHistory.length>8||!s.encounterHistory.every(type=>roomTypes.includes(type))))return false;
    if(s.event!==undefined&&s.event!==null&&!validEvent(s.event))return false;
    if(s.phase==='event'&&(!validEvent(s.event)||!eventRooms.includes(s.route[s.roomIndex]?.type)))return false;
    if (p.hp > stats(s).maxHp || (s.phase === 'dead' ? p.hp !== 0 : p.hp <= 0)) return false;
    if (!Array.isArray(s.route) || (s.phase === 'fate' ? s.route.length !== 0 : s.route.length !== 6)) return false;
    if (!integer(s.roomIndex, 0, Math.max(0, s.route.length - 1)) || !s.route.every((r, i) => r && r.id === `f${s.floor}r${i}` && roomTypes.includes(r.type) && typeof r.done === 'boolean' && integer(r.quality, 0, 1))) return false;
    if(s.route.some(r=>(r.waves!==undefined&&!integer(r.waves,1,3))||(r.wave!==undefined&&!integer(r.wave,1,r.waves??0))||(r.waveType!==undefined&&!combatRooms.includes(r.waveType))))return false;
    if (s.phase === 'fate' ? s.fate !== null : (!Array.isArray(s.fate) || s.fate.length !== 2 || !s.fate.every(n => integer(n, 1, 6)))) return false;
    if (s.route.some((r, i) => i < s.roomIndex && !r.done)) return false;
    if (['combat', 'dead'].includes(s.phase) && !combatRooms.includes(s.route[s.roomIndex]?.type)&&!eventRooms.includes(s.route[s.roomIndex]?.type)) return false;
    if (['combat', 'dead', 'chest'].includes(s.phase) && combatRooms.includes(s.route[s.roomIndex]?.type) && !s.enemy) return false;
    if (s.enemy) {
      const e = s.enemy;
      if (!text(e.name, 40) || !text(e.note) || !text(e.label) || !['steady', 'fierce', 'shield', 'stout', 'rage','pulse','drain','ramp','ward'].includes(e.trait) || !['combat', 'elite', 'boss','trial'].includes(e.type) || !integer(e.maxHp, 1, 1e15) || !integer(e.hp, 0, e.maxHp) || !integer(e.maxShield, 0, 1e15) || !integer(e.shield, 0, e.maxShield) || !integer(e.attack, 1, 1e15) || !integer(e.turns, 0, 1e8)) return false;
      if ((e.combatRules!==undefined&&![2,4].includes(e.combatRules))||(e.stage!==undefined&&!integer(e.stage,1,2))) return false;
      if((e.encounterKey!==undefined&&!roomTypes.includes(e.encounterKey))||(e.mechanic!==undefined&&!ENCOUNTER_MECHANICS.includes(e.mechanic))||(e.wave!==undefined&&!integer(e.wave,1,3)))return false;
      if((e.firstCritUsed!==undefined&&typeof e.firstCritUsed!=='boolean')||(e.openingEcho!==undefined&&![0,.25].includes(e.openingEcho)))return false;
      if(e.variant!==undefined&&!integer(e.variant,0,1))return false;
      if (s.phase === 'combat' && e.hp === 0) return false;
    }
    if (s.phase === 'chest' && (!validReward(s.chest) || p.items.some(i => i.id === s.chest.item.id))) return false;
    if (s.phase === 'loot' && (!validReward(s.loot) || !p.items.some(i => i.id === s.loot.item.id))) return false;
    // Rewards are allocated when the room/kill commits, before claiming them.
    // A future ID can decode successfully but can never pass the next save;
    // an owned unsold offer would duplicate the same item on purchase.
    for(const reward of [s.chest,s.loot,s.event?.reward])if(reward!=null&&(!validReward(reward)||!issuedId(reward.item.id)))return false;
    if (!Array.isArray(s.shop) || s.shop.length > 4 || !s.shop.every(o => o && text(o.id, 30) && integer(o.price, 1, 1e8) && typeof o.sold === 'boolean' && (o.id === 'heal' || validItem(o.item)))) return false;
    if(s.shop.some(offer=>offer.item&&(!issuedId(offer.item.id)||(!offer.sold&&inventoryIds.has(offer.item.id)))))return false;
    if (['merchant','blackmarket'].includes(s.phase) && (s.shop.length !== 4 || s.shop[3].id !== 'heal' || !s.shop.slice(0, 3).every(o => o.item && o.id === o.item.id) || new Set(s.shop.map(o => o.id)).size !== 4)) return false;
    if (!Array.isArray(s.log) || s.log.length > 6 || !s.log.every(l => l && text(l.text) && text(l.tone, 30))) return false;
    if (!s.counters || !['rolls', 'kills', 'chests', 'deaths', 'highestDamage', 'bosses'].every(k => integer(s.counters[k], 0, Number.MAX_SAFE_INTEGER))) return false;
    if (s.lastRoll && (!Array.isArray(s.lastRoll.values) || !integer(s.lastRoll.values.length, 1, 6) || !s.lastRoll.values.every(v => integer(v, 1, 6)) || !integer(s.lastRoll.total, 1, Number.MAX_SAFE_INTEGER) || !integer(s.lastRoll.best, 1, 6) || !['critical', 'follow', 'killed'].every(k => typeof s.lastRoll[k] === 'boolean') || !['main', 'extra', 'absorbed', 'hpDamage', 'retaliation'].every(k => integer(s.lastRoll[k], 0, Number.MAX_SAFE_INTEGER)))) return false;
    if(s.lastRoll?.echoDamage!==undefined&&!integer(s.lastRoll.echoDamage,0,Number.MAX_SAFE_INTEGER))return false;
    if (s.lastRoll && ((s.lastRoll.phaseChanged!==undefined&&typeof s.lastRoll.phaseChanged!=='boolean')||(s.lastRoll.guarded!==undefined&&!integer(s.lastRoll.guarded,0,Number.MAX_SAFE_INTEGER)))) return false;
    if(s.lastRoll){const r=s.lastRoll;if((r.luck!==undefined&&!finite(r.luck,0,1000))||(r.luckActive!==undefined&&typeof r.luckActive!=='boolean')||(r.echoes!==undefined&&!integer(r.echoes,0,6))||(r.highCount!==undefined&&!integer(r.highCount,0,6))||(r.wardGain!==undefined&&!integer(r.wardGain,0,1e15))||(r.dodged!==undefined&&typeof r.dodged!=='boolean')||(r.mechanics!==undefined&&(!Array.isArray(r.mechanics)||r.mechanics.length>24||!r.mechanics.every(x=>text(x,80)))))return false;}
    if (s.lastForge && (!text(s.lastForge.name, 64) || !integer(s.lastForge.gain, 1, MAX_ITEM_XP) || typeof s.lastForge.fusion !== 'boolean' || !integer(s.lastForge.value, 1, 6))) return false;
    if(s.lastForge){const f=s.lastForge;if(f.unit!==undefined&&!['xp','legacy'].includes(f.unit))return false;if(f.gains!==undefined&&(!Array.isArray(f.gains)||f.gains.length>3||!f.gains.every(g=>integer(g,1,MAX_ITEM_XP))))return false;if(f.levels!==undefined&&(!Array.isArray(f.levels)||f.levels.length>3||!f.levels.every(n=>integer(n,0,MAX_ITEM_LEVEL))))return false;if(f.upgrades!==undefined&&(!Array.isArray(f.upgrades)||f.upgrades.length>3||!f.upgrades.every(u=>u&&/^i\d+$/.test(u.id)&&integer(u.xp,1,MAX_ITEM_XP)&&validProgress(u.before)&&validProgress(u.after)&&u.after.level>=u.before.level&&integer(u.levels,0,MAX_ITEM_LEVEL))))return false;}
    if(s.lastForge){const f=s.lastForge;for(const [key,max]of [['targets',3],['consumed',10000]])if(f[key]!==undefined&&(!Array.isArray(f[key])||f[key].length<1||f[key].length>max||new Set(f[key]).size!==f[key].length||!f[key].every(id=>/^i\d+$/.test(id))))return false;if(f.unit==='xp'&&(!f.fusion||!Array.isArray(f.gains)||!Array.isArray(f.upgrades)||!Array.isArray(f.targets)||!Array.isArray(f.levels)||f.gains.length!==f.upgrades.length||f.targets.length!==f.upgrades.length||f.levels.length!==f.upgrades.length||f.gains.reduce((n,x)=>n+x,0)!==f.gain||!f.upgrades.every((u,i)=>u.id===f.targets[i]&&u.xp===f.gains[i]&&u.levels===f.levels[i]&&u.levels===u.after.level-u.before.level)))return false;}
    // XP-era consumption is authoritative. Pre-levels history is retained as
    // display-only legacy metadata; do not invalidate its original asset IDs.
    if(s.lastForge){const f=s.lastForge;if(f.targets?.some(id=>!issuedId(id))||f.consumed?.some(id=>!issuedId(id)||(f.unit==='xp'&&(inventoryIds.has(id)||f.targets?.includes(id)))))return false;}
    if(s.migration!==undefined){const m=s.migration;if(!m||!integer(m.fromVersion,1,3)||m.toVersion!==4||!integer(m.equipment,3,10010)||!integer(m.inventory,3,10000)||!integer(m.maxValueDelta,0,Number.MAX_SAFE_INTEGER)||!finite(m.maxRelativeDelta,0,1))return false;}
    if (typeof s.completed !== 'boolean') return false;
    return true;
  } catch { return false; }
}
function migratePreLevels(input) {
 const s=structuredClone(input);
 if(s.version===4)return s;
 if(![1,2,3].includes(s.version))throw Error('此存档版本无法迁移。');
 const fromVersion=s.version,values=[];
 const migrate=item=>{const before=item.level===undefined?legacyItemValue(item):itemValue(item),after=migrateEquipment(item);values.push({before,after:itemValue(after)});return after;};
 if(!s.player||!Array.isArray(s.player.items))throw Error('旧存档缺少装备清单，原始数据未改动。');
 s.player.items=s.player.items.map(migrate);
 for(const key of ['chest','loot'])if(s[key]?.item)s[key].item=migrate(s[key].item);
 if(Array.isArray(s.shop))for(const offer of s.shop)if(offer.item)offer.item=migrate(offer.item);
 // Rebuild the original aggregate before V4's runtime health clamp can hide a loss.
 let oldMaxHp=110+s.player.level*15;
 for(const id of new Set(Object.values(s.player.equipped||{}).filter(Boolean)))oldMaxHp+=itemStats(s.player.items.find(item=>item.id===id)).hp||0;
 oldMaxHp=Math.round(oldMaxHp*(1+(s.player.talents?.vitality||0)*.05));
 if(!Number.isSafeInteger(oldMaxHp)||oldMaxHp>1e15)throw Error('旧角色最大生命超出安全上限，无法无损迁移；原始存档未改动，请导出后人工转换。');
 s.version=4;
 for(const key of Object.keys(TALENTS)) if(s.player?.talents && s.player.talents[key]===undefined)s.player.talents[key]=0;
 if(s.player?.equipped){s.player.equipped.relic2??=null;s.player.equipped.relic3??=null;}
 if(s.lastForge?.fusion)s.lastForge.unit='legacy';
 s.migration={fromVersion,toVersion:4,equipment:values.length,inventory:s.player.items.length,maxValueDelta:Math.max(...values.map(v=>Math.abs(v.after-v.before))),maxRelativeDelta:Math.max(...values.map(v=>Math.abs(v.after-v.before)/Math.max(1,v.before)))};
 return s;
}
export function migrateSave(input){
 if(input?.version===VERSION)return structuredClone(input);
 if(![1,2,3,4].includes(input?.version))throw Error('此存档版本无法迁移。');
 const s=input.version===4?structuredClone(input):migratePreLevels(input);
 s.version=VERSION;
 for(const key of Object.keys(TALENTS))if(s.player?.talents&&s.player.talents[key]===undefined)s.player.talents[key]=0;
 s.v5Migration={fromVersion:input.version,toVersion:5,preservedRng:true,inventory:s.player.items.length};
 // Missing V5 metadata is lazy-initialized on the next NEW floor/encounter.
 // Do not draw RNG, regenerate a route/reward/shop, or rewrite any old item.
 return s;
}
function checksum(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}
export function encodeSave(state) {
  if (!validateSave(state)) throw new Error('存档状态不完整，操作未保存。');
  const payload = JSON.stringify(state);
  return JSON.stringify({ format: 'dice-abyss', version: VERSION, checksum: checksum(payload), payload });
}
export function decodeSave(raw) {
  if (typeof raw !== 'string' || raw.length > 5e6) throw new Error('这不是有效的骰狱存档。');
  const envelope = JSON.parse(raw);
  if (envelope.format !== 'dice-abyss' || ![1,2,3,4,5].includes(envelope.version) || typeof envelope.payload !== 'string' || checksum(envelope.payload) !== envelope.checksum) throw new Error('存档校验未通过，现有进度未改动。');
  const payload=JSON.parse(envelope.payload);if(payload.version!==envelope.version)throw Error('存档内外版本不一致。');
  const state = migrateSave(payload);
  if (!validateSave(state)) throw new Error('存档内容不完整或版本不兼容。');
  return state;
}
export function loadSave(storage = localStorage) {
  let existed = false,reason='';
  for (const key of [SAVE_KEY, BACKUP_KEY]) {
    try {
      const raw=storage.getItem(key);
      if(raw){
        existed=true;const state=decodeSave(raw),recovered=key===BACKUP_KEY;
        let warning='';
        if(recovered)warning='主存档无法读取，已从镜像恢复。若此前镜像保存失败，最后一次进度可能不在此备份中；请先导出核对。';
        else try{if(storage.getItem(BACKUP_KEY)!==raw)warning='主存档可用，但镜像尚未同步。请导出当前进度备份，后续成功保存会重建镜像。';}catch{warning='主存档可用，但无法检查镜像。请导出当前进度备份。';}
        return {state,recovered,warning};
      }
    } catch(error) { existed = true;if(/^(旧装备|装备等级|旧角色)/.test(error.message))reason=error.message; }
  }
  return { state: null, error: existed ? `无法读取存档。${reason}请保留原始备份；开始新游戏会覆盖现有记录。` : null };
}
const archivedLegacy=storage=>{try{return storage.getItem(LEGACY_BACKUP_KEY)||null;}catch{return null;}};
function validLegacyRaw(raw){
 try{if(typeof raw!=='string'||raw.length>5e6)return false;const e=JSON.parse(raw);return e.format==='dice-abyss'&&[1,2,3].includes(e.version)&&typeof e.payload==='string'&&checksum(e.payload)===e.checksum&&JSON.parse(e.payload).version===e.version;}catch{return false;}
}
function validPreV5Raw(raw){
 try{const e=JSON.parse(raw);return [1,2,3,4].includes(e.version)&&e.format==='dice-abyss'&&typeof e.payload==='string'&&raw.length<=5e6&&checksum(e.payload)===e.checksum&&JSON.parse(e.payload).version===e.version;}catch{return false;}
}
export function archiveImportedSave(raw,storage=localStorage){
 if(!validPreV5Raw(raw))return;
 const old=storage.getItem(V4_BACKUP_KEY),legacy=storage.getItem(LEGACY_BACKUP_KEY);
 if(old&&!validPreV5Raw(old))throw Error('V5升级前归档损坏，请先导出原始数据；主档未替换。');
 if(legacy&&!validLegacyRaw(legacy))throw Error('升级前归档校验未通过，主档未覆盖。');
 // The older archive is written first. A legacy-archive quota failure must not
 // leave a new V5 archive that shadows the still-active original on export.
 if(validLegacyRaw(raw)&&!legacy)try{storage.setItem(LEGACY_BACKUP_KEY,raw);}catch{throw Error('无法保留升级前原始存档，主档未覆盖。');}
 if(!old)try{storage.setItem(V4_BACKUP_KEY,raw);}catch{throw Error('无法保留V5升级前原始存档，主档未覆盖。');}
}
export function readLegacyBackup(storage=localStorage){
 try{const pre=storage.getItem(V4_BACKUP_KEY);if(validPreV5Raw(pre))return pre;}catch{}
 for(const key of [SAVE_KEY,BACKUP_KEY])try{const pre=storage.getItem(key);if(validPreV5Raw(pre))return pre;}catch{}
 const archived=archivedLegacy(storage);if(validLegacyRaw(archived))return archived;
 for(const key of [SAVE_KEY,BACKUP_KEY])try{const raw=storage.getItem(key);if(validLegacyRaw(raw))return raw;}catch{ /* Try the other original copy. */ }
 return null;
}
function assertSaveSnapshot(state,expected,storage) {
  if (expected === null) {
    // A tab which observed no run must not overwrite one created while it was
    // waiting for the write lock. Keep identical migration/rewrite calls valid.
    const current = loadSave(storage).state;
    if (current && JSON.stringify(current)!==JSON.stringify(state)) throw new Error('另一窗口已创建或更新进度。请重新读取后继续，避免覆盖存档。');
  } else if (expected) {
    const current = loadSave(storage).state;
    // Importing a branched export can preserve both run ID and revision while
    // changing the actual assets. Compare the snapshot before overwriting it.
    if (!current || current.runId !== expected.runId || current.revision !== expected.revision || JSON.stringify(current)!==JSON.stringify(expected)) throw new Error('另一窗口已更新进度。请刷新后继续，避免覆盖存档。');
  }
}
export function saveImportedGame(imported, importedRaw, expected = undefined, storage = localStorage) {
  // Check both the import and the disk snapshot before claiming the immutable
  // archive slots. A rejected import must not archive a file that never ran.
  if(!validateSave(imported))throw new Error('存档内容不完整或版本不兼容。');
  const decoded=decodeSave(importedRaw);
  if(JSON.stringify(decoded)!==JSON.stringify(imported))throw new Error('导入内容与已核对的原始存档不一致，当前进度未改动。');
  assertSaveSnapshot(imported,expected,storage);
  // Match loadSave's primary-then-mirror choice. An unreadable primary must not
  // shadow the valid active legacy mirror, nor a stale mirror a valid primary.
  for(const key of [SAVE_KEY,BACKUP_KEY]){
    let raw;try{raw=storage.getItem(key);if(!raw)continue;decodeSave(raw);}catch{continue;}
    if(validPreV5Raw(raw))archiveImportedSave(raw,storage);
    break;
  }
  archiveImportedSave(importedRaw,storage);
  return saveGame(imported,expected,storage);
}
export function saveGame(state, expected = undefined, storage = localStorage) {
  assertSaveSnapshot(state,expected,storage);
  const raw = encodeSave(state);
  for(const key of [SAVE_KEY,BACKUP_KEY]){let old;try{old=storage.getItem(key);}catch{continue;}if(validPreV5Raw(old)){archiveImportedSave(old,storage);break;}}
  // Keep the first original pre-levels payload for an honest rollback/export path.
  const archived=archivedLegacy(storage);if(archived&&!validLegacyRaw(archived))throw Error('升级前归档校验未通过，现有主档未覆盖。请先导出原始存档并检查归档。');
  if(!archivedLegacy(storage))for(const key of [SAVE_KEY,BACKUP_KEY]){
    let old;
    try{old=storage.getItem(key);if(!validLegacyRaw(old))continue;}catch{continue;}
    try{storage.setItem(LEGACY_BACKUP_KEY,old);}catch{throw Error('无法保留升级前原始存档，现有进度未覆盖。请先导出旧档并释放存储空间。');}
    break;
  }
  try { storage.setItem(SAVE_KEY, raw); } catch { throw new Error('浏览器无法保存进度，本次操作未生效。请导出备份并检查存储权限。'); }
  // localStorage commits each key separately. The primary is already durable;
  // a mirror failure must be visible rather than reported as a rolled-back turn.
  try { storage.setItem(BACKUP_KEY, raw); }
  catch { return {mirrored:false,warning:'进度已保存到主存档，但镜像更新失败。请立即导出当前备份并检查浏览器存储空间；旧镜像可能不含本次操作。'}; }
  return {mirrored:true,warning:''};
}
export function loadSettings(storage = localStorage) {
  try {
    const s = JSON.parse(storage.getItem(SETTINGS_KEY));
    return { sound: s?.sound === true, effects: ['full', 'low'].includes(s?.effects) ? s.effects : 'full', scale: [0.9, 1, 1.1].includes(s?.scale) ? s.scale : 1 };
  } catch { return { sound: false, effects: 'full', scale: 1 }; }
}
