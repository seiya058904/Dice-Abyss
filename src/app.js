import {RARITIES,TALENTS} from './content.js';
import { newGame, transition, fusionPreview, salvagePreview, diceCount, talentPreview } from './engine.js';
import { saveImportedGame, loadSave, saveGame, encodeSave, decodeSave, measureSaveCapacity, inspectSaveRecovery, sameSaveRecords, restoreMissingSave, replaceUnreadableSave, loadSettings, readLegacyBackup, LEGACY_BACKUP_KEY, SAVE_KEY, BACKUP_KEY, SETTINGS_KEY } from './storage.js';
import { titleView, gameView, center, settingsView, itemEffects, itemSummary, itemProgress, migrationSummary, comparison, equipmentComparisonView, fusionView, fusionItemTooltip, talentInspectorView, talentInvestmentCount, memorywellPreviewView, experiencePreviewView, eventChoicePreviewView, eventRiskView, eventItemsView, eventChoiceCost, num, goldNum, esc, icon } from './views.js';
import { eventChoices } from './encounters.js';
import { mountEffects } from './effects.js';
import { THROW_DURATION } from './dice-motion.js';
import { paceSceneAnimations } from './visual-timeline.js';
import { levelXpNeeded } from './equipment.js';
import { createFusionController } from './fusion-controller.js';
import { captureWorkbenchPosition, restoreWorkbenchPosition, updateFusionDOM } from './fusion-dom.js';
import { captureInventoryPosition, restoreInventoryPosition } from './inventory-dom.js';
import { updateInventoryDOM } from './inventory-render.js';
import { createActionFocus } from './action-focus.js';
import { goldReceipt, goldSummary } from './gold.js';
import { createSettingsFocus } from './settings-focus.js';
import { saveCapacityView } from './save-capacity-view.js';
import { saveRecoveryView, recoveryMessage } from './save-recovery-view.js';
import { inventoryQuery, inventoryDefense } from './inventory-query.js';
import { createInventoryPageSelection } from './inventory-page.js';

const app = document.querySelector('#app');
const actionFocus = createActionFocus(app);
const announcer = document.querySelector('#announcement');
const loaded = loadSave();
let state = loaded.state;
let settings = loadSettings();
const ui = { screen: 'title', view: 'game', busy: false, rolling: false, forgeSlot: 'weapon', inventorySlot: '', talentCount: 1, saveError: loaded.error || loaded.warning || (loaded.recovered ? '已从镜像恢复进度，建议导出一份备份。' : '') };
let visualState = null;
let visualPresentation = null;
let animationGeneration = 0;
let presentationAnnouncement = null;
let pending = null;
let audioContext;
let toastTimer;
let committing = false;
let reviewList = null;
let inventoryRenderedRunId = null;
let inventoryRenderedState = null;
const inventoryPageSelection = createInventoryPageSelection();
let boonRenderedRunId = null;
let recoveryDialogAction = null;
let importReadGeneration = 0;
// Serialize the read/transition/write critical section across same-origin tabs.
// Older browsers still retain the exact-snapshot conflict check in saveGame.
const withSaveLock = task => navigator.locks?.request
  ? navigator.locks.request('dice-abyss:save-write', task)
  : Promise.resolve().then(task);
