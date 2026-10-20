// Optional browser integration QA. Requires externally installed Playwright;
// it is never imported by the game or required to run the distributed ZIP.
// Every browser context below is isolated. Fixture saves and fault injection
// are synthetic test data, explicitly distinguished from the fresh-game flow.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const token = process.argv[i], split = token.indexOf('=');
  if (split >= 0) args[token.slice(0, split)] = token.slice(split + 1);
  else args[token] = !process.argv[i + 1] || process.argv[i + 1].startsWith('--') ? true : process.argv[++i];
}
const source = path.resolve(args['--source'] || '.'), baseURL = args['--url'] || 'http://127.0.0.1:4199';
const output = path.resolve(args['--output'] || 'docs/qa/evidence/browser');
const label = String(args['--label'] || 'after'), only = args['--cases']?.split(',');
const E = await import(pathToFileURL(path.join(source, 'src/engine.js')));
const S = await import(pathToFileURL(path.join(source, 'src/storage.js')));
const Q = await import(pathToFileURL(path.join(source, 'src/equipment.js')));
await fs.mkdir(output, { recursive: true });
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const keys = { main: S.SAVE_KEY, mirror: S.BACKUP_KEY, settings: S.SETTINGS_KEY, legacy: S.LEGACY_BACKUP_KEY, v4: S.V4_BACKUP_KEY };
const report = {
  label, source, baseURL, started: new Date().toISOString(), browser: '',
  method: 'Native Playwright mouse/keyboard/file-input interactions in fresh Chromium contexts; exact persisted states compared with deterministic engine transitions. No UI internals assigned.',
  limitations: ['Synthetic fixtures target otherwise lengthy or probabilistic branches; they are not claims of human natural play.', 'Storage quota and missed-storage-event cases intentionally inject browser faults.', 'This driver records correctness and screenshots, not frame-rate measurements.'],
  cases: [], errors: [], fixtures: [], screenshots: [],
};
const browser = await chromium.launch({
  executablePath: args['--browser'] || process.env.CHROMIUM_PATH || '/tmp/dice-abyss-playwright/chrome-headless-shell-linux64/chrome-headless-shell',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
report.browser = await browser.version();
let activeCase;
const contexts = new Set();
const actSelector = (type, id) => `[data-action="${type}"]${id ? `[data-id="${id}"]` : ''}`;
const note = (name, detail = {}) => activeCase.checks.push({ name, ...detail });
const recordFixture = (name, raw, provenance = 'Constructed current V5 engine fixture') => {
  report.fixtures.push({ name, provenance, raw, sha256: hash(raw) });
};
function wire(page, tag) {
  page.on('pageerror', error => report.errors.push({ case: activeCase?.name, page: tag, kind: 'pageerror', text: error.message }));
  page.on('console', message => { if (message.type() === 'error') report.errors.push({ case: activeCase?.name, page: tag, kind: 'console', text: message.text() }); });
  page.setDefaultTimeout(30000);
}
async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  const filename = `${label}-interaction-${name}.png`;
  await page.screenshot({ path: path.join(output, filename), animations: 'disabled' });
  report.screenshots.push(filename);
}
async function raw(page, key = S.SAVE_KEY) {
  return page.evaluate(key => localStorage.getItem(key), key);
}
async function saved(page) {
  const value = await raw(page);
  assert(value, 'A main save must exist');
  return S.decodeSave(value);
}
async function sameState(page, expected, name, { mirror = true } = {}) {
  const actual = await saved(page);
  assert.deepEqual(actual, expected, name);
  if (mirror) assert.equal(await raw(page, S.BACKUP_KEY), await raw(page), `${name}: synchronized mirror`);
  note(name, { revision: actual.revision, rng: actual.rng, phase: actual.phase, stateSha256: hash(actual) });
  return actual;
}
async function fresh(name, state = null, { effects = 'low', main, mirror, missedStorageEvents = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, acceptDownloads: true });
  contexts.add(context);
  const page = await context.newPage();
  wire(page, name);
  if (missedStorageEvents) await page.addInitScript(() => window.addEventListener('storage', event => event.stopImmediatePropagation()));
  await page.goto(baseURL);
  const encoded = state ? S.encodeSave(state) : null;
  if (state) assert(S.validateSave(state), `Valid fixture ${name}`);
  const mainRaw = main === undefined ? encoded : main, mirrorRaw = mirror === undefined ? mainRaw : mirror;
  if (encoded) recordFixture(name, encoded);
  else if (mainRaw) recordFixture(name, mainRaw, 'Explicit raw import/recovery fixture');
  await page.evaluate(({ keys, mainRaw, mirrorRaw, effects }) => {
    localStorage.clear();
    if (mainRaw !== null) localStorage.setItem(keys.main, mainRaw);
    if (mirrorRaw !== null) localStorage.setItem(keys.mirror, mirrorRaw);
    localStorage.setItem(keys.settings, JSON.stringify({ sound: false, effects, scale: 1 }));
  }, { keys, mainRaw, mirrorRaw, effects });
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  assert(await page.locator('#app').innerText(), 'Application is not blank');
  return { page, context };
}
async function continueGame(page) {
  await page.locator(actSelector('continue')).click();
  await page.waitForSelector('.game-shell');
}
async function idle(page, skip = false) {
  // Low-effects reveals last only 190ms; the skip button can disappear during
  // Playwright's stability wait. Let those finish normally. In the full-effects
  // correctness case use a trusted native click without waiting for animation
  // stability; if reveal has already finished, skipping is no longer needed.
  if (skip && await page.getAttribute('html', 'data-effects') !== 'low') {
    const button = page.locator(actSelector('skip'));
    if (await button.count()) {
      try { await button.click({ force: true, timeout: 1000 }); }
      catch (error) { if (await page.locator('#current-room.busy').count()) throw error; }
    }
  }
  await page.waitForFunction(() => !document.querySelector('#current-room')?.classList.contains('busy'));
}
async function waitRevision(page, revision) {
  await page.waitForFunction(({ key, revision }) => {
    try { return JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision === revision; } catch { return false; }
  }, { key: S.SAVE_KEY, revision });
}
async function waitMain(page, expected) {
  await page.waitForFunction(({ key, expected }) => localStorage.getItem(key) === expected, { key: S.SAVE_KEY, expected: S.encodeSave(expected) });
}
async function step(page, action, { selector, invoke, skip = true } = {}) {
  const before = await saved(page), expected = E.transition(before, action);
  assert.notStrictEqual(expected, before, `Engine accepts ${action.type}`);
  if (invoke) await invoke();
  else await page.locator(selector || actSelector(action.type, action.id)).first().click();
  await waitRevision(page, expected.revision);
  await sameState(page, expected, `UI ${action.type} persists one exact engine transition`);
  await idle(page, skip);
  return expected;
}
async function settings(page) {
  await page.locator(actSelector('settings')).click();
  await page.waitForSelector('dialog[open] #effects');
}
async function closeDialog(page) {
  await page.locator('dialog[open] [data-action="close-dialog"]').last().click();
  assert.equal(await page.locator('dialog[open]').count(), 0);
}
async function exportFile(page, action, name) {
  const downloading = page.waitForEvent('download');
  await page.locator(`dialog[open] ${actSelector(action)}`).click();
  const download = await downloading, filename = `${label}-interaction-${name}.json`;
  await download.saveAs(path.join(output, filename));
  return fs.readFile(path.join(output, filename), 'utf8');
}
async function importFile(page, value) {
  await page.locator('dialog[open] #save-file').setInputFiles({ name: 'qa-save.json', mimeType: 'application/json', buffer: Buffer.from(value) });
  await page.waitForSelector('dialog[open] [data-action="confirm"]');
}
async function addTab(context, name, { missedStorageEvents = false } = {}) {
  const page = await context.newPage();
  wire(page, name);
  if (missedStorageEvents) await page.addInitScript(() => window.addEventListener('storage', event => event.stopImmediatePropagation()));
  await page.goto(baseURL);
  return page;
}
function room(type, { level = 40, floor = 80, seed = 20261017 } = {}) {
  let s = E.newGame(seed);
  s.runId = `qa-interactions-${type}-${floor}-${seed}`;
  s.floor = floor; s.player.level = level; s.player.gold = 250000; s.player.talentPoints = 30;
  s.fate = [3, 4]; s.phase = 'route'; s.roomIndex = 0;
  s.route = Array.from({ length: 6 }, (_, i) => ({ id: `f${floor}r${i}`, type: i === 0 ? type : i === 5 ? 'boss' : 'combat', quality: 0, done: false }));
  s.player.hp = E.stats(s).maxHp;
  return E.transition(s, { type: 'enter' });
}
function fusionFixture() {
  const state = room('fusion'), targets = [], materials = [];
  for (let i = 0; i < 3; i++) {
    const item = Q.makeItem(state, 'relic', 2 + i % 2, state.floor);
    item.level = 32 + i * 3; item.levelXp = 40 + i * 11; item.enhance = [7, 4, 10][i];
    state.player.items.push(item); state.player.equipped[['relic', 'relic2', 'relic3'][i]] = item.id; targets.push(item.id);
  }
  for (let i = 0; i < 3; i++) {
    const item = Q.makeItem(state, 'relic', i === 0 ? 5 : 1, state.floor);
    item.level = 37 + i; item.enhance = i === 0 ? 6 : 0; item.locked = i === 0;
    state.player.items.push(item); materials.push(item.id);
  }
  state.player.hp = E.stats(state).maxHp;
  return { state, targets, materials };
}
async function selectFusion(page, fixture) {
  const { state, targets, materials } = fixture;
  await page.locator('[data-action="fusion-slot"][data-slot="relic"]').click();
  // The shipped workbench selects a destination slot, then an item card.
  // fusion-target exists only inside an explicitly opened context menu.
  for (const [index, id] of targets.entries()) {
    await page.locator(`[data-action="fusion-pick-target"][data-index="${index}"]`).click();
    await page.locator(actSelector('fusion-item', id)).click();
  }
  for (const id of materials) await page.locator(actSelector('fusion-item', id)).click();
  const preview = E.fusionPreview(state, targets, materials, true);
  assert(preview, 'The exact three-target fixture has a valid fusion preview');
  assert(preview.protectedItems.some(item => item.locked), 'The fixture exercises explicit selection of locked material');
  assert.deepEqual(await page.locator('.fusion-target-item').evaluateAll(nodes => nodes.map(node => node.dataset.fusionTooltip)), targets, 'All three targets occupy the intended slots in order');
  for (const [className, ids] of [['is-target', targets], ['is-selected', materials]]) {
    assert.deepEqual(await page.locator(`.fusion-card.${className}`).evaluateAll(nodes => nodes.map(node => ({ id: node.dataset.id, pressed: node.getAttribute('aria-pressed') })).sort((a, b) => a.id.localeCompare(b.id))),
      [...ids].sort().map(id => ({ id, pressed: 'true' })), `Only the exact ${className} cards are selected`);
  }
  assert.equal(await page.locator('.fusion-six-outcomes').getAttribute('data-target-count'), String(targets.length));
  const outcomes = await page.locator('.fusion-six-outcomes [data-fusion-face]').evaluateAll(nodes => nodes.map(node => ({
    face: Number(node.dataset.fusionFace), multiplier: node.querySelector('.fusion-face-heading span')?.textContent.trim(),
    levels: [...node.querySelectorAll('.fusion-face-level strong')].map(level => Number(level.textContent.replaceAll(',', ''))),
    experience: node.querySelector('.fusion-face-xp')?.textContent.trim(),
  })));
  assert.deepEqual(outcomes, preview.outcomes.map(outcome => ({
    face: outcome.value, multiplier: `×${outcome.boost}`, levels: outcome.upgrades.map(upgrade => upgrade.after.level),
    experience: `+${outcome.total.toLocaleString('en-US')} XP`,
  })), 'Every face displays the engine multiplier, total experience and all three target levels');
  assert.equal((await page.locator('.fusion-selection-summary strong').innerText()).replace(/\s+/g, ' ').trim(), `${materials.length} 件材料 → ${targets.length} 件目标`);
  assert.equal((await page.locator('.fusion-gold').innerText()).trim(), preview.cost.toLocaleString('en-US'));
  assert.equal((await page.locator('.fusion-protection-warning').innerText()).trim(), `含 ${preview.protectedItems.length} 件受保护材料，需确认`);
  note('Native slot/card selection displays exact targets, materials, six outcomes, cost and protection', { targets, materials, protected: preview.protectedItems.map(item => item.id), cost: preview.cost, outcomes });
  await sameState(page, state, 'Fusion selection and previews preserve the complete save, mirror and RNG');
  return preview;
}
async function checkFusionConfirmation(page, fixture, preview) {
  const dialog = page.locator('dialog[open]');
  assert.equal(await dialog.count(), 1, 'Protected materials require an open confirmation');
  assert.equal(await dialog.locator('#dialog-title').innerText(), '确认消耗受保护材料？');
  const rows = await dialog.locator('.salvage-list li').allTextContents();
  assert.equal(rows.length, preview.materials.length, 'Confirmation lists every selected material');
  for (const [index, item] of preview.materials.entries()) {
    assert(rows[index].includes(item.name), `Confirmation includes material ${item.id} in selection order`);
    assert.equal(rows[index].includes('已锁定'), !!item.locked, `Confirmation discloses the lock on ${item.id}`);
  }
  assert.equal(await dialog.locator('.salvage-list li.danger').count(), preview.protectedItems.length, 'Every protected material is marked');
  assert.equal((await dialog.locator('.confirmation-copy > p').last().innerText()).replace(/\s+/g, ' ').trim(),
    `花费 ${preview.cost.toLocaleString('en-US')} 金币 · 余额 ${(fixture.state.player.gold - preview.cost).toLocaleString('en-US')} 金币`);
  assert.equal(await dialog.locator('[data-action="confirm"]').innerText(), '确认消耗并投骰');
  await sameState(page, fixture.state, 'Opening protected fusion confirmation spends nothing and preserves the complete save');
}
async function storageFault(page, key) {
  await page.evaluate(key => {
    if (!window.__qaNativeSetItem) {
      window.__qaNativeSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (candidate, value) {
        if (candidate === window.__qaFaultKey) { window.__qaFaultCount++; throw new DOMException('Synthetic QA quota fault', 'QuotaExceededError'); }
        return window.__qaNativeSetItem.call(this, candidate, value);
      };
    }
    window.__qaFaultKey = key; window.__qaFaultCount = 0;
  }, key);
}
async function run(name, kind, callback) {
  if (only && !only.includes(name)) return;
  activeCase = { name, kind, started: new Date().toISOString(), checks: [], status: 'running' };
  report.cases.push(activeCase);
  const errorsBefore = report.errors.length;
  try {
    await callback();
    assert.equal(report.errors.length, errorsBefore, `No browser console/page errors in ${name}`);
    activeCase.status = 'passed';
    console.log(`PASS ${name}: ${activeCase.checks.length} persisted-state / DOM checks`);
  } catch (error) {
    activeCase.status = 'failed'; activeCase.error = error.stack || error.message;
    console.error(`FAIL ${name}: ${error.message}`);
    const pages = [...contexts].flatMap(context => context.pages()).filter(page => !page.isClosed());
    for (const [index, page] of pages.entries()) await shot(page, `${name}-failure${pages.length > 1 ? `-page-${index + 1}` : ''}`).catch(() => {});
  } finally {
    for (const context of contexts) await context.close();
    contexts.clear(); activeCase.finished = new Date().toISOString();
    await fs.writeFile(path.join(output, `${label}-interactions.json`), JSON.stringify(report, null, 2));
  }
}

