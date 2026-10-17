// Optional isolated browser QA. Playwright is a tester-provided dependency,
// never a runtime dependency of the distributed game. No personal saves used.
// --mode=fixtures validates deterministic fixtures without loading Playwright.
// --mode=baseline captures only the matching small fusion fixture at 1920.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const token = process.argv[i], split = token.indexOf('=');
  if (split >= 0) args[token.slice(0, split)] = token.slice(split + 1);
  else args[token] = !process.argv[i + 1] || process.argv[i + 1].startsWith('--') ? true : process.argv[++i];
}
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = String(args['--mode'] || 'pages'), baseline = mode === 'baseline';
assert(['pages', 'baseline', 'fixtures'].includes(mode), 'Use --mode=pages, baseline or fixtures');
const source = path.resolve(args['--source'] || (baseline ? path.join(project, '../baseline/Dice-Abyss-V5') : project));
const baseURL = String(args['--url'] || (baseline ? 'http://127.0.0.1:4198' : 'http://127.0.0.1:4199'));
const output = path.resolve(args['--output'] || path.join(project, 'docs/qa/evidence/browser'));
const label = String(args['--label'] || (baseline ? 'before' : 'after'));
const only = args['--cases']?.split(',');
const geometryViews = (args['--views'] || 'fusion,inventory,talent').split(',');
assert(geometryViews.every(view => ['fusion', 'inventory', 'talent'].includes(view)), 'Geometry views must be fusion, inventory or talent');
const sizes = (args['--sizes'] || '1920x1080,2560x1440,3840x2160').split(',').map(value => {
  const [width, height] = value.split('x').map(Number);
  assert(Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0);
  return { width, height };
});
const E = await import(pathToFileURL(path.join(source, 'src/engine.js')));
const S = await import(pathToFileURL(path.join(source, 'src/storage.js')));
const Q = await import(pathToFileURL(path.join(source, 'src/equipment.js')));
const C = await import(pathToFileURL(path.join(source, 'src/content.js')));
const R = await import(pathToFileURL(path.join(source, 'src/rarity.js')));
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const keys = { main: S.SAVE_KEY, mirror: S.BACKUP_KEY, settings: S.SETTINGS_KEY };
await fs.mkdir(output, { recursive: true });