const dialog = document.createElement('dialog');
dialog.className = 'game-dialog';
dialog.setAttribute('aria-labelledby', 'dialog-title');
document.body.append(dialog);
const settingsFocus = createSettingsFocus(app, dialog);
const settingsContext = () => ({screen:ui.screen,view:ui.view,runId:state?.runId});
const toast = document.createElement('div');
toast.className = 'toast'; toast.setAttribute('role', 'status');
document.body.append(toast);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function preparePresentationAnnouncement(generation, message, showToast=false) {
  presentationAnnouncement={generation,runId:state.runId,message,showToast};
}
function publishPresentationAnnouncement(generation) {
  const result=presentationAnnouncement;
  if(!result||result.generation!==generation)return;
  presentationAnnouncement=null;
  if(result.runId!==state?.runId)return;
  // Reveal and early settlement consume the same committed result once. Keep
  // the current save warning first even when it arrived during anticipation.
  const message=ui.saveError?`${ui.saveError} ${result.message}`:result.message;
  if(result.showToast)notify(message);else announcer.textContent=message;
}
function settlePresentation() {
  if(!ui.busy)return;
  const generation=animationGeneration;
  document.querySelectorAll('.fusion-spark').forEach(node=>node.remove());
  animationGeneration++;visualState=null;ui.busy=false;ui.rolling=false;ui.forging=false;render();
  publishPresentationAnnouncement(generation);
  actionFocus.restore({runId:state?.runId,generation,dialogOpen:dialog.open});
}
// Read an optional animation promise once: a degraded implementation may return
// a fresh rejected promise per property access, which must not go unhandled.
function settleSceneAnimation(animation) {
  const finished=animation?.finished;
  return finished&&typeof finished.then==='function'?finished.then(()=>{},()=>{}):Promise.resolve();
}
async function waitAnimation(ms,fast) {
  if(document.visibilityState==='hidden'){settlePresentation();return;}
  const presentation=visualPresentation;
  const rate=settings.fastPace?2:1;
  if(fast||!presentation){await delay(ms/rate);return;}
  const animations=rate===2
    ? [document.querySelector('#current-room'),...document.querySelectorAll('.fusion-spark')].flatMap(root=>paceSceneAnimations(root,rate)) : [];
  const phase= presentation.wait(ms);
  // Keep the owner alive until finite CSS tails finish too. Its existing wall
  // deadline/hidden/skip cancellation still releases this wait if RAF stalls.
  const result=animations.length?await Promise.race([
    Promise.all([phase,...animations.map(settleSceneAnimation)]).then(([result])=>result),
    presentation.wait(Number.MAX_SAFE_INTEGER),
  ]):await phase;
  // A renderer deadline/background cancellation reveals the already committed
  // result. Never leave busy set while waiting for a RAF that cannot arrive.
  if(presentation===visualPresentation&&['deadline','hidden'].includes(result.reason))settlePresentation();
}
const fusion = createFusionController({
  app, ui, getState:() => state, isCommitting:() => committing, render, act, notify,
  confirmDialog, reviewItems, dialog, tooltipHTML:fusionItemTooltip, esc, num, icon, itemSummary,
});

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
function captureTalentPosition() {
  const scroll = app.querySelector('#talent-scroll');
  if (!scroll) return null;
  const focus = document.activeElement?.closest?.('[data-action]');
  return {
    top:scroll.scrollTop, left:scroll.scrollLeft, previewTop:app.querySelector('#talent-preview')?.scrollTop || 0,
    focus:focus && app.contains(focus) && ['talent','talent-count','talent-group'].includes(focus.dataset.action)
      ? { action:focus.dataset.action, id:focus.dataset.id, count:focus.dataset.count } : null,
  };
}
function restoreTalentPosition(before) {
  const scroll = app.querySelector('#talent-scroll');
  if (!before || !scroll) return;
  if (before.focus && !dialog.open) {
    const previous = before.focus;
    let focus = [...app.querySelectorAll('[data-action]')].find(node => node.dataset.action === previous.action
      && (previous.id === undefined || node.dataset.id === previous.id)
      && (previous.action !== 'talent-count' || node.dataset.count === previous.count)
      && node.getClientRects().length);
    // A node that just used the last point (or reached its cap) is disabled.
    // Keep keyboard users in the allocation controls, with their preset intact.
    if ((!focus || focus.disabled) && previous.action === 'talent') focus = app.querySelector('[data-action="talent-count"][aria-pressed="true"]');
    if (focus && !focus.disabled && document.activeElement !== focus) focus.focus({ preventScroll:true });
  }
  scroll.scrollTop = before.top; scroll.scrollLeft = before.left;
  const preview = app.querySelector('#talent-preview');
  if (preview) preview.scrollTop = before.previewTop;
}
function render(options = {}) {
  const position = captureWorkbenchPosition(app);
  const narrowNavigation = !!options.windowReset && matchMedia('(max-width:1099px)').matches && !dialog.open;
  if (narrowNavigation) {
    position.x=0; position.y=0;
    for (const item of position.scroll) if (item.id === 'current-room') { item.top=0; item.left=0; }
  }
  const inventoryPosition = captureInventoryPosition(app, inventoryRenderedRunId, {reset:!!options.inventoryReset});
  if (inventoryPosition) {
    position.scroll = position.scroll.filter(item => item.className !== 'inventory-list');
    // The inventory helper owns its controls, including disabled / removed
    // item fallbacks. Leave workbench, navigation and dialog focus unchanged.
    if (inventoryPosition.focus) { position.focus=null;position.focusId=null;position.focusData=null; }
  }
  const talentPosition = captureTalentPosition();
  const shown = visualState || state;
  const sameBoonRun=shown?.runId===boonRenderedRunId;
  const previousBoonPanel=app.querySelector('.route-panel');
  const oldBoonDetails=app.querySelector('[data-boon-details]');
  if(!sameBoonRun){ui.boonDetails=false;ui.boonScroll=0;}
  else{
    if(previousBoonPanel)ui.boonScroll=previousBoonPanel.scrollTop;
    if(oldBoonDetails)ui.boonDetails=oldBoonDetails.open;
  }
  fusion.closeTooltip();
  // Pure inventory choices can retain the surrounding page and equal cards.
  // Require the exact already-rendered state: saves, animations, new runs and
  // recovery views still rebuild from their complete current model below.
  if(options.inventoryOnly&&!options.windowReset&&!ui.saveRecovery&&!dialog.open&&!ui.busy&&!committing&&!visualState
      &&ui.screen==='game'&&ui.view==='inventory'&&shown&&inventoryRenderedState===shown&&inventoryRenderedRunId===shown.runId){
    const selected=inventoryPageSelection.read(shown,ui,{pageOnly:!!options.inventoryPageOnly});
    if(updateInventoryDOM(app,center(shown,ui,undefined,selected))){
      restoreWorkbenchPosition(app,position,dialog.open);
      restoreInventoryPosition(app,inventoryPosition,{reset:!!options.inventoryReset,dialogOpen:dialog.open,runId:shown.runId});
      return;
    }
  }
  inventoryPageSelection.clear();
  // Reconciliation and local markup share one synchronous current model. It
  // never survives this render or skips the independent transaction quote.
  const fusionModel = shown?.phase === 'fusion' ? fusion.reconcile(shown, !!options.fusionOnly) : undefined;
  if (!ui.saveRecovery && options.fusionOnly && ui.screen === 'game' && ui.view === 'game' && shown?.phase === 'fusion'
      && updateFusionDOM(app, fusionView(shown, ui, fusionModel))) {
    fusion.afterRender(); restoreWorkbenchPosition(app, position, dialog.open); return;
  }
  document.documentElement.style.setProperty('--user-scale', settings.scale);
  document.documentElement.dataset.effects = settings.effects;
  app.innerHTML = ui.saveRecovery ? saveRecoveryView(state,ui.saveRecovery,ui.saveError)
    : (ui.screen === 'title' ? titleView(state, ui.saveError) : gameView(shown, ui))
      + (ui.screen === 'game' && ui.view === 'game' && shown?.phase === 'fusion' ? '' : '<div class="small-window-note">为完整桌面体验，请使用横向窗口，并将宽度扩展至至少 1100 像素。</div>');
  visualPresentation=mountEffects(shown, ui, settings, sound);
  fusion.afterRender();
  restoreWorkbenchPosition(app, position, dialog.open);
  restoreTalentPosition(talentPosition);
  restoreInventoryPosition(app, inventoryPosition, {reset:!!options.inventoryReset,dialogOpen:dialog.open,runId:shown?.runId});
  inventoryRenderedRunId = shown?.runId;
  inventoryRenderedState = shown;
  const boonPanel=app.querySelector('.route-panel');
  if(boonPanel)boonPanel.scrollTop=ui.boonScroll||0;
  boonRenderedRunId=shown?.runId;
  if (narrowNavigation) {
    const active = document.activeElement;
    // A rail shortcut can be far below the newly selected view. Keep keyboard
    // navigation at its equivalent visible control in the compact action bar.
    if (active?.closest?.('.left-rail, .right-rail')) {
      const selector=ui.view==='game'?'.manual-control [data-action="game"]':`.main-nav [data-action="${ui.view}"]`;
      app.querySelector(selector)?.focus({preventScroll:true});
    }
    window.scrollTo({left:0,top:0,behavior:'instant'});
  }
}