try {
  await run('fresh-manual-play', 'Actual new-game UI through first reward, random seed from browser', async () => {
    const { page } = await fresh('fresh-manual-play');
    await shot(page, 'title');
    await page.locator(actSelector('new')).first().click();
    await page.waitForSelector('.game-shell[data-scene="fate"]');
    const initial = await saved(page); assert.equal(initial.phase, 'fate'); assert.equal(initial.revision, 0);
    recordFixture('actual-browser-created-new-game', S.encodeSave(initial), 'New game created by native UI; browser crypto seed retained for reproducibility');
    await page.waitForTimeout(300);
    await sameState(page, initial, 'Idle fate does not roll automatically');
    await step(page, { type: 'fate' });
    assert.equal((await saved(page)).route.length, 6);
    await shot(page, 'manual-route');
    await step(page, { type: 'enter' });
    for (let attempts = 0; (await saved(page)).phase !== 'chest'; attempts++) {
      assert(attempts < 40, 'Fresh first battle resolves in at most 40 actions');
      const s = await saved(page); await step(page, { type: s.phase === 'dead' ? 'retry' : 'roll' });
    }
    const chest = await saved(page); assert.equal(chest.counters.kills, 1); assert.equal(chest.counters.chests, 0);
    await shot(page, 'manual-chest');
    await page.reload(); await continueGame(page);
    await sameState(page, chest, 'Refresh keeps the exact pending chest and RNG');
    const loot = await step(page, { type: 'open' });
    assert.equal(loot.player.items.length, chest.player.items.length + 1);
    assert.equal(loot.counters.chests, 1);
    await shot(page, 'manual-loot');
    await page.reload(); await continueGame(page);
    await sameState(page, loot, 'Reload does not grant the chest a second time');
  });

  await run('rapid-click-space-refresh', 'Synthetic long-lived encounter, native rapid clicks and keyboard', async () => {
    const state = room('combat');
    state.enemy.hp = state.enemy.maxHp = 1e8; state.enemy.attack = 1; state.enemy.shield = 0; state.ward = 0;
    const { page } = await fresh('rapid-click-space-refresh', state, { effects: 'full' });
    await continueGame(page);
    await page.evaluate(() => {
      window.__qaNativeInputs = [];
      for (const type of ['pointerdown', 'click', 'keydown']) document.addEventListener(type, event => {
        if (!event.isTrusted) return;
        const control = event.target.closest('[data-action]');
        window.__qaNativeInputs.push({ type, time: performance.now(), busy: !!document.querySelector('#current-room.busy'), action: control?.dataset.action || null, disabled: !!control?.disabled, code: event.code || null, repeat: !!event.repeat, formControl: !!event.target.closest('button, a, input, select, textarea, [contenteditable]') });
      }, true);
    });
    const bounds = await page.locator('#primary-action').boundingBox();
    await page.locator('#primary-action').click();
    await page.waitForSelector('#current-room.busy');
    await page.keyboard.press('Space');
    for (let i = 0; i < 12 && await page.locator('#current-room.busy').count(); i++) await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    for (let i = 0; i < 8 && await page.locator('#current-room.busy').count(); i++) await page.keyboard.press('Space');
    // A slow browser can finish the reveal between an observation and input
    // dispatch. Record the actual trusted event's busy state and allow a real
    // subsequent manual action; only busy inputs must be ignored.
    await idle(page);
    const inputs = await page.evaluate(() => window.__qaNativeInputs), actual = await saved(page);
    const busyInputs = inputs.filter(event => event.busy && ['pointerdown', 'keydown'].includes(event.type));
    const eligibleInputs = inputs.filter(event => !event.busy && !event.disabled && ((event.type === 'click' && event.action === 'roll') || (event.type === 'keydown' && event.code === 'Space' && !event.repeat && !event.formControl)));
    const committed = actual.counters.rolls - state.counters.rolls;
    assert(busyInputs.length > 0, 'Trusted native input was observed during busy');
    assert(committed >= 1 && committed <= eligibleInputs.length, 'Busy inputs cannot create extra rolls beyond eligible manual inputs');
    let stressed = state;
    for (let i = 0; i < committed; i++) stressed = E.transition(stressed, { type: 'roll' });
    await sameState(page, stressed, 'Rapid native inputs preserve the exact number and order of legitimate engine transitions');
    note('Input dispatch is classified at the actual browser event, without treating an input after reveal as a duplicate', { busyInputs: busyInputs.length, eligibleInputs: eligibleInputs.length, committedRolls: committed, inputs });
    const expected = E.transition(stressed, { type: 'roll' });
    await page.locator('#primary-action').click(); await waitRevision(page, expected.revision);
    await page.reload(); await continueGame(page);
    await sameState(page, expected, 'Refresh during reveal preserves the already committed roll and RNG');
    await page.locator('.combat-stage .roll-caption').click();
    const next = await step(page, { type: 'roll' }, { invoke: () => page.keyboard.press('Space'), skip: false });
    await shot(page, 'combat-after-space');
    await sameState(page, next, 'Unfocused native Space performs exactly one roll');
    await step(page, { type: 'roll' }, { skip: true });
    note('Skip is a presentation action; state is unchanged after the exact roll comparison');
  });

  await run('forge-talents-inventory-settings', 'Synthetic service fixture; actual control clicks', async () => {
    const state = room('forge');
    const weapon = state.player.items.find(item => item.id === state.player.equipped.weapon);
    weapon.level = 35; weapon.levelXp = 80; weapon.enhance = 17;
    const { page } = await fresh('forge-talents-inventory-settings', state);
    await continueGame(page); await shot(page, 'forge-ready');
    assert.equal(await page.locator('.forge-six-outcomes > span').count(), 6);
    const after = await step(page, { type: 'forge', id: weapon.id });
    const upgraded = after.player.items.find(item => item.id === weapon.id);
    assert.equal(upgraded.level, weapon.level); assert.equal(upgraded.levelXp, weapon.levelXp); assert(upgraded.enhance > weapon.enhance);
    await shot(page, 'forge-result');
    await page.locator('.main-nav [data-action="talents"]').click();
    const beforeTalent = await saved(page);
    await step(page, { type: 'talent', id: 'power' });
    assert.equal((await saved(page)).player.talentPoints, beforeTalent.player.talentPoints - 1);
    // Desktop map and narrow-screen navigation intentionally expose the same
    // action. Exercise the currently visible native control.
    await page.locator('[data-action="talent-group"][data-id="critical"]:visible').click();
    await shot(page, 'talents');
    await page.locator('.main-nav [data-action="inventory"]').click();
    await shot(page, 'inventory');
    const unchanged = await saved(page);
    await settings(page); await page.locator('#effects').selectOption('low');
    await page.locator('#ui-scale').selectOption('1.1');
    assert.equal(await page.getAttribute('html', 'data-effects'), 'low');
    const preferences = JSON.parse(await raw(page, S.SETTINGS_KEY)); assert.equal(preferences.effects, 'low'); assert.equal(preferences.scale, 1.1);
    await sameState(page, unchanged, 'Presentation settings do not consume game RNG or revision');
    await shot(page, 'settings');
    await page.reload(); await settings(page);
    assert.equal(await page.locator('#effects').inputValue(), 'low'); assert.equal(await page.locator('#ui-scale').inputValue(), '1.1');
    note('Low effects and UI scale survive reload');
  });

  await run('fusion-protected-three-relics', 'Synthetic equipped targets and protected material; real confirmation', async () => {
    const fixture = fusionFixture(), { state, targets, materials } = fixture;
    const { page } = await fresh('fusion-protected-three-relics', state);
    await continueGame(page); await shot(page, 'fusion-ready');
    const preview = await selectFusion(page, fixture); await shot(page, 'fusion-three-relic-preview');
    await page.locator(actSelector('fusion-preview')).click();
    await checkFusionConfirmation(page, fixture, preview);
    await shot(page, 'fusion-confirm-protected');
    await closeDialog(page);
    await sameState(page, state, 'Cancel protected fusion preserves all material, target progress, gold and RNG');
    await page.locator(actSelector('fusion-preview')).click();
    await checkFusionConfirmation(page, fixture, preview);
    const after = await step(page, { type: 'fuse', targets, materials, allowProtected: true }, { selector: 'dialog[open] [data-action="confirm"]' });
    for (const id of targets) assert.equal(after.player.items.find(item => item.id === id).enhance, state.player.items.find(item => item.id === id).enhance);
    assert(materials.every(id => !after.player.items.some(item => item.id === id)));
    assert.equal(state.player.gold - after.player.gold, preview.cost);
    assert.equal(after.lastForge.upgrades.length, 3);
    await shot(page, 'fusion-result-three-relics');
    await page.reload(); await continueGame(page);
    await sameState(page, after, 'Reload neither repeats fusion nor loses target enhancement');
  });

  await run('merchant-and-paid-events', 'Synthetic shop and event fixtures; real paid actions', async () => {
    const shop = room('merchant'); shop.player.hp = Math.floor(E.stats(shop).maxHp / 3);
    const { page } = await fresh('merchant', shop);
    await continueGame(page); await shot(page, 'merchant-ready');
    await step(page, { type: 'buy', id: shop.shop[0].id });
    const healed = await step(page, { type: 'buy', id: 'heal' }); assert.equal(healed.player.hp, E.stats(healed).maxHp);
    assert(await page.locator(actSelector('buy', 'heal')).isDisabled());
    await shot(page, 'merchant-purchased');
    const prayer = room('prayer'), eventPage = (await fresh('paid-prayer', prayer)).page;
    await continueGame(eventPage); await shot(eventPage, 'event-prayer-ready');
    await eventPage.locator(actSelector('event-choice', 'luck')).click(); await shot(eventPage, 'event-prayer-confirm');
    await closeDialog(eventPage); await sameState(eventPage, prayer, 'Cancel paid prayer leaves gold, life, luck and RNG unchanged');
    await eventPage.locator(actSelector('event-choice', 'luck')).click();
    const prayed = await step(eventPage, { type: 'event-choice', id: 'luck', confirmed: true }, { selector: 'dialog[open] [data-action="confirm"]' });
    assert(prayed.eventLuck > prayer.eventLuck); assert.equal(prayed.rng, prayer.rng);
    await shot(eventPage, 'event-prayer-result');
    const gamble = room('gambit'), gamblePage = (await fresh('paid-gambit', gamble)).page;
    await continueGame(gamblePage);
    await gamblePage.locator(actSelector('event-choice', 'roll')).click();
    const rolled = await step(gamblePage, { type: 'event-choice', id: 'roll', confirmed: true }, { selector: 'dialog[open] [data-action="confirm"]' });
    assert(rolled.event.roll >= 1 && rolled.event.roll <= 6);
    await gamblePage.reload(); await continueGame(gamblePage);
    await sameState(gamblePage, rolled, 'Paid random event result and reward remain settled after refresh');
    await shot(gamblePage, 'event-gambit-result');
  });

  await run('next-luck-cross-room', 'Synthetic first-crit setup; subsequent room generated by normal engine transitions', async () => {
    let state = room('combat', { level: 1, floor: 80, seed: 22 });
    state.player.talents.dawnCrit = 3; state.enemy.hp = 1; state.enemy.shield = 0;
    let found = false;
    for (let rng = 1; rng < 500; rng++) {
      const candidate = { ...state, rng }, killed = E.transition(candidate, { type: 'roll' });
      if (!killed.lastRoll.critical || killed.phase !== 'chest') continue;
      const entered = E.transition(E.transition(killed, { type: 'open' }), { type: 'next' }), next = E.transition(entered, { type: 'roll' });
      if (!next.lastRoll.critical && next.nextLuck === 0) { state = candidate; found = true; break; }
    }
    assert(found, 'Deterministic first-critical, then noncritical fixture found without changing UI RNG');
    const { page } = await fresh('next-luck-cross-room', state);
    await continueGame(page);
    const killed = await step(page, { type: 'roll' }); assert.equal(killed.nextLuck, 15);
    const loot = await step(page, { type: 'open' }); assert.equal(loot.nextLuck, 15);
    await page.reload(); await continueGame(page); await sameState(page, loot, 'Pending next-combat luck survives save reload');
    const entered = await step(page, { type: 'next' }); assert.equal(entered.roomIndex, 1); assert.equal(entered.nextLuck, 15);
    await shot(page, 'next-luck-new-room');
    const expectedLuck = E.diceOdds(entered).luck, rolled = await step(page, { type: 'roll' });
    assert.equal(rolled.lastRoll.luck, expectedLuck); assert.equal(rolled.nextLuck, 0);
    note('First-crit luck survives kill, chest, reload and room entry; next combat roll consumes it once', { expectedLuck });
  });

  await run('v4-import-export-archive', 'Authentic constructed V4 baseline fixture envelopes; native import/export UI', async () => {
    const fixtures = JSON.parse(await fs.readFile(path.join(source, 'tests/fixtures/v4-baseline.json'), 'utf8')).saves;
    const original = fixtures.find(fixture => fixture.phase === 'combat'), replacement = fixtures.find(fixture => fixture.phase === 'fusion');
    const { page } = await fresh('active-unarchived-v4-A', null, { main: original.raw });
    await continueGame(page); await settings(page);
    const exported = await exportFile(page, 'export', 'v5-converted-export');
    assert.deepEqual(S.decodeSave(exported), S.decodeSave(original.raw));
    assert.equal(await raw(page, S.SAVE_KEY), original.raw); assert.equal(await raw(page, S.V4_BACKUP_KEY), null);
    await importFile(page, replacement.raw); await closeDialog(page);
    assert.equal(await raw(page, S.SAVE_KEY), original.raw); assert.equal(await raw(page, S.V4_BACKUP_KEY), null);
    note('Cancel V4 import preserves the active original bytes and creates no archive');
    await settings(page); await importFile(page, replacement.raw);
    await page.locator('dialog[open] [data-action="confirm"]').click();
    const expected = S.decodeSave(replacement.raw);
    await waitMain(page, expected);
    await page.waitForSelector('.game-shell[data-scene="fusion"]');
    await sameState(page, expected, 'Import B commits its exact migrated state');
    assert.equal(await raw(page, S.V4_BACKUP_KEY), original.raw);
    await settings(page);
    assert.equal(await exportFile(page, 'export-legacy', 'preserved-v4-A'), original.raw);
    note('Import B archives and exports active V4 A before replacement, byte for byte');
    await closeDialog(page);
    for (const fixture of fixtures) {
      recordFixture(fixture.label, fixture.raw, 'Checked-in original V4 engine fixture envelope');
      await settings(page); await importFile(page, fixture.raw);
      await page.locator('dialog[open] [data-action="confirm"]').click();
      await waitMain(page, S.decodeSave(fixture.raw));
      await page.waitForSelector(`.game-shell[data-scene="${S.decodeSave(fixture.raw).phase}"]`);
      await sameState(page, S.decodeSave(fixture.raw), `V4 import ${fixture.label}`);
      assert.equal(await raw(page, S.V4_BACKUP_KEY), original.raw);
    }
    await shot(page, 'v4-migrated-rest');
  });

  await run('corruption-and-quota-recovery', 'Injected malformed main payload and browser quota faults', async () => {
    const state = E.newGame(8421); state.runId = 'qa-recovery';
    const good = S.encodeSave(state), { page } = await fresh('corrupted-main-valid-mirror', null, { main: '{synthetic-broken-main', mirror: good });
    assert.match(await page.locator('#app').innerText(), /镜像/); await shot(page, 'corrupted-main-recovered');
    await continueGame(page); assert.equal(await raw(page), '{synthetic-broken-main');
    const expected = E.transition(state, { type: 'fate' });
    await page.locator(actSelector('fate')).click(); await waitRevision(page, expected.revision); await idle(page, true);
    await sameState(page, expected, 'First recovered action repairs main and mirror using the recovered RNG');
    const failure = (await fresh('primary-quota-failure', state)).page; await continueGame(failure);
    await storageFault(failure, S.SAVE_KEY);
    await failure.locator(actSelector('fate')).click();
    await failure.waitForFunction(() => window.__qaFaultCount > 0);
    await sameState(failure, state, 'Primary quota failure leaves both saves and game RNG unchanged');
    assert.match(await failure.locator('.toast').innerText(), /本次操作未生效|无法保存/);
    await shot(failure, 'primary-quota-error');
    await storageFault(failure, null); await step(failure, { type: 'fate' });
    const mirrorFailure = (await fresh('mirror-quota-failure', state)).page; await continueGame(mirrorFailure);
    await storageFault(mirrorFailure, S.BACKUP_KEY);
    await mirrorFailure.locator(actSelector('fate')).click(); await waitRevision(mirrorFailure, expected.revision);
    await sameState(mirrorFailure, expected, 'Mirror quota failure still commits exactly one valid main save', { mirror: false });
    assert.equal(await raw(mirrorFailure, S.BACKUP_KEY), good);
    await idle(mirrorFailure, true); assert.match(await mirrorFailure.locator('.bottomline').innerText(), /镜像/);
    await shot(mirrorFailure, 'mirror-quota-warning');
    await storageFault(mirrorFailure, null); await step(mirrorFailure, { type: 'enter' });
    note('The next successful transaction rebuilds the failed mirror');
  });

  await run('two-tab-conflict-and-pending-cancel', 'Shared-origin isolated tabs; one explicit missed-event fault', async () => {
    const fixture = fusionFixture(), { page, context } = await fresh('fusion-sync-tab-A', fixture.state);
    const second = await addTab(context, 'fusion-sync-tab-B'); await continueGame(page); await continueGame(second);
    const preview = await selectFusion(page, fixture); await page.locator(actSelector('fusion-preview')).click();
    await checkFusionConfirmation(page, fixture, preview);
    await second.locator('.main-nav [data-action="talents"]').click();
    const updated = await step(second, { type: 'talent', id: 'power' });
    await page.waitForFunction(() => !document.querySelector('dialog')?.open);
    await sameState(page, updated, 'Another tab update closes a pending material confirmation and synchronizes exact state');
    assert(fixture.materials.every(id => updated.player.items.some(item => item.id === id)));
    await shot(page, 'two-tab-pending-confirm-cancelled');
    const empty = await fresh('stale-empty-tab-A'), stale = await addTab(empty.context, 'stale-empty-tab-B', { missedStorageEvents: true });
    await empty.page.locator(actSelector('new')).first().click(); await empty.page.waitForSelector('.game-shell');
    const established = await saved(empty.page), preserved = await raw(empty.page);
    await stale.locator(actSelector('new')).first().click();
    await stale.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('另一'));
    assert.equal(await raw(stale), preserved); await sameState(empty.page, established, 'A stale empty tab cannot replace a newly created run');
    await shot(stale, 'stale-empty-start-rejected');
    await settings(stale); await importFile(stale, S.encodeSave(fixture.state));
    await stale.locator('dialog[open] [data-action="confirm"]').click();
    await stale.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('另一'));
    assert.equal(await raw(stale), preserved); assert.equal(await raw(stale, S.V4_BACKUP_KEY), null);
    note('The same stale empty tab cannot import over the newer run or create archive side effects');
    await shot(stale, 'stale-empty-import-rejected');
  });
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
  report.finished = new Date().toISOString();
  report.passed = report.cases.filter(test => test.status === 'passed').length;
  report.failed = report.cases.filter(test => test.status === 'failed').length;
  await fs.writeFile(path.join(output, `${label}-interactions.json`), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(output, `${label}-interaction-fixtures.json`), JSON.stringify(report.fixtures, null, 2));
}
if (!report.cases.length || report.failed || report.errors.length) process.exitCode = 1;