// Matches the small fixture in qa-interactions.mjs exactly. Keeping these tiny
// constructors local avoids importing a driver that launches its own browser.
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
function rarityFixture(grade) {
  const floor = R.RARITY_FLOORS[grade], state = room('chest', { floor, level: Math.max(1, floor) });
  state.runId = `qa-pages-rarity-${grade}-floor-${floor}`;
  // A synthetic pending reward is allocated before entering the UI. The open
  // action must claim this exact issued item, not roll a new rarity or item.
  state.chest.item = Q.makeItem(state, ['weapon', 'armor', 'relic'][grade % 3], grade, floor, 'chest');
  return state;
}
function fullBagFixture(type = 'fusion') {
  const state = room(type, { floor: 140, level: 80 });
  state.runId = `qa-pages-full-bag-${type}`; state.player.gold = 100000000;
  const target = state.player.items.find(item => item.id === state.player.equipped.weapon);
  target.level = 160; target.levelXp = 50; target.enhance = 20;
  const base = Q.makeItem(state, 'weapon', 0, 140); base.level = 1; base.enhance = 0;
  const locked = { ...base, id: `i${state.nextId++}`, locked: true };
  const higher = Q.makeItem(state, 'weapon', 1, 140); higher.level = 1;
  const precious = Q.makeItem(state, 'weapon', 3, 140); precious.level = 1;
  state.player.items.push(locked, higher, precious);
  while (state.player.items.length < 10000) state.player.items.push({ ...base, id: `i${state.nextId++}` });
  state.player.hp = E.stats(state).maxHp;
  return { state, target: target.id, protectedIds: [locked.id, higher.id, precious.id] };
}
function inventoryFixture() {
  const fixture = fusionFixture();
  const weapon = Q.makeItem(fixture.state, 'weapon', 2, fixture.state.floor);
  weapon.level = 60; weapon.levelXp = 45; weapon.enhance = 9;
  fixture.state.player.items.push(weapon); fixture.weapon = weapon.id;
  fixture.state.runId = 'qa-pages-inventory-actions';
  return fixture;
}
const manifest = [];
function checkFixture(name, state, detail = {}) {
  assert(S.validateSave(state), `Current schema accepts fixture ${name}`);
  const raw = S.encodeSave(state);
  assert.deepEqual(S.decodeSave(raw), state, `${name} round-trip keeps full state and RNG`);
  const record = { name, runId: state.runId, version: state.version, floor: state.floor, phase: state.phase, items: state.player.items.length, rng: state.rng, revision: state.revision, nextId: state.nextId, rawCharacters: raw.length, rawUtf8Bytes: Buffer.byteLength(raw), rawSha256: hash(raw), stateSha256: hash(state), ...detail };
  manifest.push(record);
  return record;
}
const fusion = fusionFixture();
checkFixture('three-relic-fusion', fusion.state, { targets: fusion.targets, materials: fusion.materials, sharedConstructor: 'scripts/qa-interactions.mjs fusionFixture' });
const rewards = Array.from({ length: 8 }, (_, grade) => rarityFixture(grade));
rewards.forEach((state, grade) => checkFixture(`rarity-${grade}`, state, { grade, key: C.RARITIES[grade].key, gate: R.RARITY_FLOORS[grade] }));
const inventories = inventoryFixture(); checkFixture('inventory-actions', inventories.state);
const fullFusion = fullBagFixture(), fullChest = fullBagFixture('chest');
checkFixture('full-bag-fusion', fullFusion.state, { target: fullFusion.target, protectedIds: fullFusion.protectedIds });
checkFixture('full-bag-chest', fullChest.state, { pendingItem: fullChest.state.chest.item.id });
const codices = [30, 50, 80, 140].map(floor => room('fusion', { floor }));
codices.forEach(state => checkFixture(`codex-${state.floor}`, state));
const fixtureEvidence = { source, seed: 20261017, method: 'Deterministic synthetic constructors in scripts/qa-pages.mjs; current validator and exact envelope round-trip for every fixture. Only hashes and sizes retained to avoid duplicating large saves in the ZIP.', fixtures: manifest };
await fs.writeFile(path.join(output, `${label}-pages-fixtures.json`), JSON.stringify(fixtureEvidence, null, 2));
if (mode === 'fixtures') {
  console.log(`PASS ${manifest.length} valid deterministic fixtures; browser was not loaded or launched`);
  process.exit(0);
}

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({
  executablePath: args['--browser'] || process.env.CHROMIUM_PATH || '/tmp/dice-abyss-playwright/chrome-headless-shell-linux64/chrome-headless-shell',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const report = {
  label, source, baseURL, mode, started: new Date().toISOString(), browser: await browser.version(),
  method: 'Native Playwright mouse, keyboard, and select actions in fresh Chromium contexts. Fixture seeding only through isolated localStorage; application internals are never assigned. Persisted states compared with exact engine transitions.',
  limitations: ['Synthetic targeted states are not natural-play or drop-frequency samples.', 'Geometry records DOM Range and control rectangles, not actual glyph ink. Scroll-clipped content is recorded separately from non-scroll clipping.', 'Overlap and clipping candidates require visual review; the driver does not silently relabel them as passed.', 'No performance, FPS or physical-GPU claims are made by this script.'],
  cases: [], geometry: [], errors: [], screenshots: [], environments: [], fixtureManifest: `${label}-pages-fixtures.json`,
};
let activeCase;
const contexts = new Set();
const selector = (action, id) => `[data-action="${action}"]${id ? `[data-id="${id}"]` : ''}`;
const note = (name, detail = {}) => activeCase.checks.push({ name, ...detail });
async function fresh(state, viewport = { width: 1920, height: 1080 }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, acceptDownloads: false });
  contexts.add(context);
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', error => report.errors.push({ case: activeCase?.name, kind: 'pageerror', text: error.message }));
  page.on('console', message => { if (message.type() === 'error') report.errors.push({ case: activeCase?.name, kind: 'console', text: message.text() }); });
  await page.goto(baseURL);
  await page.evaluate(({ keys, raw }) => {
    localStorage.clear(); localStorage.setItem(keys.main, raw); localStorage.setItem(keys.mirror, raw);
    localStorage.setItem(keys.settings, JSON.stringify({ sound: false, effects: 'low', scale: 1 }));
  }, { keys, raw: S.encodeSave(state) });
  await page.reload(); await page.evaluate(() => document.fonts.ready);
  assert(await page.locator('#app').innerText(), 'Application rendered nonblank');
  await page.locator(selector('continue')).click(); await page.waitForSelector('.game-shell');
  const environment = await page.evaluate(() => ({
    width: innerWidth, height: innerHeight, dpr: devicePixelRatio, ua: navigator.userAgent,
    fonts: [...document.fonts].filter(font => font.family.includes('Abyss')).map(font => ({ family: font.family, weight: font.weight, status: font.status })),
    bodyFamily: getComputedStyle(document.body).fontFamily,
    textCoverageLoaded: document.fonts.check('400 16px "Abyss Text"', '中文装备金币回响'), webLocks: !!navigator.locks,
  }));
  if (!baseline) {
    assert(environment.fonts.some(font => font.family.replace(/["']/g, '') === 'Abyss Text' && font.status === 'loaded'), 'Packaged Chinese body font actually loaded');
    assert(environment.textCoverageLoaded, 'Browser font set accepts packaged Chinese text');
  }
  report.environments.push({ case: activeCase.name, ...environment });
  await sameState(page, state, 'Fixture continuation leaves the exact save untouched');
  return page;
}
async function saved(page) { return S.decodeSave(await page.evaluate(key => localStorage.getItem(key), S.SAVE_KEY)); }
async function sameState(page, expected, name) {
  const raws = await page.evaluate(keys => ({ main: localStorage.getItem(keys.main), mirror: localStorage.getItem(keys.mirror) }), keys);
  const actual = S.decodeSave(raws.main);
  assert.deepEqual(actual, expected, name); assert.equal(raws.mirror, raws.main, `${name}: mirror agrees`);
  note(name, { revision: actual.revision, rng: actual.rng, gold: actual.player.gold, items: actual.player.items.length, stateSha256: hash(actual) });
  return actual;
}
async function idle(page) {
  // These cases use low effects. Let the short reveal settle; the transient
  // skip button may disappear between checking its presence and clicking it.
  await page.waitForFunction(() => !document.querySelector('#current-room')?.classList.contains('busy'));
}
async function step(page, action, control = selector(action.type, action.id)) {
  const before = await saved(page), expected = E.transition(before, action);
  assert.notStrictEqual(expected, before, `Engine accepts ${action.type}`); assert(S.validateSave(expected));
  await page.locator(control).first().click();
  await page.waitForFunction(({ key, revision }) => {
    try { return JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision === revision; } catch { return false; }
  }, { key: S.SAVE_KEY, revision: expected.revision });
  await idle(page); return sameState(page, expected, `Native ${action.type} commits exactly one engine transition`);
}
async function closeDialog(page) {
  await page.locator('dialog[open] [data-action="close-dialog"]').last().click();
  assert.equal(await page.locator('dialog[open]').count(), 0);
}
async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  const filename = `${label}-pages-${name}.png`;
  await page.screenshot({ path: path.join(output, filename), animations: 'disabled' }); report.screenshots.push(filename);
}
async function selectFusion(page) {
  await page.locator('[data-action="fusion-slot"][data-slot="relic"]').click();
  for (const id of fusion.targets) await page.locator(selector('fusion-target', id)).click();
  for (const id of fusion.materials) await page.locator(selector('fusion-material', id)).click();
  assert.equal(await page.locator('.fusion-targets [aria-pressed="true"]').count(), 3);
  assert.equal(await page.locator('.fusion-outcomes [role="columnheader"]').count(), 7);
  assert.equal(await page.locator('.fusion-outcomes [role="cell"]').count(), 24);
}

// Read-only rendered geometry. Text outside a scrollport is intentionally not
// called a layout failure. Positive candidates retain exact rectangles and
// selectors so screenshot review can decide whether a true issue is present.
async function geometry(page, name) {
  await page.evaluate(() => document.fonts.ready);
  const result = await page.evaluate(() => {
    const scope = document.querySelector('#current-room'), epsilon = 1.5;
    const box = rect => ({ x: +rect.x.toFixed(2), y: +rect.y.toFixed(2), width: +rect.width.toFixed(2), height: +rect.height.toFixed(2) });
    const intersection = (a, b) => ({ left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) });
    const positive = rect => rect.right - rect.left > epsilon && rect.bottom - rect.top > epsilon;
    const descriptor = element => element.id ? `#${element.id}` : element.dataset.action ? `[data-action="${element.dataset.action}"]${element.dataset.id ? `[data-id="${element.dataset.id}"]` : ''}${element.dataset.slot ? `[data-slot="${element.dataset.slot}"]` : ''}` : element.tagName.toLowerCase() + (typeof element.className === 'string' && element.className.trim() ? '.' + element.className.trim().split(/\s+/).join('.') : '');
    const bounds = element => {
      let visible = { left: 0, top: 0, right: innerWidth, bottom: innerHeight }, scroll = false;
      const clips = [];
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), rect = parent.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return { visible: null, scroll, clips };
        const cx = ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX), cy = ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowY);
        if (cx || cy) {
          const isScroll = ['auto', 'scroll'].includes(style.overflowX) || ['auto', 'scroll'].includes(style.overflowY);
          scroll ||= isScroll;
          clips.push({ selector: descriptor(parent), type: isScroll ? 'scroll' : 'clip', x: cx, y: cy, rect: box(rect) });
          visible = { left: cx ? Math.max(visible.left, rect.left) : visible.left, right: cx ? Math.min(visible.right, rect.right) : visible.right, top: cy ? Math.max(visible.top, rect.top) : visible.top, bottom: cy ? Math.min(visible.bottom, rect.bottom) : visible.bottom };
        }
      }
      return { visible, scroll, clips };
    };
    const allControls = [...document.querySelectorAll('.game-shell button, .game-shell select, .game-shell summary')];
    const controls = [], clippedControls = [], scrollClippedControls = [], coveredControls = [];
    for (const element of allControls) {
      const rect = element.getBoundingClientRect(), style = getComputedStyle(element), b = bounds(element);
      if (!rect.width || !rect.height || !b.visible || style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
      const shown = intersection(rect, b.visible); if (!positive(shown)) continue;
      const record = { selector: descriptor(element), text: (element.innerText || element.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 180), disabled: !!element.disabled, rect: box(rect), inCenter: !!scope?.contains(element) };
      controls.push(record);
      if (rect.left < b.visible.left - epsilon || rect.right > b.visible.right + epsilon || rect.top < b.visible.top - epsilon || rect.bottom > b.visible.bottom + epsilon) (b.scroll ? scrollClippedControls : clippedControls).push({ ...record, clips: b.clips });
      else if (!element.disabled) {
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        if (hit && !element.contains(hit)) coveredControls.push({ ...record, coveredBy: descriptor(hit) });
      }
    }
    const controlOverlaps = [];
    for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i], b = controls[j], x = Math.min(a.rect.x + a.rect.width, b.rect.x + b.rect.width) - Math.max(a.rect.x, b.rect.x), y = Math.min(a.rect.y + a.rect.height, b.rect.y + b.rect.height) - Math.max(a.rect.y, b.rect.y);
      if (x > epsilon && y > epsilon) controlOverlaps.push({ a: a.selector, b: b.selector, aRect: a.rect, bRect: b.rect, width: +x.toFixed(2), height: +y.toFixed(2) });
    }
    const text = [], clippedText = [], scrollClippedText = [];
    const walker = document.createTreeWalker(document.querySelector('.game-shell'), NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const element = node.parentElement, value = node.textContent.trim();
      if (!value || !element || element.closest('svg,script,style,option,[aria-hidden="true"]')) continue;
      const style = getComputedStyle(element), b = bounds(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0 || !b.visible) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (!rect.width || !rect.height || !positive(intersection(rect, b.visible))) continue;
        const record = { selector: descriptor(element), text: value.slice(0, 180), rect: box(rect), font: style.fontFamily, inCenter: !!scope?.contains(element) };
        text.push(record);
        if (rect.left < b.visible.left - epsilon || rect.right > b.visible.right + epsilon || rect.top < b.visible.top - epsilon || rect.bottom > b.visible.bottom + epsilon) (b.scroll ? scrollClippedText : clippedText).push({ ...record, clips: b.clips });
      }
    }
    const textOverlaps = [];
    for (let i = 0; i < text.length; i++) for (let j = i + 1; j < text.length; j++) {
      const a = text[i], b = text[j]; if (!a.inCenter || !b.inCenter) continue;
      const x = Math.min(a.rect.x + a.rect.width, b.rect.x + b.rect.width) - Math.max(a.rect.x, b.rect.x), y = Math.min(a.rect.y + a.rect.height, b.rect.y + b.rect.height) - Math.max(a.rect.y, b.rect.y);
      if (x > epsilon && y > epsilon) textOverlaps.push({ a: a.text, b: b.text, aSelector: a.selector, bSelector: b.selector, aRect: a.rect, bRect: b.rect, width: +x.toFixed(2), height: +y.toFixed(2) });
    }
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      page: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, clientHeight: document.documentElement.clientHeight, scrollHeight: document.documentElement.scrollHeight },
      center: scope ? box(scope.getBoundingClientRect()) : null,
      counts: { visibleControls: controls.length, visibleTextFragments: text.length, clippedControls: clippedControls.length, scrollClippedControls: scrollClippedControls.length, coveredControls: coveredControls.length, controlOverlaps: controlOverlaps.length, clippedText: clippedText.length, scrollClippedText: scrollClippedText.length, textOverlaps: textOverlaps.length },
      controls, text, clippedControls, scrollClippedControls, coveredControls, controlOverlaps, clippedText, scrollClippedText, textOverlaps,
    };
  });
  report.geometry.push({ name, ...result, review: 'Measured candidates, pending screenshot/manual interpretation; scrolling is allowed and separately classified.' });
  note(`Measured rendered geometry: ${name}`, { ...result.counts, viewport: result.viewport });
}
async function run(name, callback) {
  if (only && !only.includes(name)) return;
  activeCase = { name, status: 'running', started: new Date().toISOString(), checks: [] }; report.cases.push(activeCase);
  const errorsBefore = report.errors.length;
  try {
    await callback(); assert.equal(report.errors.length, errorsBefore, `No console or page errors: ${name}`);
    activeCase.status = 'passed'; console.log(`PASS ${name}: ${activeCase.checks.length} assertions/measurements`);
  } catch (error) {
    activeCase.status = 'failed'; activeCase.error = error.stack || error.message;
    console.error(`FAIL ${name}: ${error.message}`);
    let index = 0; for (const context of contexts) for (const page of context.pages()) if (!page.isClosed()) await shot(page, `${name}-failure-${++index}`).catch(() => {});
  } finally {
    for (const context of contexts) await context.close(); contexts.clear(); activeCase.finished = new Date().toISOString();
    await fs.writeFile(path.join(output, `${label}-pages.json`), JSON.stringify(report, null, 2));
  }
}