function sound(kind) {
  if (!settings.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    audioContext.resume();
    const tones = {mythic:[196,293.66,392,587.33,784],ancient:[220,329.63,440,659.25,880],origin:[174.61,261.63,349.23,523.25,698.46],eternal:[261.63,392,523.25,783.99,1046.5,1567.98], legendary:[261.63,392,523.25,659.25,783.99,1046.5], reward:[392,523.25,659.25],
      roll:[180,125,95],bounce:[110],impact:[88,58],critical:[65,130,260],resonance:[220,330,440],
      follow:[620,930],finish:[65,130,196,392],chest:[130,196],forge:[196,392,588] };
    const frequencies = tones[kind] || tones.reward;
    frequencies.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
      const start = audioContext.currentTime + index * (['legendary','mythic','ancient','origin','eternal'].includes(kind)?.09:.045);
      const percussive=['roll','bounce','impact','critical','chest'].includes(kind);
      const length=['legendary','mythic','ancient','origin','eternal'].includes(kind)?.42:kind==='bounce'?.07:percussive?.15:.23;
      oscillator.type = percussive ? 'triangle' : 'sine'; oscillator.frequency.setValueAtTime(frequency, start);
      if(percussive)oscillator.frequency.exponentialRampToValueAtTime(frequency*.45,start+length);
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(kind==='bounce'?.025:.045, start + .004); gain.gain.exponentialRampToValueAtTime(.001, start+length);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(start); oscillator.stop(start+length+.01);
    });
  } catch { /* Audio is optional; game state is independent. */ }
}
function openDialog(html, {settingsPanel=false} = {}) {
  if (!settingsPanel) settingsFocus.cancel();
  actionFocus.cancel();
  fusion.closeTooltip(); fusion.closeMenu();
  dialog.innerHTML = html;
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('button:not([disabled]), select')?.focus();
}
function confirmDialog(title, body, label, callback) {
  settingsFocus.cancel();
  pending = callback;
  openDialog(`<div class="dialog-heading"><h2 id="dialog-title">${title}</h2><button data-action="close-dialog" class="icon-button" aria-label="关闭">${icon('close')}</button></div><div class="confirmation-copy">${body}</div><div class="dialog-buttons"><button data-action="close-dialog">取消</button><button data-action="confirm" class="primary">${label}</button></div>`);
  dialog.querySelector('[data-action="close-dialog"]')?.focus();
}
function clearRunSelections() {
  settingsFocus.cancel();
  actionFocus.cancel();
  fusion.reset();
  // Item IDs restart in a new run; a selection must never follow a reused ID.
  ui.fusionTargets=[];ui.fusionMaterials=[];ui.fusionTargetPage=0;ui.fusionMaterialPage=0;ui.inventoryPage=0;ui.rollValues=null;
  ui.inventorySlot='';ui.inventoryRarity='';ui.inventoryDefense='';
  ui.inventoryQuery='';ui.inventoryQueryDraft='';
  ui.talentCount=1;ui.talentInspect=null;
  pending=null;reviewList=null;presentationAnnouncement=null;
}
function cancelSaveInteractions() {
  settingsFocus.cancel();actionFocus.cancel();fusion.closeTooltip();fusion.closeMenu();
  animationGeneration++;visualState=null;ui.busy=false;ui.rolling=false;ui.forging=false;
  pending=null;reviewList=null;recoveryDialogAction=null;presentationAnnouncement=null;dialog.close();
  document.querySelectorAll('.fusion-spark').forEach(node=>node.remove());
}
function protectMemory(snapshot,message='') {
  const entering=!ui.saveRecovery;
  const priorFocus=document.activeElement;
  const ownedFocus=!priorFocus||priorFocus===document.body||priorFocus===document.documentElement||app.contains(priorFocus)||dialog.contains(priorFocus);
  cancelSaveInteractions();
  // Keep state itself: it is the complete last committed result, including a
  // result which was still being revealed when the storage event arrived.
  ui.saveRecovery=snapshot;ui.saveError=message||recoveryMessage(snapshot);
  render({windowReset:entering});
  const active=document.activeElement;
  if(entering||(ownedFocus&&(!active||active===document.body||active===document.documentElement||!active.isConnected)))app.querySelector('#save-recovery-title')?.focus({preventScroll:true});
  notify(ui.saveError);
}
function recoveryBlocked() {
  if(!ui.saveRecovery)return false;
  notify('当前进度正在保护中。请先导出备份，再恢复本页进度或读取浏览器中的进度。');
  return true;
}
function downloadText(raw,name) {
  const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function requestRecoveryRestore() {
  if(!ui.saveRecovery||committing)return;
  const checked=inspectSaveRecovery();
  if(checked.status!=='missing'){protectMemory(checked);return;}
  const expected=state,recovery=ui.saveRecovery;
  confirmDialog('恢复本页保留的旅途？',`<p>第 ${num(expected.floor)} 层 · Lv.${num(expected.player.level)} · ${num(expected.player.items.length)} 件装备。</p><p>本页完整进度将保存回浏览器。确认时会再次检查，两份存档仍然缺失才能恢复；已出现的其他进度或原始记录会保持不变。</p><p>需要额外备份时，可以先导出。</p><button data-action="export">导出本页完整备份</button>`,'确认恢复',async()=>{
    if(committing)return;
    committing=true;
    try {
      const result=await withSaveLock(()=>{
        if(state!==expected||ui.saveRecovery!==recovery)throw Error('进度已发生变化，请重新检查后再确认恢复。');
        return restoreMissingSave(expected,checked.raw);
      });
      ui.saveRecovery=null;ui.saveError=result.warning;ui.screen='game';clearRunSelections();render({windowReset:true});
      notify(result.warning||'本页完整进度已恢复到浏览器，可以继续旅途。');
    } catch(error) { protectMemory(inspectSaveRecovery(),error.message); }
    finally { committing=false; }
  });
  recoveryDialogAction='recovery-restore';
}
function requestRecoveryLoad() {
  if(!ui.saveRecovery||committing)return;
  const checked=inspectSaveRecovery();
  if(!checked.state){protectMemory(checked);return;}
  const expected=state,recovery=ui.saveRecovery;
  confirmDialog('读取浏览器中的进度？',`<p>将读取第 ${num(checked.state.floor)} 层 · Lv.${num(checked.state.player.level)} · ${num(checked.state.player.items.length)} 件装备的进度。</p><p>这会替换本页保留的副本。请先导出需要留下的本页进度；浏览器中的记录不会因读取而改写。</p><button data-action="export">导出本页完整备份</button>`,'确认读取',async()=>{
    if(committing)return;
    committing=true;
    try {
      const updated=await withSaveLock(()=>{
        if(state!==expected||ui.saveRecovery!==recovery)throw Error('进度已发生变化，请重新检查后再确认读取。');
        const latest=inspectSaveRecovery();
        if(!latest.state||!sameSaveRecords(latest.raw,checked.raw))throw Error('浏览器中的进度已再次变化，请重新检查并确认要读取的进度。');
        return latest;
      });
      state=updated.state;ui.saveRecovery=null;ui.saveError=updated.warning||'';ui.screen='game';ui.view='game';clearRunSelections();render({windowReset:true});
      notify(updated.warning||'已读取确认过的浏览器进度。');
    } catch(error) { protectMemory(inspectSaveRecovery(),error.message); }
    finally { committing=false; }
  });
  recoveryDialogAction='recovery-load';
}
function requestNewGame() {
  if (!state && !ui.saveError) { begin(); return; }
  // Review the exact originals once. begin() re-reads this snapshot under the
  // save lock, so a later valid save or changed bytes are never overwritten by
  // the reviewed discard.
  const reviewed = inspectSaveRecovery();
  const rawPresent = !!reviewed.raw && (reviewed.raw.primary !== null || reviewed.raw.mirror !== null);
  const note = reviewed.status === 'unreadable'
    ? (rawPresent
      ? '<p class="danger">浏览器中存在无法读取的原始记录。开始新旅途会替换它；请先导出原始记录，或明确确认舍弃。</p><button data-action="recovery-export-raw">导出浏览器原始记录</button>'
      : '<p class="danger">当前无法读取浏览器存储，也无法确认是否已有进度。存储权限恢复前，开始新旅途会被拒绝。</p>')
    : '';
  confirmDialog('开始一段新的旅途？', `<p>当前进度将被替换。需要保留时，请先在设置中导出存档。</p>${note}`, '确认重新开始', () => begin(reviewed));
}
async function begin(reviewed = null) {
  if(recoveryBlocked())return;
  if (committing || ui.busy) return;
  committing = true;
  const expected = state;
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] || 1;
  const next = newGame(seed);
  try {
    const result = await withSaveLock(() => {
      if (ui.saveRecovery || state !== expected) throw new Error('另一窗口已更新进度，请检查最新进度后重新开始。');
      if (!expected) {
        // A tab with no run in memory may only replace bytes it reviewed, and
        // only while those exact bytes are still present. Without Web Locks the
        // same snapshot check still runs immediately before the write.
        const current = inspectSaveRecovery();
        if (current.status === 'available') throw new Error('另一窗口已创建或更新进度。请按最新状态重新选择，避免覆盖存档。');
        if (current.status === 'unreadable' && !current.raw) throw new Error('无法读取浏览器中的存档，无法确认是否已有进度。请检查浏览器存储权限后重试，本次操作未保存。');
        if (reviewed && !sameSaveRecords(current.raw || { primary: null, mirror: null }, reviewed.raw || { primary: null, mirror: null })) throw new Error('浏览器中的存档已发生变化，本次操作未保存。请重新检查后再开始新旅途。');
        if (current.status === 'unreadable') {
          if (!reviewed) throw new Error('浏览器中存在无法读取的原始记录，开始新游戏前请先导出原始记录并明确确认舍弃。');
          return replaceUnreadableSave(next, current.raw);
        }
      }
      return saveGame(next, expected);
    });
    state = next; clearRunSelections(); visualState = null; animationGeneration++; ui.busy = false; ui.rolling = false; ui.forging = false; ui.screen = 'game'; ui.view = 'game'; ui.saveError = result.warning; dialog.close(); render({windowReset:true});
    if (result.warning) notify(result.warning);
  }
  catch (error) { if (!state) { ui.saveError = error.message; render(); } notify(error.message); }
  finally { committing = false; }
}
async function act(action) {
  if(recoveryBlocked())return;
  if (!state || ui.busy || committing) return;
  const before = state;
  let after, saved;
  committing = true;
  try {
    await withSaveLock(() => {
      if (ui.saveRecovery || state !== before) throw new Error('另一窗口已更新进度，本次操作未执行。请按最新状态重新选择。');
      after = transition(before, action);
      if (before !== after) saved = saveGame(after, before);
    });
    if (before === after) return;
  }
  catch (error) { ui.saveError = error.message; notify(error.message); render(); return; }
  finally { committing = false; }
  state = after; ui.saveError = saved.warning; fusion.committed(action);
  // In-room fusion transactions retain the workbench's selection and scroll.
  // Other compact room actions return their result to the visible main panel.
  if (ui.view==='game' && !(before.phase==='fusion' && after.phase==='fusion') && matchMedia('(max-width:1099px)').matches) window.scrollTo({left:0,top:0,behavior:'instant'});
  if (saved.warning) notify(saved.warning);
  const gambitRoll=action.type==='event-choice'&&action.id==='roll'&&['gambit','wishingvault'].includes(after.event?.key)&&(Number.isInteger(after.event.roll)||after.event.rolls?.length===2);
  if(gambitRoll){
    // One committed event result drives the same visual dice as combat and forging.
    const generation=++animationGeneration,fast=settings.effects==='low'||reduced.matches;
    preparePresentationAnnouncement(generation,after.event.outcome,true);
    actionFocus.capture({runId:after.runId,generation,dialogOpen:dialog.open});
    ui.busy=true;ui.rolling=true;ui.rollValues=after.event.rolls||[after.event.roll];ui.event='event-roll';
    visualState={...before,event:after.event,phase:'event'};render();sound('roll');
    await waitAnimation(fast?90:THROW_DURATION,fast);
    if(generation!==animationGeneration)return;
    ui.rolling=false;visualState={...after,phase:'event'};render();sound('reward');publishPresentationAnnouncement(generation);
    await waitAnimation(fast?100:650,fast);
    if(generation!==animationGeneration)return;
    visualState=null;ui.busy=false;render();actionFocus.restore({runId:state?.runId,generation,dialogOpen:dialog.open});return;
  }
  const animated = ['roll', 'fate', 'open', 'forge', 'fuse', 'bless'].includes(action.type);
  if (!animated) {
    render();
    if (action.type === 'equip') notify('已装备，旧物品的 Lv. 与 +N 保留在背包。');
    if(action.type==='event-choice')notify(after.event?.outcome||'命运抉择已保存。');
    if (action.type === 'buy') notify(`交易完成 · 金币 ${before.player.gold} → ${after.player.gold}`);
    if (action.type === 'salvage') notify(`回收 ${before.player.items.length-after.player.items.length} 件旧装 · 金币 +${after.player.gold-before.player.gold}`);
    if (action.type === 'gold') notify(`黄金房 · 金币实收 ${num(after.player.gold-before.player.gold)}${saved.warning?` · ${saved.warning}`:''}`);
    if (action.type === 'talent') {
      document.querySelector('#current-room')?.classList.add('talent-upgrade'); sound('reward');
      const invested=before.player.talentPoints-after.player.talentPoints,beforeRank=before.player.talents[action.id]||0,afterRank=after.player.talents[action.id]||0;
      notify(`${TALENTS[action.id].name} · 实际投入 +${num(invested)} 点 · 等级 ${num(beforeRank)} → ${num(afterRank)} · 剩余 ${num(after.player.talentPoints)} 点`);
    }
    return;
  }
  ui.rollValues=action.type==='roll'?after.lastRoll.values:action.type==='fate'?after.fate:[after.lastForge?.value||6];
  ui.event=action.type;
  ui.busy = true;
  const generation = ++animationGeneration;
  actionFocus.capture({runId:after.runId,generation,dialogOpen:dialog.open});
  const fast = settings.effects === 'low' || reduced.matches;
  if (['roll', 'fate'].includes(action.type)) {
    preparePresentationAnnouncement(generation,action.type === 'roll' ? `掷出 ${after.lastRoll.values.join('、')}，主击 ${after.lastRoll.main}，追击 ${after.lastRoll.extra}，实际削减敌人生命 ${after.lastRoll.hpDamage}。${after.lastRoll.echoes?`同点引导 ${after.lastRoll.echoes} 颗。`:''}${after.lastRoll.mechanics?.join('；')||''}${after.lastRoll.killed ? '敌人已被击败，宝箱出现。' : ''}` : `命运骰 ${after.fate.join('、')}，本层路线已生成。${after.fate[0]===after.fate[1]?`双同奖励，金币实收 ${goldNum(after.player.gold-before.player.gold)}。`:''}`);
    visualState = before; ui.rolling = true; render(); sound('roll');
    await waitAnimation(fast ? 90 : THROW_DURATION,fast);
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
      if(roll.follow)delay((fast?35:450)/(settings.fastPace?2:1)).then(()=>{if(generation===animationGeneration&&ui.busy)sound('follow');});
    } else sound('reward');
    publishPresentationAnnouncement(generation);
    await waitAnimation(fast ? 100 : after.phase === 'chest' || after.phase === 'dead' ? 1500 : 1150,fast);
    if (generation !== animationGeneration) return;
  } else {
    // Results were saved above. Keep the previous visible state through anticipation.
    preparePresentationAnnouncement(generation,action.type==='open'?`获得${itemSummary(after.loot.item)}，${goldSummary(goldReceipt(after.loot,after.lootCreditedGold),goldNum)}。`:action.type==='bless'?`祝福骰 ${after.lastForge.value} 点，本层祝福已保存。`:after.lastForge.fusion?after.lastForge.unit==='xp'?after.lastForge.upgrades.map(u=>`Lv.${u.before.level} → Lv.${u.after.level}，等级进度 ${u.after.levelXp}/${levelXpNeeded(u.after.level)}，强化不变。`).join('；'):'旧版融合记录已接续为装备等级。':`${after.lastForge.name}，强化增加 +${after.lastForge.gain}，Lv. 保持不变。`);
    visualState = before;
    ui.forging = ['forge','fuse','bless'].includes(action.type);
    render();
    if (action.type === 'open') { document.querySelector('#current-room')?.classList.add('opening'); sound('chest'); }
    if (ui.forging) sound('roll');
    if (action.type === 'fuse' && !fast) animateFusionMaterials();
    await waitAnimation(fast ? 70 : action.type === 'open' ? [620,720,850,1050,1120,1200,1280,1360][after.loot.item.rarity] : THROW_DURATION,fast);
    if (generation !== animationGeneration) return;
    ui.forging = false;
    visualState = null; render();
    const cls = action.type === 'open' ? (after.loot.item.rarity>=4?'deep-reveal':after.loot.item.rarity >= 3 ? 'legendary-reveal' : 'reward-reveal') : action.type === 'fuse' ? 'fusion-reveal' : 'forge-reveal';
    document.querySelector('#current-room')?.classList.add(cls);
    sound(action.type === 'open' ? after.loot.item.rarity>=4?RARITIES[after.loot.item.rarity].key:after.loot.item.rarity >= 3 ? 'legendary' : 'reward' : 'forge');
    publishPresentationAnnouncement(generation);
    await waitAnimation(fast ? 120 : action.type === 'open' ? [650,950,1400,1850,1950,2050,2150,2250][after.loot.item.rarity] : action.type === 'fuse' ? 1550 : 750,fast);
    if (generation !== animationGeneration) return;
  }
  visualState = null; ui.busy = false; ui.rolling = false; ui.forging = false; render();
  actionFocus.restore({runId:state?.runId,generation,dialogOpen:dialog.open});
  if (diceCount(after) > diceCount(before)) notify(`第 ${diceCount(after)} 颗战斗骰已解锁！`);
}
function animateFusionMaterials() {
  const kiln = app.querySelector('.fusion-kiln-dice')?.getBoundingClientRect();
  if (!kiln) return;
  const cards = [...app.querySelectorAll('.fusion-card.is-selected')].filter(card => {
    const box = card.getBoundingClientRect();
    return box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth;
  }).slice(0, 12);
  const start = cards.length ? cards : [...app.querySelectorAll('.fusion-selected-count')];
  start.forEach((card, index) => {
    const box = card.getBoundingClientRect(), spark = document.createElement('span');
    spark.className = 'fusion-spark'; spark.setAttribute('aria-hidden', 'true');
    spark.style.cssText = `--fx:${box.left + box.width / 2}px;--fy:${box.top + box.height / 2}px;--tx:${kiln.left + kiln.width / 2}px;--ty:${kiln.top + kiln.height / 2}px;animation-delay:${index * 35}ms`;
    document.body.append(spark); setTimeout(() => spark.remove(), 1450/(settings.fastPace?2:1));
  });
}

