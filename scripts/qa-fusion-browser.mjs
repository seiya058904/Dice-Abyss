// Optional development QA. Requires an external Playwright installation and
// browser; neither is a shipping/runtime dependency. All saves are synthetic.
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { newGame, transition, stats } from '../src/engine.js';
import { makeItem, fusionPreview } from '../src/equipment.js';
import { encodeSave, decodeSave, validateSave, SAVE_KEY, BACKUP_KEY, SETTINGS_KEY } from '../src/storage.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const options = Object.fromEntries(process.argv.slice(2).map(value => { const at = value.indexOf('='); return [value.slice(0, at), value.slice(at + 1)]; }));
const output = path.resolve(options['--output'] || '/tmp/dice-abyss-fusion-qa');
const url = options['--url'] || 'http://127.0.0.1:4192';
await fs.mkdir(output, { recursive:true });
const browser = await chromium.launch({ executablePath:options['--browser'] || process.env.CHROMIUM_PATH, headless:true,
  args:['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport:{ width:1440, height:900 }, deviceScaleFactor:1 });
const page = await context.newPage(), errors = [];
page.setDefaultTimeout(20000); page.setDefaultNavigationTimeout(20000);
page.on('pageerror', error => errors.push(error.message));
const report = { synthetic:true, source:'Current shipping source; synthetic saves in an isolated browser context.', url, browser:await browser.version(), cases:[], geometry:[], errors, started:new Date().toISOString() };
let checks = 0;
const check = (value, message) => { checks++; assert(value, message); };
const eq = (a, b, message) => { checks++; assert.deepEqual(a, b, message); };
const state = async () => decodeSave(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY));
const waitRevision = async revision => page.waitForFunction(({ key, revision }) => {
  try { return JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision === revision; } catch { return false; }
}, { key:SAVE_KEY, revision });
const button = action => page.locator(`[data-action="${action}"]`);
const card = id => page.locator(`[data-fusion-item="${id}"]`);
const selectionCount = async () => Number((await page.locator('.fusion-selected-count b').innerText()).replaceAll(',', ''));
function fixture({ count = 10, mixed = false, gold = 500000, locked = false, slot = 'weapon' } = {}) {
  let s = newGame(20261017);
  s.runId = `qa-round02-${slot}-${count}-${mixed}-${gold}-${locked}`; s.floor = 140; s.player.level = 40; s.player.gold = gold;
  s.fate = [3,4]; s.phase = 'route'; s.roomIndex = 0;
  s.route = Array.from({ length:6 }, (_, index) => ({ id:`f140r${index}`, type:index === 0 ? 'fusion' : index === 5 ? 'boss' : 'combat', quality:0, done:false }));
  s = transition(s, { type:'enter' });
  const target = s.player.items.find(item => item.slot === slot); target.level = 12; target.enhance = 2;
  while (s.player.items.filter(item => item.slot === slot).length < count) {
    const index = s.player.items.length, item = makeItem(s, slot, mixed ? index % 8 : 0, 140);
    item.level = 5 + index % 24; item.enhance = index % 5;
    if (locked && index % 11 === 0) item.locked = true;
    s.player.items.push(item);
  }
  s.player.hp = stats(s).maxHp;
  assert(validateSave(s));
  return { s, target:target.id, ids:s.player.items.filter(item => item.slot === slot).map(item => item.id) };
}
async function fresh(s, viewport = { width:1440, height:900 }, effects = 'low', base = url) {
  await page.setViewportSize(viewport); await page.goto(base);
  await page.evaluate(({ raw, main, mirror, key, effects }) => {
    localStorage.setItem(main, raw); localStorage.setItem(mirror, raw);
    localStorage.setItem(key, JSON.stringify({ sound:false, effects, scale:1 }));
  }, { raw:encodeSave(s), main:SAVE_KEY, mirror:BACKUP_KEY, key:SETTINGS_KEY, effects });
  await page.reload(); await page.evaluate(() => document.fonts.ready);
  await button('continue').click();
  await page.locator(base === url ? '.fusion-workroom' : '.fusion-screen').waitFor({ state:'visible' });
}
async function shot(name) { await page.screenshot({ path:path.join(output, `${name}.png`), timeout:30000 }); }
async function run(name, task) {
  if (options['--cases'] && !options['--cases'].split(',').includes(name)) return;
  const before = checks, started = performance.now();
  try { await task(); report.cases.push({ name, status:'PASS', checks:checks - before, ms:performance.now() - started }); }
  catch (error) { report.cases.push({ name, status:'FAIL', checks:checks - before, ms:performance.now() - started, error:error.stack }); try { await shot(`FAIL-${name}`); } catch {} }
  console.log(`${name}: ${report.cases.at(-1).status}`);
  await fs.writeFile(path.join(output, 'browser-report.json'), JSON.stringify(report, null, 2));
}
async function chooseTarget(id) { await card(id).click(); }
async function findCard(id) {
  await page.locator('#fusion-search').fill(id); await card(id).waitFor({ state:'visible' });
}
async function geometry(name) {
  const result = await page.evaluate(() => {
    const grid = document.querySelector('.fusion-item-grid'), pool = document.querySelector('#fusion-pool'), region = pool.getBoundingClientRect();
    const cards = [...document.querySelectorAll('[data-fusion-item]')], dock = document.querySelector('.fusion-dock');
    const dockRect = dock?.getBoundingClientRect(), fixedDock = dock && getComputedStyle(dock).position === 'fixed';
    const visible = cards.filter(card => { const r = card.getBoundingClientRect(); return r.top >= Math.max(0, region.top) && r.bottom <= Math.min(innerHeight, region.bottom) && r.left >= 0 && r.right <= innerWidth; });
    const faces = [...document.querySelectorAll('[data-fusion-face]')];
    const faceVisible = faces.filter(face => { const r = face.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; }).length;
    const unobscured = visible.filter(card => !fixedDock || card.getBoundingClientRect().bottom <= dockRect.top);
    const xp = document.querySelector('.fusion-commit-xp')?.getBoundingClientRect();
    const commit = document.querySelector('.fusion-submit').getBoundingClientRect();
    const overflows = [...document.querySelectorAll('body *')].filter(node => { const r = node.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1) && getComputedStyle(node).position !== 'absolute' && !node.closest('.cube-die, .dice-surface, .sr-only'); }).slice(0, 15).map(node => ({ tag:node.tagName, class:node.className, width:node.getBoundingClientRect().width }));
    return { width:innerWidth, height:innerHeight, columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length, cards:cards.length, fullyVisible:visible.length,
      pool:{ top:region.top, bottom:region.bottom, height:region.height, scrollHeight:pool.scrollHeight }, horizontalOverflow:document.documentElement.scrollWidth > innerWidth,
      mainVisible:commit.top >= 0 && commit.bottom <= innerHeight, cardFont:getComputedStyle(cards[0].querySelector('.fusion-card-name')).fontSize,
      sixFaces:faces.length, visibleFaces:faceVisible, unobscuredCards:unobscured.length,
      dock:fixedDock ? { top:dockRect.top, bottom:dockRect.bottom, height:dockRect.height, xpVisible:xp?.width > 0 && xp.top >= dockRect.top && xp.bottom <= dockRect.bottom } : null, overflows };
  });
  report.geometry.push({ name, ...result }); await shot(name); return result;
}

try {
  const poolFixture = fixture({ count:97, mixed:true, locked:true });
  if (options['--baseline-url']) await run('baseline-reproduction', async () => {
    await fresh(poolFixture.s, { width:1440, height:900 }, 'low', options['--baseline-url']);
    const target = page.locator(`[data-action="fusion-target"][data-id="${poolFixture.target}"]`);
    await target.click(); await button('fusion-all').click();
    const prior = await page.locator('.fusion-materials .fusion-stage-count').innerText();
    await page.locator('[data-action="fusion-target"]').nth(1).click();
    const after = await page.locator('.fusion-materials .fusion-stage-count').innerText();
    report.baseline = { selectedBefore:prior, selectedAfterChangingTarget:after, listWidths:await page.locator('.fusion-picker').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width)) };
    check(/0/.test(after), 'Baseline reproduces selection loss after target replacement'); await shot('baseline-1440');
  });
  await run('responsive-geometry', async () => {
    const measurements = [];
    for (const [width, height] of [[1366,768], [1440,900], [1920,1080], [2560,1440], [3840,2160], [800,900], [390,844]]) {
      await fresh(poolFixture.s, { width, height });
      const id = await card(poolFixture.ids.at(-1)).getAttribute('data-fusion-item'); await chooseTarget(id); await button('fusion-all').click();
      const result = await geometry(`workbench-${width}`);
      measurements.push(result);
    }
    for (const result of measurements) {
      const width = result.width;
      check(!result.horizontalOverflow, `${width}: no horizontal document scroll`);
      check(result.mainVisible, `${width}: primary fusion action remains visible`);
      eq(result.cards, 24, `${width}: only one page rendered`); eq(result.sixFaces, 6, 'Six faces rendered');
      eq(result.visibleFaces, 6, `${width}: all six faces are actually visible`);
      if (width < 1050) check(result.dock?.xpVisible, `${width}: experience remains in the fixed settlement`);
      if (width === 1440) { check(result.columns >= 6, '1440 has at least six columns'); check(result.fullyVisible >= 24, '1440 shows at least 24 complete cards'); }
    }
  });
  await run('ten-weapons-into-one', async () => {
    const f = fixture(); await fresh(f.s); await chooseTarget(f.target); await button('fusion-all').click();
    eq(await selectionCount(), 9, 'Exactly nine materials'); eq(await state(), f.s, 'Selection changes no save');
    await button('fusion-preview').click(); await page.locator('[data-fusion-result]').waitFor({ state:'visible' });
    check(!(await page.locator('dialog').isVisible()), 'Ordinary materials submit directly without modal');
    const after = await state(); eq(after.player.items.filter(item => item.slot === 'weapon').map(item => item.id), [f.target], 'Only target weapon remains');
    eq([...after.lastForge.consumed].sort(), f.ids.filter(id => id !== f.target).sort(), 'Every intended material consumed exactly once');
    const expected = transition(f.s, { type:'fuse', targets:[f.target], materials:after.lastForge.consumed }); eq(after, expected, 'One exact engine transaction with the committed material order');
    const text = await page.locator('[data-fusion-result]').innerText(); check(text.includes('Lv.12 →'), 'Result shows levels'); check(text.includes('攻击') && text.includes('+'), 'Result shows readable attack delta');
    await page.waitForFunction(() => !document.querySelector('#current-room').classList.contains('busy')); await shot('fusion-result-before-refresh');
    await page.reload(); await button('continue').click(); eq(await state(), expected, 'Refresh preserves exact completed fusion'); await shot('fusion-result');
  });
  await run('bulk-undo-and-cancel', async () => {
    const f = fixture(); await fresh(f.s); await chooseTarget(f.target); await button('fusion-all').click();
    await button('fusion-undo').click(); eq(await selectionCount(), 0, 'Five-second undo restores previous selection');
    await button('fusion-all').click(); eq(await button('fusion-all').innerText(), '取消全部', 'All selected button changes intent');
    await button('fusion-all').click(); eq(await selectionCount(), 0, 'All toggle clears materials'); eq(await state(), f.s, 'Bulk choices never consume');
  });
  await run('budget-and-force-all', async () => {
    const f = fixture({ gold:140 }); await fresh(f.s); await chooseTarget(f.target); await button('fusion-all').click();
    const n = await selectionCount(); check(n > 0 && n < 9, 'Budget truncates to affordable materials');
    check((await page.locator('.fusion-selection-notice').innerText()).includes('预算上限'), 'Truncation is explained');
    check(await button('fusion-preview').isEnabled(), 'Main action is enabled');
    await button('fusion-force-all').click(); eq(await selectionCount(), 9, 'Explicit full placement is available');
    check((await button('fusion-preview').innerText()).includes('按预算调整'), 'Over-budget main action repairs selection');
    await button('fusion-preview').click(); eq(await selectionCount(), n, 'Adjust trims back to budget without consuming'); eq(await state(), f.s, 'Budget review is not a transaction');
    const zero = fixture({ gold:0 }); await fresh(zero.s); await chooseTarget(zero.target); await button('fusion-all').click();
    eq(await selectionCount(), 0, 'Zero budget consumes nothing'); check(await button('fusion-preview').isEnabled(), 'Zero-budget main action remains usable');
    await button('fusion-preview').click(); check((await page.locator('.fusion-selection-notice').innerText()).includes('不足一件'), 'Zero budget explains recovery'); eq(await state(), zero.s, 'Zero budget leaves state intact');
  });
  await run('page-filter-and-target-retention', async () => {
    const f = fixture({ count:97 }); await fresh(f.s);
    await chooseTarget(f.ids.at(-1));
    // Round05 removes the historical Escape workaround. A genuine pointer
    // exit/re-entry starts a new preview, then the neighboring material must
    // remain directly clickable. All page/target/scroll/state assertions remain.
    await page.mouse.move(4, 4);
    await card(f.ids.at(-1)).hover();
    await page.locator('.fusion-item-tooltip').waitFor({ state:'visible' });
    await card(f.ids.at(-2)).click();
    await page.locator('#fusion-page-jump').fill('2'); await page.locator('#fusion-page-jump').press('Enter'); await page.locator('#fusion-search').focus();
    eq(await page.locator('.fusion-pagination').getAttribute('data-page'), '1', 'Jump reaches requested page');
    await page.evaluate(() => { document.querySelector('#fusion-pool').scrollTop = 42; document.querySelector('#fusion-settlement').scrollTop = 28; window.__fusionPoolNode = document.querySelector('#fusion-pool'); window.__fusionSearchNode = document.querySelector('#fusion-search'); });
    const scroll = await page.locator('#fusion-pool').evaluate(node => node.scrollTop);
    const newId = await page.locator('[data-fusion-item]').nth(3).getAttribute('data-fusion-item');
    await page.locator('[data-fusion-item]').nth(3).click({ button:'right' }); await page.locator('.fusion-context-menu [data-action="fusion-target"]').click();
    eq(await selectionCount(), 1, 'Replacement preserves legal selected material'); eq(await page.locator('.fusion-pagination').getAttribute('data-page'), '1', 'Replacement preserves page');
    check(await page.evaluate(() => window.__fusionPoolNode === document.querySelector('#fusion-pool')), 'Pool retains real DOM identity');
    eq(await page.locator('#fusion-pool').evaluate(node => node.scrollTop), scroll, 'Pool scroll is retained');
    await button('fusion-page-all').click(); check(await selectionCount() > 1, 'Page selection adds to outside-page choice');
    await page.locator('#fusion-search').fill('残响'); check(await page.evaluate(() => window.__fusionSearchNode === document.querySelector('#fusion-search')), 'Search node and focus are retained');
    eq(await page.locator('#fusion-search').inputValue(), '残响', 'Search text remains complete'); eq(await state(), f.s, 'All browsing keeps saved state intact');
    check(newId !== f.ids.at(-1), 'Target actually changed');
  });
  await run('keyboard-shift-and-tooltip', async () => {
    const f = fixture({ count:30 }); await fresh(f.s); await chooseTarget(f.ids.at(-1));
    const a = page.locator('[data-fusion-item]').nth(1), b = page.locator('[data-fusion-item]').nth(4);
    await a.click(); await b.click({ modifiers:['Shift'] }); eq(await selectionCount(), 4, 'Shift selects the visible contiguous range');
    await b.press('ArrowRight'); const focused = await page.evaluate(() => document.activeElement.dataset.fusionItem); check(!!focused, 'Arrow moves card focus');
    await page.locator(`[data-fusion-item="${focused}"]`).press('Space'); eq(await selectionCount(), 5, 'Keyboard selects without a combat roll');
    await page.locator(`[data-fusion-item="${focused}"]`).press('Shift+F10'); check(await page.locator('.fusion-context-menu').isVisible(), 'Keyboard opens actions menu');
    await page.keyboard.press('Escape'); check(!(await page.locator('.fusion-context-menu').isVisible()), 'Escape closes actions');
    // Escape intentionally suppresses same-anchor automatic previews. The
    // explicit keyboard path must still expose the complete, selectable text;
    // passive re-entry and pointer travel are tested in qa-fusion-tooltip.mjs.
    await page.locator(`[data-fusion-item="${focused}"]`).press('F2'); await page.locator('.fusion-item-details').waitFor({ state:'visible' });
    const text = await page.locator('.fusion-item-details').innerText(); check(text.includes('基础经验') && text.includes('与当前装备比较') && text.includes('与目标'), 'Explicit details cover XP and both comparisons');
    await shot('fusion-tooltip');
    await page.keyboard.press('Escape'); check(!(await page.locator('.fusion-item-details').isVisible()), 'Escape dismisses explicit details');
    await button('fusion-clear-materials').click();
    await page.locator('[data-fusion-item]').nth(10).click(); await a.click();
    await page.locator('[data-fusion-item]').nth(3).click({ modifiers:['Shift'] }); eq(await selectionCount(), 4, 'Range preserves an independently selected outside item');
    await button('fusion-clear-materials').click(); eq(await selectionCount(), 0, 'Clear removes the range and outside material');
    await page.locator('[data-fusion-item]').nth(2).click({ modifiers:['Shift'] }); eq(await selectionCount(), 1, 'Shift after clear cannot resurrect an old range base');
    eq(await state(), f.s, 'Keyboard selection never mutates RNG/save');
  });
  await run('drag-target-and-locked-protection', async () => {
    const f = fixture({ count:10, mixed:true }); const lockedId = f.ids.at(-2); f.s.player.items.find(item => item.id === lockedId).locked = true;
    await fresh(f.s); await chooseTarget(f.target); await card(f.ids.at(-3)).click();
    await card(f.ids.at(-1)).dragTo(page.locator('[data-fusion-drop="0"]'));
    check((await page.locator('.fusion-target-info strong').innerText()) === f.s.player.items.find(item => item.id === f.ids.at(-1)).name, 'Drop replaces the target');
    eq(await selectionCount(), 1, 'Drop retains other materials'); await button('fusion-all').click();
    check(!(await card(lockedId).getAttribute('aria-pressed') === 'true'), 'Batch skips locked material');
    await card(lockedId).click(); check(await card(lockedId).getAttribute('aria-pressed') === 'true', 'Explicit manual locked selection is possible');
    await button('fusion-preview').click(); check(await page.locator('dialog').isVisible(), 'Protected batch requires confirmation');
    check((await page.locator('dialog').innerText()).includes('已锁定'), 'Risk list identifies locked item');
    eq(await page.locator('dialog [data-fusion-face]').count(), 0, 'Confirmation is only list and cost');
    await shot('fusion-protection-dialog');
    await page.locator('dialog [data-action="close-dialog"]').first().click(); eq(await state(), f.s, 'Cancelling protection consumes nothing');
    await button('fusion-preview').click(); await page.locator('dialog [data-action="confirm"]').click(); await page.locator('[data-fusion-result]').waitFor({ state:'visible' });
    check(!(await state()).player.items.some(item => item.id === lockedId), 'Confirmed manual locked material is consumed');
  });
  await run('lock-and-recycle-context-actions', async () => {
    const f = fixture(); await fresh(f.s); await chooseTarget(f.target); const id = f.ids.at(-1);
    await card(id).click(); await card(id).click({ button:'right' }); await page.locator('.fusion-context-menu [data-action="fusion-lock"]').click();
    await waitRevision(f.s.revision + 1);
    check((await state()).player.items.find(item => item.id === id).locked, 'Lock persists through existing transaction'); eq(await selectionCount(), 0, 'Lock removes pending material');
    await card(id).click({ button:'right' }); check(await page.locator('.fusion-context-menu [data-action="fusion-salvage"]').isDisabled(), 'Locked recycle stays forbidden');
    await page.locator('.fusion-context-menu [data-action="fusion-lock"]').click();
    await waitRevision(f.s.revision + 2);
    await card(id).click({ button:'right' }); await page.locator('.fusion-context-menu [data-action="fusion-salvage"]').click();
    await page.locator('dialog [data-action="confirm"]').click(); await waitRevision(f.s.revision + 3); check(!(await state()).player.items.some(item => item.id === id), 'Context recycle performs real salvage');
  });
  await run('three-relics-six-faces', async () => {
    const f = fixture({ count:12, mixed:true, slot:'relic' }); await fresh(f.s); await page.locator('[data-action="fusion-slot"][data-slot="relic"]').click();
    const targets = [f.target, f.ids.at(-1), f.ids.at(-2)];
    for (let index = 0; index < 3; index++) { await page.locator(`[data-action="fusion-pick-target"][data-index="${index}"]`).click(); await card(targets[index]).click(); }
    await button('fusion-all').click(); eq(await page.locator('.fusion-target-item').count(), 3, 'Three target slots hold relics'); eq(await selectionCount(), 9, 'Other relics are selected');
    const materials = f.ids.filter(id => !targets.includes(id)); const preview = fusionPreview(f.s, targets, materials, true);
    const levels = await page.locator('.fusion-face-level strong').allTextContents();
    eq(levels.map(value => Number(value.replaceAll(',', ''))), preview.outcomes.flatMap(outcome => outcome.upgrades.map(upgrade => upgrade.after.level)), 'All eighteen outcome levels match engine');
    await button('fusion-preview').click(); if (await page.locator('dialog').isVisible()) await page.locator('dialog [data-action="confirm"]').click();
    await page.locator('[data-fusion-result]').waitFor({ state:'visible' }); eq(await page.locator('.fusion-result-target').count(), 3, 'Three readable result records');
  });
  await run('animation-skip-one-transaction', async () => {
    const f = fixture(); await fresh(f.s, { width:1440, height:900 }, 'full'); await chooseTarget(f.target); await button('fusion-all').click();
    await button('fusion-preview').click(); await page.locator('.fusion-workroom.is-forging').waitFor({ state:'visible' });
    check(await page.locator('.fusion-spark').count() > 0, 'Visible materials fly toward kiln');
    const committed = await state(); await button('skip').first().click(); eq(await state(), committed, 'Skip does not apply another transaction');
    eq(await page.locator('.fusion-spark').count(), 0, 'Skip removes residual material flight'); check(await page.locator('[data-fusion-result]').isVisible(), 'Skipped result stays readable');
  });
  await run('mobile-three-targets-fixed-settlement', async () => {
    for (const width of [800, 390]) {
      const f = fixture({ count:12, mixed:true, slot:'relic' }); await fresh(f.s, { width, height:900 });
      await page.locator('[data-action="fusion-slot"][data-slot="relic"]').click();
      const targets = [f.target, f.ids.at(-1), f.ids.at(-2)];
      for (let index = 0; index < targets.length; index++) {
        await page.locator(`[data-action="fusion-pick-target"][data-index="${index}"]`).click(); await card(targets[index]).click();
      }
      await button('fusion-all').click(); eq(await selectionCount(), 9, `${width}: three relic targets leave nine materials`);
      const g = await geometry(`workbench-${width}-three-relics`);
      eq(g.visibleFaces, 6, `${width}: six three-target outcomes remain visible`); check(g.dock?.xpVisible && g.mainVisible, `${width}: XP and submit remain visible`);
      eq(await page.locator('.fusion-face-level strong').count(), 18, `${width}: all eighteen target levels remain present`);
      await page.locator('[data-fusion-item]').last().scrollIntoViewIfNeeded();
      check(await page.locator('[data-fusion-item]').last().evaluate(node => node.getBoundingClientRect().bottom <= document.querySelector('.fusion-dock').getBoundingClientRect().top), `${width}: last card can be reached above the fixed settlement`);
      await page.locator('#fusion-search').click();
      check(await page.locator('#fusion-search').evaluate(node => node.getBoundingClientRect().bottom <= document.querySelector('.fusion-dock').getBoundingClientRect().top), `${width}: search can be reached above settlement`);
      eq(await state(), f.s, `${width}: responsive controls change no save`);
    }
  });
  if (options['--quick'] !== 'true') await run('ten-thousand-items', async () => {
    const f = fixture({ count:9998, gold:100000000 });
    // Use the newest equipped weapon so the exact ID query has one match;
    // searching "i1" also matches thousands of legitimate IDs such as i1000.
    f.target = f.ids.at(-1); f.s.player.equipped.weapon = f.target; f.s.player.hp = stats(f.s).maxHp;
    await fresh(f.s); await page.locator('#fusion-search').fill(f.target); await chooseTarget(f.target); await page.locator('#fusion-search').fill('');
    eq(await page.locator('[data-fusion-item]').count(), 24, '10,000 total items still renders 24 cards');
    await page.evaluate(() => { window.__fusionPoolNode = document.querySelector('#fusion-pool'); window.__fusionDiceNode = document.querySelector('.fusion-kiln-dice'); });
    const started = performance.now(); await button('fusion-all').click(); report.largeBagSelectionMs = performance.now() - started;
    eq(await selectionCount(), 9997, 'All 9,997 legal weapon materials span pages'); eq(await page.locator('[data-fusion-item]').count(), 24, 'Selecting thousands keeps DOM paged');
    check(await page.evaluate(() => window.__fusionPoolNode === document.querySelector('#fusion-pool') && window.__fusionDiceNode === document.querySelector('.fusion-kiln-dice')), '10k selection preserves the pool and existing dice DOM');
    await page.locator('#fusion-page-jump').fill('200'); await page.locator('#fusion-page-jump').press('Tab'); eq(await page.locator('.fusion-pagination').getAttribute('data-page'), '199', 'Distant page is reachable');
    eq(await state(), f.s, 'Large selection changes no save');
  });
} finally {
  report.checks = checks; report.finished = new Date().toISOString(); report.errors = errors;
  await fs.writeFile(path.join(output, 'browser-report.json'), JSON.stringify(report, null, 2)); await browser.close();
}
if (report.cases.some(test => test.status !== 'PASS') || errors.length) process.exitCode = 1;