try {
  if (baseline) {
    await run('baseline-fusion-1920', async () => {
      const page = await fresh(fusion.state); await selectFusion(page);
      await sameState(page, fusion.state, 'Baseline target/material selection is presentation-only');
      await geometry(page, 'fusion-1920'); await shot(page, 'fusion-1920');
      note('Matching before/after fixture and three-target preview', { stateSha256: hash(fusion.state), targets: fusion.targets, materials: fusion.materials });
    });
  } else {
    await run('eight-rarity-chest-reward', async () => {
      for (let grade = 0; grade < rewards.length; grade++) {
        const state = rewards[grade], page = await fresh(state), rarity = C.RARITIES[grade];
        assert.equal(await page.locator('.chest-screen').count(), 1);
        assert.equal(await page.locator('#primary-action').getAttribute('data-action'), 'open');
        const after = await step(page, { type: 'open' }, '#primary-action');
        assert.equal(after.loot.item.rarity, grade); assert.deepEqual(after.loot.item, state.chest.item);
        assert.equal(after.rng, state.rng); assert.equal(after.counters.chests, state.counters.chests + 1);
        assert.equal(await page.locator(`.loot-screen.${rarity.key}`).count(), 1);
        assert.equal((await page.locator('.drop-banner .rarity').innerText()).trim(), rarity.name);
        assert.match(await page.locator('.loot-reveal .item-card').innerText(), new RegExp(state.chest.item.name));
        note(`Rarity ${grade}: ${rarity.name} at gate floor ${state.floor}`, { pending: state.chest.item.id, rewardClass: rarity.key, floor: state.floor, rngUnchanged: true });
        // Root covers legendary/eternal at all resolutions; retain the other
        // six 1920 reward styles once, without duplicating those large images.
        if (![3, 7].includes(grade)) await shot(page, `reward-${rarity.key}-1920`);
        await page.reload(); await page.locator(selector('continue')).click();
        await sameState(page, after, `Rarity ${grade}: reload cannot grant the pending chest twice`);
        await page.context().close(); contexts.delete(page.context());
      }
    });

    await run('codex-gates-30-50-80-140', async () => {
      for (const state of codices) {
        const page = await fresh(state); await page.locator('.header-actions [data-action="codex"]').click();
        assert.equal(await page.locator('.codex-rarities > div').count(), 8);
        for (let grade = 0; grade < C.RARITIES.length; grade++) {
          const element = page.locator(`.codex-rarities > .${C.RARITIES[grade].key}`);
          assert.equal((await element.getAttribute('class')).includes('tier-locked'), state.floor < R.RARITY_FLOORS[grade]);
          if (grade >= 4) assert.match(await element.innerText(), new RegExp(`${R.RARITY_FLOORS[grade]} 层解锁`));
        }
        for (const source of ['combat', 'elite', 'boss', 'hiddenboss', 'vault', 'trial']) {
          await page.locator('#codex-source').selectOption(source);
          const expected = E.dropOdds(state, source, ['boss', 'hiddenboss'].includes(source) ? 'boss' : source).map(value => `${(value * 100).toFixed(2)}%`);
          const actual = await page.locator('.codex-odds > p b').allTextContents(); assert.deepEqual(actual, expected);
        }
        for (const category of ['combat', 'service', 'event', 'endpoint']) {
          await page.locator('#codex-category').selectOption(category);
          assert(await page.locator('.codex-room-list article').count() > 0, `Codex ${category} is nonempty`);
        }
        await sameState(page, state, `Codex floor ${state.floor}: filters preserve RNG, gold and inventory`);
        note(`Exact codex unlocks and six source distributions at floor ${state.floor}`, { unlocked: C.RARITIES.filter((_, grade) => state.floor >= R.RARITY_FLOORS[grade]).map(rarity => rarity.name) });
        await page.context().close(); contexts.delete(page.context());
      }
    });

    await run('inventory-lock-equip-three-relic-replacements', async () => {
      const { state, materials, targets, weapon } = inventories, page = await fresh(state);
      await page.locator('.main-nav [data-action="inventory"]').click();
      const itemId = materials[1];
      const locked = await step(page, { type: 'lock', id: itemId }, `.inventory-list ${selector('lock', itemId)}`);
      assert.equal(locked.player.items.find(item => item.id === itemId).locked, true);
      assert.equal(await page.locator(`.inventory-list ${selector('salvage-item', itemId)}`).count(), 0);
      assert.equal(await page.locator(`.inventory-list ${selector('lock', itemId)}`).getAttribute('aria-pressed'), 'true');
      await step(page, { type: 'lock', id: itemId }, `.inventory-list ${selector('lock', itemId)}`);
      const equipped = await step(page, { type: 'equip', id: weapon }, `.inventory-list ${selector('equip', weapon)}`);
      assert.equal(equipped.player.equipped.weapon, weapon);
      assert.deepEqual(equipped.player.items.find(item => item.id === state.player.equipped.weapon), state.player.items.find(item => item.id === state.player.equipped.weapon));
      await page.locator('[data-action="filter"][data-slot="relic"]').click();
      for (let i = 0; i < 3; i++) {
        const slot = ['relic', 'relic2', 'relic3'][i], before = await saved(page), old = before.player.items.find(item => item.id === targets[i]);
        await page.locator(`.inventory-list ${selector('equip', materials[i])}`).click();
        assert.equal(await page.locator('dialog[open] [data-action="equip-relic"]').count(), 3);
        if (i === 0) {
          await closeDialog(page); await sameState(page, before, 'Cancel relic replacement preserves all three old investments');
          await page.locator(`.inventory-list ${selector('equip', materials[i])}`).click();
        }
        const after = await step(page, { type: 'equip', id: materials[i], slot }, `dialog[open] [data-action="equip-relic"][data-id="${materials[i]}"][data-slot="${slot}"]`);
        assert.equal(after.player.equipped[slot], materials[i]); assert.deepEqual(after.player.items.find(item => item.id === old.id), old);
        for (const key of ['relic', 'relic2', 'relic3'].filter(key => key !== slot)) assert.equal(after.player.equipped[key], before.player.equipped[key]);
        note(`Native replacement of ${slot} keeps the displaced item's Lv, XP, +N and lock`, { displaced: old.id, level: old.level, levelXp: old.levelXp, enhance: old.enhance });
      }
    });

    await run('full-bag-pages-selection-and-review-cancel', async () => {
      const { state, target, protectedIds } = fullFusion, page = await fresh(state);
      await page.locator('.main-nav [data-action="inventory"]').click();
      assert.equal(await page.locator('.inventory-list .item-card').count(), 60);
      const firstIds = await page.locator('.inventory-list [data-action="equip"]').evaluateAll(elements => elements.map(element => element.dataset.id));
      await page.locator('[data-action="inventory-page"][data-page="1"]').click();
      assert.equal(await page.locator('.inventory-list .item-card').count(), 60);
      const secondIds = await page.locator('.inventory-list [data-action="equip"]').evaluateAll(elements => elements.map(element => element.dataset.id));
      assert(secondIds.every(id => !firstIds.includes(id)));
      await page.locator('#inventory-rarity').selectOption('3'); assert.equal(await page.locator('.inventory-list .item-card').count(), 1);
      await page.locator('#inventory-rarity').selectOption(''); await page.locator('#inventory-sort').selectOption('level');
      const salvage = E.salvagePreview(state, undefined, false, true); assert(salvage.items.length > 100);
      await page.locator(selector('salvage-preview')).click();
      assert.equal(await page.locator('dialog[open] .salvage-list > li').count(), 50);
      await page.locator('dialog[open] [data-action="review-page"][data-page="1"]').click();
      assert.equal(await page.locator('dialog[open] .salvage-list > li').count(), 50);
      await closeDialog(page); await sameState(page, state, 'Cancel 50-row paged salvage leaves all 10,000 items, gold and RNG intact');
      await page.locator('#primary-action').click(); await page.locator(selector('fusion-target', target)).click();
      const safe = Q.safeFusionMaterialIds(state, [target]); assert(safe.length > 100);
      assert(protectedIds.every(id => !safe.includes(id)));
      assert.equal(await page.locator('.fusion-targets [data-action="fusion-target"]').count(), 24);
      assert.equal(await page.locator('.fusion-materials [data-action="fusion-material"]').count(), 24);
      await page.locator(selector('fusion-all')).click();
      assert.equal((await page.locator('.fusion-materials .fusion-stage-count').innerText()).replace(/[^0-9]/g, ''), String(safe.length));
      await page.locator('[data-action="fusion-page"][data-kind="materials"][data-page="1"]').click();
      const selected = await page.locator('.fusion-materials [data-action="fusion-material"]').evaluateAll(elements => elements.map(element => ({ id: element.dataset.id, selected: element.getAttribute('aria-pressed') })));
      assert(selected.every(item => item.selected === String(safe.includes(item.id))));
      await page.locator('[data-action="fusion-page"][data-kind="targets"][data-page="1"]').click();
      assert.equal(await page.locator('.fusion-targets [data-action="fusion-target"]').count(), 24);
      assert.match(await page.locator('.target-sockets').innerText(), /\+20 保留/);
      await page.locator(selector('fusion-preview')).click();
      assert.equal(await page.locator('dialog[open] .salvage-list > li').count(), 50);
      assert.match(await page.locator('dialog[open] .review-pagination').innerText(), new RegExp(`共 ${safe.length.toLocaleString('en-US')} 件`));
      const firstRows = await page.locator('dialog[open] .salvage-list > li').allTextContents();
      await page.locator('dialog[open] [data-action="review-page"][data-page="1"]').click();
      assert.equal(await page.locator('dialog[open] .salvage-list > li').count(), 50);
      // Repeated names are legal; the list page label, not unequal row names,
      // proves navigation when the valid fixture intentionally clones items.
      assert.match(await page.locator('dialog[open] .review-pagination').innerText(), /第 2 \/ /);
      note('Paged fusion review renders only 50 rows', { selected: safe.length, pages: Math.ceil(safe.length / 50), firstRows: firstRows.length });
      await closeDialog(page); await sameState(page, state, 'Cancel full-bag fusion preserves all target/material items, gold, revision and RNG');
      await page.locator(selector('fusion-clear-materials')).click();
      assert.match(await page.locator('.fusion-materials .fusion-stage-count').innerText(), /^0 件$/);
      assert(await page.locator(selector('fusion-preview')).isDisabled());
      await sameState(page, state, 'Clear selection and both picker pages do not mutate the save');
      note('10,000-item UI is bounded and safe selection protects locked, higher-grade and precious material', { inventoryRows: 60, targetRows: 24, materialRows: 24, safeMaterials: safe.length, excluded: protectedIds });
    });

    await run('full-bag-pending-chest-salvage-then-open', async () => {
      const state = fullChest.state, page = await fresh(state), pending = structuredClone(state.chest);
      assert.equal(await page.locator('#primary-action').getAttribute('data-action'), 'inventory');
      assert.match(await page.locator('.primary-control').innerText(), /宝箱已保留/);
      await page.locator('#primary-action').click();
      await sameState(page, state, 'Full-bag chest directs to inventory without consuming pending reward or RNG');
      const preview = E.salvagePreview(state, undefined, false, true), ids = preview.items.map(item => item.id);
      assert(ids.length > 50); await page.locator(selector('salvage-preview')).click();
      assert.equal(await page.locator('dialog[open] .salvage-list > li').count(), 50);
      const salvaged = await step(page, { type: 'salvage', ids, allowOverflow: !!preview.overflow }, 'dialog[open] [data-action="confirm"]');
      assert.deepEqual(salvaged.chest, pending); assert.equal(salvaged.rng, state.rng); assert(salvaged.player.items.length < 10000);
      await page.locator('#primary-action').click(); assert.equal(await page.locator('#primary-action').getAttribute('data-action'), 'open');
      const opened = await step(page, { type: 'open' }, '#primary-action');
      assert.deepEqual(opened.loot, pending); assert.equal(opened.rng, state.rng);
      assert.equal(opened.player.items.filter(item => item.id === pending.item.id).length, 1);
      note('Pending chest survives full-bag cleanup and is claimed once', { removed: ids.length, pendingItem: pending.item.id, finalItems: opened.player.items.length, gold: opened.player.gold });
    });

    await run('inventory-talent-fusion-desktop-geometry', async () => {
      for (const viewport of sizes) {
        const page = await fresh(fusion.state, viewport);
        if (geometryViews.includes('fusion')) {
          await selectFusion(page); await geometry(page, `fusion-${viewport.width}`); await shot(page, `fusion-${viewport.width}`);
        }
        if (geometryViews.includes('inventory')) {
          await page.locator('.main-nav [data-action="inventory"]').click();
          await page.locator('[data-action="filter"][data-slot="relic"]').click();
          await geometry(page, `inventory-${viewport.width}`); await shot(page, `inventory-${viewport.width}`);
        }
        if (geometryViews.includes('talent')) {
          await page.locator('.main-nav [data-action="talents"]').click();
          assert.equal(await page.locator('.destiny-map [data-action="talent-group"]').count(), 5);
          assert.equal(await page.locator('.destiny-map [data-action="talent"]').count(), 30);
          await page.locator('[data-action="talent-group"][data-id="critical"]').click();
          await geometry(page, `talent-${viewport.width}`); await shot(page, `talent-${viewport.width}`);
        }
        await sameState(page, fusion.state, `${geometryViews.join(', ')} at ${viewport.width} pixels preserve the matching fixture`);
        await page.context().close(); contexts.delete(page.context());
      }
    });
  }
} finally {
  for (const context of contexts) await context.close(); await browser.close();
  report.finished = new Date().toISOString();
  report.passed = report.cases.filter(item => item.status === 'passed').length;
  report.failed = report.cases.filter(item => item.status === 'failed').length;
  await fs.writeFile(path.join(output, `${label}-pages.json`), JSON.stringify(report, null, 2));
}
if (report.failed || report.errors.length) process.exitCode = 1;