function saveSettings({redraw=true} = {}) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { notify('设置无法持久保存，本次会话内仍然生效。'); }
  if (redraw) render();
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
function comparisonItem(id) {
  return state?.player.items.find(item=>item.id===id)
    || state?.shop?.find(offer=>!offer.sold&&offer.item?.id===id)?.item;
}
function openComparison(id, slot) {
  const item=comparisonItem(id);
  if (item) openDialog(equipmentComparisonView(state,item,slot));
}
function reviewMarkup() {
  if (!reviewList) return '';
  const {items,renderRow,page} = reviewList, pages = Math.ceil(items.length / 50);
  return `<ul class="salvage-list">${items.slice(page*50,(page+1)*50).map(renderRow).join('')}</ul>${pages>1?`<div class="review-pagination"><button data-action="review-page" data-page="${page-1}" ${page===0?'disabled':''}>上一页</button><span>第 ${page+1} / ${pages} 页 · 共 ${num(items.length)} 件</span><button data-action="review-page" data-page="${page+1}" ${page===pages-1?'disabled':''}>下一页</button></div>`:''}`;
}
function reviewItems(items, renderRow) {
  reviewList = {items, renderRow, page:0};
  return `<div class="review-items">${reviewMarkup()}</div>`;
}
document.addEventListener('click', async event => {
  const control = event.target.closest('[data-action]');
  if (!control || control.disabled) return;
  event.preventDefault();
  const action = control.dataset.action;
  if(ui.saveRecovery&&!['close-dialog','confirm','export','recovery-check','recovery-restore','recovery-load','recovery-export-raw','fullscreen'].includes(action)){recoveryBlocked();return;}
  if(action==='recovery-check'){if(ui.saveRecovery&&!committing)protectMemory(inspectSaveRecovery());return;}
  if(action==='recovery-restore'){requestRecoveryRestore();return;}
  if(action==='recovery-load'){requestRecoveryLoad();return;}
  if(action==='recovery-export-raw'){
    // Also reachable from the new-run confirmation, where bytes which cannot be
    // decoded must stay exportable before any explicit discard.
    const snapshot=inspectSaveRecovery();
    if(!snapshot.raw||(snapshot.raw.primary===null&&snapshot.raw.mirror===null)){if(ui.saveRecovery)protectMemory(snapshot);else notify('浏览器中没有可导出的原始记录。');return;}
    downloadText(JSON.stringify({format:'dice-abyss-raw-records',records:{[SAVE_KEY]:snapshot.raw.primary,[BACKUP_KEY]:snapshot.raw.mirror}},null,2),'Dice-Abyss-browser-original-records.json');
    notify('两份浏览器存档的原始文本已导出。此文件供检查保留，不能直接作为游戏存档导入。');return;
  }
  if (action === 'review-page' && reviewList && dialog.open) {
    reviewList.page = Math.max(0,Math.min(Math.ceil(reviewList.items.length/50)-1,Number(control.dataset.page)||0));
    dialog.querySelector('.review-items').innerHTML = reviewMarkup();
    dialog.querySelector('.review-pagination button:not(:disabled)')?.focus();
    return;
  }
  if (action === 'close-dialog') { pending = null; dialog.close(); return; }
  if (action === 'confirm') { const fn = pending; pending = null; dialog.close(); await fn?.(); return; }
  if (action === 'settings') { settingsFocus.capture(control,settingsContext()); openDialog(settingsDialog(),{settingsPanel:true}); return; }
  if (action === 'save-capacity') {
    const result = dialog.querySelector('#save-capacity-result');
    if (!state || !dialog.open || !result) return;
    // Measure only this explicit request. Do not remount the scene, move focus,
    // save a new revision, or reuse this number after the dialog is rebuilt.
    try { result.innerHTML = saveCapacityView(measureSaveCapacity(state)); control.textContent = '重新检查'; }
    catch (error) { result.textContent = `无法检查存档容量：${error.message}`; }
    return;
  }
  if (action === 'fullscreen') {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { notify('此浏览器窗口不支持全屏，请使用 F11。'); } return;
  }
  if (action === 'fast-pace') {
    settings.fastPace = !settings.fastPace;
    // The next presentation reads the rate; do not cancel an active timeline.
    saveSettings({redraw:false});
    control.setAttribute('aria-checked', String(settings.fastPace));
    return;
  }
  if (action === 'sound') {
    settings.sound = !settings.sound;
    // Audio reads this preference directly. Preserve the focused native switch,
    // the dialog scroll position and the running scene instead of remounting.
    control.setAttribute('aria-checked', String(settings.sound));
    saveSettings({redraw:false}); sound('reward'); return;
  }
  if (action === 'export') {
    try {
      const raw = state ? encodeSave(state) : rawSave();
      if (!raw) { notify('未找到可导出的存档。'); return; }
      downloadText(raw,state?`Dice-Abyss-${ui.saveRecovery?'memory-':''}F${state.floor}-Lv${state.player.level}.json`:'Dice-Abyss-unreadable-original.json');
      notify(ui.saveRecovery?'本页保留的完整进度已导出。请确认下载完成，再恢复或读取其他进度。':state?'存档备份已导出。':'原始存档已原样导出，浏览器记录未改动。');
    } catch(error) { notify(error.message||'无法导出存档，请保留此页面。'); }
    return;
  }
  if (action === 'export-legacy') {
    const raw=readLegacyBackup();if(!raw){notify('未找到可导出的升级前原始存档。');return;}
    const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='Dice-Abyss-before-levels-original.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('升级前原始存档已导出。');return;
  }
  if (action === 'import') {
    const input=dialog.querySelector('#save-file');if(!input)return;
    // Opening another chooser supersedes the previous asynchronous read,
    // even if the player has not picked the replacement file yet.
    importReadGeneration++;
    const result=dialog.querySelector('#save-import-result');
    if(result?.dataset.state==='reading'){
      result.dataset.state='cancelled';result.textContent='已取消上次检查，请选择要导入的文件。';
    }
    input.value='';input.click();return;
  }
  if(action==='skip' && !committing){settlePresentation();return;}
  if (ui.busy || committing) { notify('本次结果正在揭晓，请稍候。'); return; }
  if (action === 'compare-details') { openComparison(control.dataset.id,control.dataset.slot);return; }
  if (action === 'new') { requestNewGame(); return; }
  if (action === 'home') { settingsFocus.cancel(); dialog.close(); ui.screen = 'title'; render({windowReset:true}); return; }
  if (action === 'continue') { ui.screen = 'game'; render({windowReset:true}); return; }
  if (['game', 'inventory', 'talents','codex'].includes(action)) {
    const fromDefeat = ui.view === 'game' && state?.phase === 'dead';
    const freshInventory = action === 'inventory' && control.dataset.resetRarity === 'true';
    ui.view = action; ui.screen = 'game';
    // A dedicated preparation entry must expose the equipment it promises even
    // after a previous visit selected an unrelated rarity or equipment slot.
    // Ordinary navigation keeps the player's existing filters as before.
    if (freshInventory) {
      ui.inventorySlot = ['weapon','armor','relic'].includes(control.dataset.slot) ? control.dataset.slot : '';
      ui.inventoryRarity = '';
      ui.inventoryDefense = '';
      ui.inventoryQuery='';ui.inventoryQueryDraft='';
    } else if (control.dataset.slot) ui.inventorySlot = control.dataset.slot;
    ui.inventoryPage = 0;
    render({inventoryReset:action==='inventory',windowReset:true});
    if (freshInventory) app.querySelector(`.slot-tabs [data-action="filter"][data-slot="${ui.inventorySlot}"]`)?.focus({preventScroll:true});
    else if (fromDefeat && action === 'talents') {
      // Compact branch tabs are hidden on desktop, where the same branch has
      // a title button on the map. Move to the visible version of that control.
      const branch = [...app.querySelectorAll('[data-action="talent-group"][aria-pressed="true"]')]
        .find(node => !node.disabled && node.getClientRects().length);
      branch?.focus({preventScroll:true});
    }
    return;
  }
  if (action === 'filter') { ui.inventorySlot = control.dataset.slot; ui.inventoryPage=0;render({inventoryReset:true,inventoryOnly:true});announceInventoryResults(); return; }
  if (action === 'inventory-reset') { ui.inventorySlot='';ui.inventoryRarity='';ui.inventoryDefense='';ui.inventoryQuery='';ui.inventoryQueryDraft='';ui.inventoryPage=0;render({inventoryReset:true,inventoryOnly:true});app.querySelector('[data-action="filter"][data-slot=""]')?.focus({preventScroll:true});announceInventoryResults();return; }
  if (action === 'inventory-query-clear') { ui.inventoryQuery='';ui.inventoryQueryDraft='';ui.inventoryPage=0;render({inventoryReset:true,inventoryOnly:true});app.querySelector('#inventory-query')?.focus({preventScroll:true});announceInventoryResults();return; }
  if (action === 'inventory-page') { ui.inventoryPage = Number(control.dataset.page)||0; render({inventoryReset:true,inventoryOnly:true,inventoryPageOnly:true}); return; }
  if(action==='salvage-item'){
    const id=control.dataset.id,preview=salvagePreview(state,[id],true,true);if(!preview)return;
    const item=preview.items[0];
    confirmDialog(item.rarity>=3?'确认永久回收这件珍贵装备？':'回收这件装备？',`<p class="${item.rarity>=3?'danger':''}">${esc(itemSummary(item))}</p><p>等级进度 ${itemProgress(item)} · 于第 ${num(item.depth)} 层获得</p><p>此物品将永久移除，预计实收 ${goldNum(preview.gold)} 金币。${preview.overflow?`<strong class="danger">受金币上限限制，${goldNum(preview.overflow)} 金币将被放弃。</strong>`:''}Lv.、等级进度与 +N 均不会返还；如果要用作融合材料，请取消并保留。</p>`,'确认永久回收',()=>act({type:'salvage',ids:[id],allowProtected:item.rarity>=3,allowOverflow:!!preview.overflow}));return;
  }
  if(action==='salvage-preview'){
    const preview=salvagePreview(state,undefined,false,true);
    if(!preview){notify('当前没有可提交的安全回收批次。可能没有符合条件的旧装，或批次总额超出安全范围。可尝试单件回收或融合。');return;}
    const ids=preview.items.map(i=>i.id);
    confirmDialog('回收这些旧装备？',`<p>以下 ${num(ids.length)} 件普通 / 稀有旧装将永久移除，预计实收 ${goldNum(preview.gold)} 金币。装备中、锁定、史诗、传说及以上和本次战利品已排除。</p>${reviewItems(preview.items,i=>`<li>${esc(itemSummary(i))}</li>`)}<p>金币 ${goldNum(state.player.gold)} → ${goldNum(state.player.gold+preview.gold)}。${preview.overflow?`<strong class="danger">明确确认后放弃 ${goldNum(preview.overflow)} 溢出金币。</strong>`:''}若要用作融合材料，请取消并保留。</p>`,'确认回收',()=>act({type:'salvage',ids,allowOverflow:!!preview.overflow}));return;
  }
  if (action === 'forge-slot') { ui.forgeSlot = control.dataset.slot; render(); return; }
  if(action==='talent-count'){ui.talentCount=talentInvestmentCount(control.dataset.count);render();return;}
  if(action==='talent-group'){ui.talentGroup=control.dataset.id;ui.talentInspect=null;render();return;}
  if(action==='talent'){
    const id=control.dataset.id,count=talentInvestmentCount(ui.talentCount);
    if(!talentPreview(state,id,count)){render();return;}
    ui.talentInspect=id;
    await act({type:'talent',id,count});return;
  }
  if (await fusion.handleClick(event, control)) return;
  if(action==='event-choice'){
    const choice=eventChoices(state).find(o=>o.id===control.dataset.id);
    if(!choice||choice.disabled){if(choice?.reason)notify(choice.reason);return;}
    const equipmentReview=eventItemsView(state,choice.id,{review:true}),riskReview=eventRiskView(state,choice.id,{review:true});
    const resetPreview=choice.id==='reset'?memorywellPreviewView(state):'',experiencePreview=experiencePreviewView(state,choice),paidStudy=!!experiencePreview&&['memory_archive','starlibrary'].includes(state.event?.key);
    const description=resetPreview?`<p>${esc(choice.detail)}</p>${resetPreview}`:`<p>${esc(choice.detail)}</p><dl class="event-confirm-terms"><div><dt>代价</dt><dd>${esc(eventChoiceCost(state,choice))}</dd></div>${paidStudy?'':`<div><dt>获得</dt><dd>${esc(choice.reward)}</dd></div>`}</dl>${experiencePreview}${eventChoicePreviewView(state,choice.id)}${riskReview}${equipmentReview}`;
    if(choice.confirm||choice.destructive)confirmDialog(paidStudy||riskReview?`确认${choice.label}？`:'确认这次命运抉择？',`${description}<p class="danger">${esc(choice.confirm||'这项选择提交后不可撤销。')}</p>`,paidStudy?(choice.experience.creditedXp?'支付并研读':'仍支付并研读'):riskReview?(choice.id==='safe'?'支付并选保底':'支付并投骰'):'确认接受',()=>act({type:'event-choice',id:choice.id,confirmed:true}));
    else await act({type:'event-choice',id:choice.id});
    return;
  }
  if(action==='equip'){
    const item=state.player.items.find(i=>i.id===control.dataset.id);
    if(item?.slot==='relic'&&['relic','relic2','relic3'].every(k=>state.player.equipped[k])){
      openDialog(`<div class="dialog-heading"><h2 id="dialog-title">选择替换的遗物位</h2><button data-action="close-dialog">取消</button></div><p>新装备：${esc(itemSummary(item))}</p><p class="relic-new-effects">${esc(itemEffects(item))}</p><p>旧遗物会留在背包，Lv. 与 +N 都保留。</p>${['relic','relic2','relic3'].map((k,i)=>{const old=state.player.items.find(x=>x.id===state.player.equipped[k]);return `<button class="relic-replacement ${RARITIES[old.rarity].key}" data-action="equip-relic" data-id="${item.id}" data-slot="${k}"><b>遗物 ${i+1} · ${esc(old.name)} · Lv.${num(old.level)} · +${old.enhance}</b><small>${esc(itemEffects(old))}</small>${comparison(state,item,k)}</button>`;}).join('')}`);return;
    }
  }
  if(action==='equip-relic'){dialog.close();await act({type:'equip',id:control.dataset.id,slot:control.dataset.slot});return;}
  await act({ type: action, id: control.dataset.id });
});
function inspectTalent(event) {
  if (ui.screen !== 'game' || ui.view !== 'talents' || ui.busy || committing) return;
  const control = event.target?.closest?.('[data-talent-preview]');
  if (!control || !app.contains(control) || !Object.hasOwn(TALENTS,control.dataset.talentPreview)) return;
  const id = control.dataset.talentPreview, preview = app.querySelector('#talent-preview');
  if (!preview || ui.talentInspect === id) return;
  ui.talentInspect = id;
  // Only this fixed-height detail region changes on hover/focus; targets and
  // the scroll container keep their identity and position until submission.
  preview.innerHTML = talentInspectorView(state,ui,id);
  preview.scrollTop = 0;
}
document.addEventListener('pointerover', inspectTalent);
document.addEventListener('focusin', inspectTalent);
document.addEventListener('focusin', event => actionFocus.observe(event.target));
document.addEventListener('input', event => {
  if (event.target.id === 'inventory-query') { ui.inventoryQueryDraft=event.target.value; return; }
  fusion.handleInput(event);
});
function announceInventoryResults() {
  // Announce the committed result once, after an explicit filter action. Draft
  // typing and unrelated renders must not repeat or replace other notices.
  announcer.textContent=app.querySelector('.inventory-search-result')?.textContent || '';
}
document.addEventListener('submit', event => {
  if (event.target.id !== 'inventory-search') return;
  event.preventDefault();
  if (ui.saveRecovery || dialog.open || ui.screen !== 'game' || ui.view !== 'inventory') return;
  // Submit once after typing (including IME composition), rather than replacing
  // the whole inventory DOM on each key. Search never commits a game action.
  ui.inventoryQuery=inventoryQuery(event.target.querySelector('#inventory-query')?.value);
  ui.inventoryQueryDraft=ui.inventoryQuery;ui.inventoryPage=0;
  render({inventoryReset:true,inventoryOnly:true});
  announceInventoryResults();
});
document.addEventListener('change', async event => {
  if (fusion.handleInput(event)) return;
  if (event.target.id === 'comparison-slot') {
    if (ui.busy || committing) return;
    openComparison(event.target.dataset.id,event.target.value);
    dialog.querySelector('#comparison-slot')?.focus({preventScroll:true});
    return;
  }
  const filters={'inventory-rarity':'inventoryRarity','inventory-sort':'inventorySort','inventory-defense':'inventoryDefense','codex-source':'codexSource','codex-category':'codexCategory'};
  if(filters[event.target.id]){
    const isInventory=event.target.id.startsWith('inventory-');
    ui[filters[event.target.id]]=event.target.id==='inventory-defense'?inventoryDefense(event.target.value):event.target.value;
    ui.inventoryPage=0;render({inventoryReset:isInventory,inventoryOnly:isInventory});
    if(isInventory)announceInventoryResults();
    return;
  }
  if (event.target.id === 'effects') { settings.effects = event.target.value; saveSettings(); }
  if (event.target.id === 'ui-scale') { settings.scale = Number(event.target.value); saveSettings(); }
  if (event.target.id === 'save-file') {
    if(recoveryBlocked())return;
    const input=event.target,file=input.files?.[0];if(!file)return;
    // Allow the same corrected file to be selected again. The File object is
    // retained locally; clearing this input never changes its bytes.
    input.value='';
    const readGeneration=++importReadGeneration;
    const activeRead=()=>readGeneration===importReadGeneration&&dialog.open&&dialog.contains(input);
    const importResult=dialog.querySelector('#save-import-result');
    if(importResult){importResult.hidden=false;importResult.dataset.state='reading';importResult.innerHTML=`<p>正在检查 <b>${esc(file.name)}</b>…</p>`;}
    try {
      if (file.size > 5e6) throw new Error('存档文件过大，无法导入。');
      const importedRaw=await file.text();
      if(!activeRead()||recoveryBlocked())return;
      const imported = decodeSave(importedRaw);
      const expected = state;
      confirmDialog('导入这段旅途？', `<p>第 ${imported.floor} 层 · Lv.${imported.player.level} · ${imported.player.items.length} 件装备</p>${imported.migration||imported.v5Migration?`<p class="migration-notice">${esc(migrationSummary(imported))}</p>`:''}<p>确认后将替换当前浏览器中的进度。</p>`, '确认导入', async () => {
        if (committing || recoveryBlocked()) return;
        committing = true;
        try {
          const result = await withSaveLock(() => {
            if (ui.saveRecovery || state !== expected) throw new Error('另一窗口已更新进度，请重新选择要导入的存档。');
            return saveImportedGame(imported, importedRaw, expected);
          });
          state = imported; clearRunSelections(); animationGeneration++; visualState = null; ui.busy = false; ui.rolling = false; ui.forging = false; ui.screen = 'game'; ui.view = 'game'; ui.saveError = result.warning; render({windowReset:true}); notify(result.warning || (imported.migration||imported.v5Migration?migrationSummary(imported):'存档已导入。'));
        } catch (error) { notify(error.message); }
        finally { committing = false; }
      });
    } catch (error) {
      if(!activeRead())return;
      const message=error instanceof SyntaxError?'存档不是有效的 JSON 文件。':error.message||'无法读取存档文件。';
      if(importResult){
        importResult.dataset.state='error';
        importResult.innerHTML=`<h4>未能导入这份存档</h4><p class="save-import-filename">${esc(file.name)}</p><p>${esc(message)}</p><p>原文件和当前进度均未改动。请保留原文件，重新选择一份完整备份。</p><button data-action="import">重新选择文件</button>`;
        importResult.focus();
      }
      notify(message);
    }
  }
});
document.addEventListener('keydown', event => {
  if(ui.saveRecovery)return;
  if (fusion.handleKeydown(event)) return;
  if (event.code !== 'Space' || event.repeat || dialog.open || ui.screen !== 'game' || ui.view !== 'game' || ui.busy || state?.phase !== 'combat') return;
  // Interactive controls keep native Space behavior, including rule disclosures.
  if (event.target.closest('button, a, input, select, textarea, summary, [contenteditable]')) return;
  event.preventDefault(); act({ type: 'roll' });
});
dialog.addEventListener('cancel', () => { pending = null; reviewList = null; });
dialog.addEventListener('close', () => { if (!dialog.open) {
  reviewList = null;settingsFocus.restore(settingsContext());
  const action=recoveryDialogAction;recoveryDialogAction=null;
  if(ui.saveRecovery&&action&&(!document.activeElement||document.activeElement===document.body||dialog.contains(document.activeElement)))app.querySelector(`[data-action="${action}"]`)?.focus({preventScroll:true});
} });
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&ui.busy&&!committing)settlePresentation();});
// FX geometry belongs to the layout at mount time. A window resize invalidates
// those coordinates; reveal the already committed result once, using the same
// cancellation/focus path as Skip, instead of replaying or stretching old FX.
window.addEventListener('resize',()=>{if(ui.busy&&!committing)settlePresentation();});
window.addEventListener('storage', event => {
  if (event.key !== null && event.key !== SAVE_KEY && event.key !== BACKUP_KEY) return;
  try { if (event.storageArea !== localStorage) return; }
  catch { /* Permission may have changed since this event was queued; inspect below. */ }
  // Read current records, not event.newValue: clear/remove notifications may
  // arrive after another tab has already created a newer complete save.
  const updated = inspectSaveRecovery();
  if(ui.saveRecovery){
    const previous=ui.saveRecovery;
    if(previous.status===updated.status&&previous.error===updated.error&&previous.warning===updated.warning&&sameSaveRecords(previous.raw,updated.raw))return;
    protectMemory(updated);return;
  }
  if(!updated.state&&state){protectMemory(updated);return;}
  const sameState=updated.state&&state&&JSON.stringify(updated.state)===JSON.stringify(state);
  // A donor can delete and recreate both keys in one task, before this tab
  // receives the deletion notification. The readable replacement is a
  // candidate, never permission to discard the surviving memory. Run/revision
  // alone cannot distinguish an imported branch with different unknown data.
  if(state&&updated.state&&(event.key===null||event.newValue===null)&&!sameState){protectMemory(updated);return;}
  // The later writes in an identical delete/recreate sequence must also keep
  // the active presentation and confirmation. Ordinary changed saves below
  // still synchronize automatically; this comparison only runs on events.
  if (sameState) {
    if (ui.saveError !== (updated.warning || '')) { ui.saveError=updated.warning || ''; if (!ui.busy) render(); }
    return;
  }
  if (updated.state) { settingsFocus.cancel(); actionFocus.cancel(); if (state?.runId !== updated.state.runId) clearRunSelections(); state = updated.state; fusion.committed(); animationGeneration++; visualState = null; ui.busy = false; ui.rolling = false; ui.forging = false; ui.saveError = updated.warning || ''; pending = null; presentationAnnouncement=null; dialog.close(); render(); notify(updated.warning || '已同步另一窗口的最新进度。'); }
  else if (updated.error) { ui.saveError = updated.error; notify(updated.error); render(); }
});
render();
