import { newGame, transition, fusionPreview, salvagePreview, diceCount } from './engine.js';
import { loadSave, saveGame, encodeSave, decodeSave, loadSettings, readLegacyBackup, LEGACY_BACKUP_KEY, SAVE_KEY, BACKUP_KEY, SETTINGS_KEY } from './storage.js';
import { titleView, gameView, settingsView, itemEffects, itemSummary, itemProgress, migrationSummary, comparison, fusionOutcomeTable, num, esc, icon } from './views.js';
import { eventChoices } from './encounters.js';
import { mountEffects } from './effects.js';
import { THROW_DURATION } from './dice-motion.js';
import { levelXpNeeded } from './equipment.js';

const app = document.querySelector('#app');
const announcer = document.querySelector('#announcement');
const loaded = loadSave();
let state = loaded.state;
let settings = loadSettings();
const ui = { screen: 'title', view: 'game', busy: false, rolling: false, forgeSlot: 'weapon', inventorySlot: '', saveError: loaded.error || (loaded.recovered ? '已从镜像恢复进度，建议导出一份备份。' : '') };
let visualState = null;
let animationGeneration = 0;
let pending = null;
let audioContext;
let toastTimer;
const dialog = document.createElement('dialog');
dialog.className = 'game-dialog';
dialog.setAttribute('aria-labelledby', 'dialog-title');
document.body.append(dialog);
const toast = document.createElement('div');
toast.className = 'toast'; toast.setAttribute('role', 'status');
document.body.append(toast);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function notify(message) {
  toast.textContent = message; toast.classList.add('visible');
  if (dialog.open) {
    let notice = dialog.querySelector('.dialog-notice');
    if (!notice) { notice = document.createElement('p'); notice.className = 'dialog-notice'; notice.setAttribute('role', 'status'); dialog.append(notice); }
    notice.textContent = message;
  }
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 4200);
  announcer.textContent = message;
}
function render() {
  const focus = document.activeElement;
  const focusAction = app.contains(focus) ? focus?.dataset?.action : null;
  const focusId = focus?.dataset?.id;
  const scroll = document.querySelector('.inventory-list')?.scrollTop || 0;
  document.documentElement.style.setProperty('--user-scale', settings.scale);
  document.documentElement.dataset.effects = settings.effects;
  app.innerHTML = (ui.screen === 'title' ? titleView(state, ui.saveError) : gameView(visualState || state, ui)) + '<div class="small-window-note">为完整桌面体验，请使用横向窗口，并将宽度扩展至至少 1100 像素。</div>';
  if (focusAction && !dialog.open) {
    const match = [...app.querySelectorAll('[data-action]')].find(el => el.dataset.action === focusAction && (!focusId || el.dataset.id === focusId));
    if (match && !match.disabled) match.focus({ preventScroll: true });
  }
  const list = document.querySelector('.inventory-list');
  if (list) list.scrollTop = scroll;
  // Also clean up the previous scene and render the title's static dice surface.
  mountEffects(visualState || state, ui, settings, sound);
}
function sound(kind) {
  if (!settings.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    audioContext.resume();
    const tones = { legendary:[261.63,392,523.25,659.25,783.99,1046.5], reward:[392,523.25,659.25],
      roll:[180,125,95],bounce:[110],impact:[88,58],critical:[65,130,260],resonance:[220,330,440],
      follow:[620,930],finish:[65,130,196,392],chest:[130,196],forge:[196,392,588] };
    const frequencies = tones[kind] || tones.reward;
    frequencies.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
      const start = audioContext.currentTime + index * (kind==='legendary'?.09:.045);
      const percussive=['roll','bounce','impact','critical','chest'].includes(kind);
      const length=kind==='legendary'?.42:kind==='bounce'?.07:percussive?.15:.23;
      oscillator.type = percussive ? 'triangle' : 'sine'; oscillator.frequency.setValueAtTime(frequency, start);
      if(percussive)oscillator.frequency.exponentialRampToValueAtTime(frequency*.45,start+length);
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(kind==='bounce'?.025:.045, start + .004); gain.gain.exponentialRampToValueAtTime(.001, start+length);
      oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(start); oscillator.stop(start+length+.01);
    });
  } catch { /* Audio is optional; game state is independent. */ }
}
function openDialog(html) {
  dialog.innerHTML = html;
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('button:not([disabled]), select')?.focus();
}
function confirmDialog(title, body, label, callback) {
  pending = callback;
  openDialog(`<div class="dialog-heading"><h2 id="dialog-title">${title}</h2><button data-action="close-dialog" class="icon-button" aria-label="关闭">${icon('close')}</button></div><div class="confirmation-copy">${body}</div><div class="dialog-buttons"><button data-action="close-dialog">取消</button><button data-action="confirm" class="primary">${label}</button></div>`);
  dialog.querySelector('[data-action="close-dialog"]')?.focus();
}
function begin() {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] || 1;
  const next = newGame(seed);
  try { saveGame(next); state = next; visualState = null; animationGeneration++; ui.busy = false; ui.rolling = false; ui.forging = false; ui.screen = 'game'; ui.view = 'game'; ui.saveError = ''; dialog.close(); render(); }
  catch (error) { notify(error.message); }
}
async function act(action) {
  if (!state || ui.busy) return;
  const before = state;
  let after;
  try { after = transition(state, action); if (before === after) return; saveGame(after, before); }
  catch (error) { ui.saveError = error.message; notify(error.message); render(); return; }
  state = after; ui.saveError = '';
  const gambitRoll=action.type==='event-choice'&&action.id==='roll'&&after.event?.key==='gambit'&&Number.isInteger(after.event.roll);
  if(gambitRoll){
    // One committed event result drives the same visual dice as combat and forging.
    const generation=++animationGeneration,fast=settings.effects==='low'||reduced.matches;
    ui.busy=true;ui.rolling=true;ui.rollValues=[after.event.roll];ui.event='event-roll';
    visualState={...before,event:after.event,phase:'event'};render();sound('roll');
    await delay(fast?90:THROW_DURATION);
    if(generation!==animationGeneration)return;
    ui.rolling=false;visualState={...after,phase:'event'};render();sound('reward');announcer.textContent=after.event.outcome;
    await delay(fast?100:650);
    if(generation!==animationGeneration)return;
    visualState=null;ui.busy=false;render();notify(after.event.outcome);return;
  }
  const animated = ['roll', 'fate', 'open', 'forge', 'fuse', 'bless'].includes(action.type);
  if (!animated) {
    render();
    if (action.type === 'equip') notify('已装备，旧物品的 Lv. 与 +N 保留在背包。');
    if(action.type==='event-choice')notify(after.event?.outcome||'命运抉择已保存。');
    if (action.type === 'buy') notify(`交易完成 · 金币 ${before.player.gold} → ${after.player.gold}`);
    if (action.type === 'salvage') notify(`回收 ${before.player.items.length-after.player.items.length} 件旧装 · 金币 +${after.player.gold-before.player.gold}`);
    if (action.type === 'talent') { document.querySelector('#current-room')?.classList.add('talent-upgrade'); sound('reward'); notify(`天赋已升级 · 剩余 ${after.player.talentPoints} 点`); }
    return;
  }
  ui.rollValues=action.type==='roll'?after.lastRoll.values:action.type==='fate'?after.fate:[after.lastForge?.value||6];
  ui.event=action.type;
  ui.busy = true;
  const generation = ++animationGeneration;
  const fast = settings.effects === 'low' || reduced.matches;
  if (['roll', 'fate'].includes(action.type)) {
    visualState = before; ui.rolling = true; render(); sound('roll');
    await delay(fast ? 90 : THROW_DURATION);
    if (generation !== animationGeneration) return;
    ui.rolling = false;
    visualState = action.type === 'roll' ? { ...after, phase: 'combat' } : after;
    render();
    document.querySelector('#current-room')?.classList.add('impact-reveal');
    if(action.type==='roll') {
      const roll=after.lastRoll;
      const room=document.querySelector('#current-room');
      if(room)room.dataset.impact=roll.killed&&before.enemy.type==='boss'?'finish':roll.phaseChanged?'phase':roll.critical?'critical':roll.best>=3?'resonance':'normal';
      sound(roll.killed&&before.enemy.type==='boss'?'finish':roll.critical?'critical':roll.best>=2?'resonance':'impact');
      if(roll.phaseChanged)document.querySelector('#current-room')?.classList.add('phase-shift');
      if(roll.follow)delay(fast?35:450).then(()=>{if(generation===animationGeneration&&ui.busy)sound('follow');});
    } else sound('reward');
    announcer.textContent = action.type === 'roll' ? `掷出 ${after.lastRoll.values.join('、')}，主击 ${after.lastRoll.main}，追击 ${after.lastRoll.extra}，实际削减敌人生命 ${after.lastRoll.hpDamage}。${after.lastRoll.echoes?`同点引导 ${after.lastRoll.echoes} 颗。`:''}${after.lastRoll.mechanics?.join('；')||''}${after.lastRoll.killed ? '敌人已被击败，宝箱出现。' : ''}` : `命运骰 ${after.fate.join('、')}，本层路线已生成。`;
    await delay(fast ? 100 : after.phase === 'chest' || after.phase === 'dead' ? 1500 : 1150);
    if (generation !== animationGeneration) return;
  } else {
    // Results were saved above. Keep the previous visible state through anticipation.
    visualState = before;
    ui.forging = ['forge','fuse','bless'].includes(action.type);
    render();
    if (action.type === 'open') { document.querySelector('#current-room')?.classList.add('opening'); sound('chest'); }
    if (ui.forging) sound('roll');
    await delay(fast ? 70 : action.type === 'open' ? [620,720,850,1050][after.loot.item.rarity] : THROW_DURATION);
    if (generation !== animationGeneration) return;
    ui.forging = false;
    visualState = null; render();
    const cls = action.type === 'open' ? (after.loot.item.rarity === 3 ? 'legendary-reveal' : 'reward-reveal') : action.type === 'fuse' ? 'fusion-reveal' : 'forge-reveal';
    document.querySelector('#current-room')?.classList.add(cls);
    sound(action.type === 'open' ? after.loot.item.rarity === 3 ? 'legendary' : 'reward' : 'forge');
    announcer.textContent=action.type==='open'?`获得${itemSummary(after.loot.item)}及${num(after.loot.gold)}金币。`:action.type==='bless'?`祝福骰 ${after.lastForge.value} 点，本层祝福已保存。`:after.lastForge.fusion?after.lastForge.unit==='xp'?after.lastForge.upgrades.map(u=>`Lv.${u.before.level} → Lv.${u.after.level}，等级进度 ${u.after.levelXp}/${levelXpNeeded(u.after.level)}，强化不变。`).join('；'):'旧版融合记录已接续为装备等级。':`${after.lastForge.name}，强化增加 +${after.lastForge.gain}，Lv. 保持不变。`;
    await delay(fast ? 120 : action.type === 'open' ? [650,950,1400,1850][after.loot.item.rarity] : action.type === 'fuse' ? 1550 : 750);
    if (generation !== animationGeneration) return;
  }
  visualState = null; ui.busy = false; ui.rolling = false; ui.forging = false; render();
  if (diceCount(after) > diceCount(before)) notify(`第 ${diceCount(after)} 颗战斗骰已解锁！`);
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { notify('设置无法持久保存，本次会话内仍然生效。'); }
  render();
}
function rawSave() {
  for (const key of [SAVE_KEY, BACKUP_KEY]) {
    try { const raw = localStorage.getItem(key); if (raw) return raw; } catch { /* Export the other copy if accessible. */ }
  }
  return null;
}
function settingsDialog() {
  return settingsView(settings, !!state || !!rawSave(), !!readLegacyBackup(), !state && !!rawSave());
}
document.addEventListener('click', async event => {
  const control = event.target.closest('[data-action]');
  if (!control || control.disabled) return;
  event.preventDefault();
  const action = control.dataset.action;
  if (action === 'close-dialog') { pending = null; dialog.close(); return; }
  if (action === 'confirm') { const fn = pending; pending = null; dialog.close(); await fn?.(); return; }
  if (action === 'settings') { openDialog(settingsDialog()); return; }
  if (action === 'fullscreen') {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { notify('此浏览器窗口不支持全屏，请使用 F11。'); } return;
  }
  if (action === 'sound') { settings.sound = !settings.sound; saveSettings(); openDialog(settingsDialog()); sound('reward'); return; }
  if (action === 'export') {
    const raw = state ? encodeSave(state) : rawSave();
    if (!raw) { notify('未找到可导出的存档。'); return; }
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = state ? `Dice-Abyss-F${state.floor}-Lv${state.player.level}.json` : 'Dice-Abyss-unreadable-original.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify(state ? '存档备份已导出。' : '原始存档已原样导出，浏览器记录未改动。'); return;
  }
  if (action === 'export-legacy') {
    const raw=readLegacyBackup();if(!raw){notify('未找到可导出的升级前原始存档。');return;}
    const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='Dice-Abyss-before-levels-original.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('升级前原始存档已导出。');return;
  }
  if (action === 'import') { dialog.querySelector('#save-file').click(); return; }
  if(action==='skip'){const outcome=ui.event==='event-roll'?state.event?.outcome:null;animationGeneration++;visualState=null;ui.busy=false;ui.rolling=false;ui.forging=false;render();if(outcome)notify(outcome);return;}
  if (ui.busy) { notify('本次结果正在揭晓，请稍候。'); return; }
  if (action === 'new') { if (state || ui.saveError) confirmDialog('开始一段新的旅途？', '<p>当前进度将被替换。需要保留时，请先在设置中导出存档。</p>', '确认重新开始', begin); else begin(); return; }
  if (action === 'home') { dialog.close(); ui.screen = 'title'; render(); return; }
  if (action === 'continue') { ui.screen = 'game'; render(); return; }
  if (['game', 'inventory', 'talents'].includes(action)) { ui.view = action; ui.screen = 'game'; if (control.dataset.slot) ui.inventorySlot = control.dataset.slot; render(); return; }
  if (action === 'filter') { ui.inventorySlot = control.dataset.slot; render(); return; }
  if (action === 'inventory-page') { ui.inventoryPage = Number(control.dataset.page)||0; render(); return; }
  if(action==='salvage-item'){
    const id=control.dataset.id,preview=salvagePreview(state,[id],true);if(!preview)return;
    const item=preview.items[0];
    confirmDialog(item.rarity===3?'确认永久回收这件传说装备？':'回收这件装备？',`<p class="${item.rarity===3?'danger':''}">${esc(itemSummary(item))}</p><p>等级进度 ${itemProgress(item)} · 于第 ${num(item.depth)} 层获得</p><p>此物品将永久移除，换得 ${num(preview.gold)} 金币。Lv.、等级进度与 +N 均不会返还；如果要用作融合材料，请取消并保留。</p>`,'确认永久回收',()=>act({type:'salvage',ids:[id],allowProtected:item.rarity===3}));return;
  }
  if(action==='salvage-preview'){
    const preview=salvagePreview(state);if(!preview)return;
    const ids=preview.items.map(i=>i.id);
    confirmDialog('回收这些旧装备？',`<p>以下 ${num(ids.length)} 件普通 / 稀有旧装将永久移除，换得 ${num(preview.gold)} 金币。装备中、锁定、史诗、传说和本次战利品已排除。</p><ul class="salvage-list">${preview.items.map(i=>`<li>${esc(itemSummary(i))}</li>`).join('')}</ul><p>金币 ${num(state.player.gold)} → ${num(state.player.gold+preview.gold)}。若要用作融合材料，请取消并保留。</p>`,'确认回收',()=>act({type:'salvage',ids}));return;
  }
  if (action === 'forge-slot') { ui.forgeSlot = control.dataset.slot; render(); return; }
  if(action==='talent-group'){ui.talentGroup=control.dataset.id;render();return;}
  if(action==='fusion-slot'){ui.fusionSlot=control.dataset.slot;ui.fusionTargets=[];ui.fusionMaterials=[];render();return;}
  if(action==='fusion-target'){
    const id=control.dataset.id,ids=ui.fusionTargets||[];
    ui.fusionTargets=ids.includes(id)?ids.filter(x=>x!==id):(ui.fusionSlot==='relic'?[...ids.slice(-2),id]:[id]);
    ui.fusionMaterials=[];render();return;
  }
  if(action==='fusion-material'){const ids=ui.fusionMaterials||[],id=control.dataset.id;ui.fusionMaterials=ids.includes(id)?ids.filter(x=>x!==id):[...ids,id];render();return;}
  if(action==='fusion-all'){
    ui.fusionMaterials=state.player.items.filter(i=>fusionPreview(state,ui.fusionTargets||[],[i.id])).map(i=>i.id);render();return;
  }
  if(action==='fusion-preview'){
    const preview=fusionPreview(state,ui.fusionTargets||[],ui.fusionMaterials||[],true);if(!preview)return;
    const action={type:'fuse',targets:preview.targets.map(i=>i.id),materials:preview.materials.map(i=>i.id),allowProtected:preview.protectedItems.length>0};
    confirmDialog(preview.protectedItems.length?'确认消耗受保护的珍贵装备？':'确认融合材料',`<p>以下 ${num(preview.materials.length)} 件材料将永久消耗：</p><ul class="salvage-list">${preview.materials.map(i=>`<li class="${preview.protectedItems.some(p=>p.id===i.id)?'danger':''}">${esc(itemSummary(i))} · 来源第 ${num(i.depth)} 层${i.locked?' · 已锁定':''}${i.rarity===3?' · 传说装备':''}${i.rarity>Math.min(...preview.targets.map(t=>t.rarity))?' · 高于目标品质':''}</li>`).join('')}</ul>${fusionOutcomeTable(preview,true)}<p>花费 <strong>${num(preview.cost)} 金币</strong>，保留 ${preview.targets.length} 件目标。只增加装备 Lv. 与等级进度，目标原有 +N 不变；材料的 +N 仅折算少量经验，不会继承。</p>`,preview.protectedItems.length?'明确同意消耗珍贵材料并投骰':'确认材料并投骰',()=>act(action));return;
  }
  if(action==='event-choice'){
    const choice=eventChoices(state).find(o=>o.id===control.dataset.id);
    if(!choice||choice.disabled){if(choice?.reason)notify(choice.reason);return;}
    const offer=state.player.items.find(i=>i.id===state.event?.offerId),target=state.player.items.find(i=>i.id===state.event?.targetId);
    const itemCost=offer&&choice.cost===offer.name?`<p class="danger">永久消耗：${esc(itemSummary(offer))} · 等级进度 ${itemProgress(offer)}</p>`:'';
    const description=`<p>${esc(choice.detail)}</p><dl class="event-confirm-terms"><div><dt>代价</dt><dd>${esc(choice.cost)}</dd></div><div><dt>获得</dt><dd>${esc(choice.reward)}</dd></div></dl>${itemCost}${target&&choice.reward.includes(target.name)?`<p>目标保留：${esc(itemSummary(target))}</p>`:''}`;
    if(choice.confirm||choice.destructive)confirmDialog('确认这次命运抉择？',`${description}<p class="danger">${esc(choice.confirm||'这项选择提交后不可撤销。')}</p>`,'确认接受',()=>act({type:'event-choice',id:choice.id,confirmed:true}));
    else await act({type:'event-choice',id:choice.id});
    return;
  }
  if(action==='equip'){
    const item=state.player.items.find(i=>i.id===control.dataset.id);
    if(item?.slot==='relic'&&['relic','relic2','relic3'].every(k=>state.player.equipped[k])){
      openDialog(`<div class="dialog-heading"><h2 id="dialog-title">选择替换的遗物位</h2><button data-action="close-dialog">取消</button></div><p>新装备：${esc(itemSummary(item))}</p><p class="relic-new-effects">${esc(itemEffects(item))}</p><p>旧遗物会留在背包，Lv. 与 +N 都保留。</p>${['relic','relic2','relic3'].map((k,i)=>{const old=state.player.items.find(x=>x.id===state.player.equipped[k]);return `<button class="relic-replacement ${['common','rare','epic','legendary'][old.rarity]}" data-action="equip-relic" data-id="${item.id}" data-slot="${k}"><b>遗物 ${i+1} · ${esc(old.name)} · Lv.${num(old.level)} · +${old.enhance}</b><small>${esc(itemEffects(old))}</small>${comparison(state,item,k)}</button>`;}).join('')}`);return;
    }
  }
  if(action==='equip-relic'){dialog.close();await act({type:'equip',id:control.dataset.id,slot:control.dataset.slot});return;}
  await act({ type: action, id: control.dataset.id });
});
document.addEventListener('change', async event => {
  if (event.target.id === 'effects') { settings.effects = event.target.value; saveSettings(); }
  if (event.target.id === 'ui-scale') { settings.scale = Number(event.target.value); saveSettings(); }
  if (event.target.id === 'save-file') {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 5e6) throw new Error('存档文件过大，无法导入。');
      const importedRaw=await file.text();
      const imported = decodeSave(importedRaw);
      const importedLegacy=[1,2,3].includes(JSON.parse(importedRaw).version);
      confirmDialog('导入这段旅途？', `<p>第 ${imported.floor} 层 · Lv.${imported.player.level} · ${imported.player.items.length} 件装备</p>${imported.migration?`<p class="migration-notice">${esc(migrationSummary(imported))}</p>`:''}<p>确认后将替换当前浏览器中的进度。</p>`, '确认导入', () => {
        try { if(importedLegacy&&!readLegacyBackup()){try{localStorage.setItem(LEGACY_BACKUP_KEY,importedRaw);}catch{throw Error('无法保留导入前的原始旧档，当前进度未替换。请释放存储空间后重试。');}} saveGame(imported); state = imported; animationGeneration++; visualState = null; ui.busy = false; ui.rolling = false; ui.forging = false; ui.screen = 'game'; ui.view = 'game'; ui.saveError = ''; render(); notify(imported.migration?migrationSummary(imported):'存档已导入。'); } catch (error) { notify(error.message); }
      });
    } catch (error) { notify(error instanceof SyntaxError ? '存档不是有效的 JSON 文件，当前进度未改动。' : error.message || '无法读取存档文件。'); }
  }
});
document.addEventListener('keydown', event => {
  if (event.code !== 'Space' || event.repeat || dialog.open || ui.screen !== 'game' || ui.view !== 'game' || ui.busy || state?.phase !== 'combat') return;
  // Buttons keep their native Space behavior; form controls never trigger a combat roll.
  if (event.target.closest('button, a, input, select, textarea, [contenteditable]')) return;
  event.preventDefault(); act({ type: 'roll' });
});
dialog.addEventListener('cancel', () => { pending = null; });
window.addEventListener('storage', event => {
  if (event.key !== SAVE_KEY) return;
  const updated = loadSave();
  if (updated.state) { state = updated.state; animationGeneration++; visualState = null; ui.busy = false; ui.rolling = false; ui.forging = false; pending = null; dialog.close(); render(); notify('已同步另一窗口的最新进度。'); }
});
render();
