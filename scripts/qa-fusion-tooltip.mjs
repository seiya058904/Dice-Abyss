// Targeted functional QA for equipment details. Uses isolated synthetic saves,
// an external Playwright/Chromium and native browser input; no runtime dependency.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { newGame, transition, stats } from '../src/engine.js';
import { makeItem } from '../src/equipment.js';
import { encodeSave, decodeSave, validateSave, SAVE_KEY, BACKUP_KEY, SETTINGS_KEY } from '../src/storage.js';

const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const options = Object.fromEntries(process.argv.slice(2).map(value => { const at = value.indexOf('='); return [value.slice(0, at), value.slice(at + 1)]; }));
const url = options['--url'] || 'http://127.0.0.1:4193', mode = options['--expect'] || 'fixed';
const output = path.resolve(options['--output'] || '/tmp/dice-abyss-tooltip-qa');
await fs.mkdir(output, { recursive:true });
const browser = await chromium.launch({ executablePath:options['--browser'] || process.env.CHROMIUM_PATH, headless:true,
  args:['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const report = { synthetic:true, mode, url, browser:browser.version(), started:new Date().toISOString(), cases:[], errors:[], checks:0,
  scope:'Functional synthetic-save desktop, narrow viewport, keyboard and emulated touch tests. No physical device, screen reader, GPU or performance claim.' };
const sha = value => createHash('sha256').update(value).digest('hex');
let trace;
function check(value, label) { report.checks++; trace.push({ label, passed:!!value }); assert(value, label); }
function eq(actual, expected, label) { report.checks++; assert.deepEqual(actual, expected, label); trace.push({ label, passed:true }); }
const button = (page, action) => page.locator(`[data-action="${action}"]`);
const card = (page, id) => page.locator(`[data-fusion-item="${id}"]`);
const saved = async page => decodeSave(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY));
const count = async page => Number((await page.locator('.fusion-selected-count b').innerText()).replaceAll(',', ''));

function fixture(slot = 'weapon', long = false) {
  let s = newGame(20261017);
  s.runId = `qa-round05-tooltip-${slot}-${long}`; s.floor = 140; s.player.level = 40; s.player.gold = 500000;
  s.fate = [3, 4]; s.phase = 'route'; s.roomIndex = 0;
  s.route = Array.from({ length:6 }, (_, index) => ({ id:`f140r${index}`, type:index === 0 ? 'fusion' : index === 5 ? 'boss' : 'combat', quality:0, done:false }));
  s = transition(s, { type:'enter' });
  while (s.player.items.filter(item => item.slot === slot).length < 97) {
    const index = s.player.items.length, item = makeItem(s, slot, long ? index % 8 : 0, 140);
    item.level = 5 + index % 24; item.enhance = index % 5; s.player.items.push(item);
  }
  s.player.hp = stats(s).maxHp; assert(validateSave(s));
  return { s, ids:s.player.items.filter(item => item.slot === slot).map(item => item.id) };
}
async function load(page, s) {
  await page.goto(url);
  if (!report.sourceSha256) report.sourceSha256 = Object.fromEntries(await Promise.all(['fusion-controller.js','fusion-view.js','fusion.css'].map(async file => {
    const response = await page.request.get(new URL(`src/${file}`,url).href); assert(response.ok(),`served source ${file}`);
    return [file,sha(await response.body())];
  })));
  await page.evaluate(({ raw, main, mirror, settings }) => {
    localStorage.setItem(main, raw); localStorage.setItem(mirror, raw);
    localStorage.setItem(settings, JSON.stringify({ sound:false, effects:'low', scale:1 }));
  }, { raw:encodeSave(s), main:SAVE_KEY, mirror:BACKUP_KEY, settings:SETTINGS_KEY });
  await page.reload(); await page.evaluate(() => document.fonts.ready); await button(page, 'continue').click();
  await page.locator('.fusion-workroom').waitFor({ state:'visible' });
  check((await page.title()).includes('骰'), 'Expected game title');
  check(await page.locator('.fusion-workroom h1').innerText() === '回响熔室', 'Workbench content is visible');
}
async function shot(page, name) { await page.screenshot({ path:path.join(output, `${name}.png`) }); }
async function hoverFromOutside(page, id) {
  await page.mouse.move(4, 4); await card(page, id).hover();
}
async function run(name, task, contextOptions = {}) {
  if (options['--cases'] && !options['--cases'].split(',').includes(name)) return;
  trace = []; const before = report.checks, started = performance.now();
  const context = await browser.newContext({ viewport:{ width:1440, height:900 }, deviceScaleFactor:1, reducedMotion:'reduce', ...contextOptions });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => report.errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  try { await task(page, context); report.cases.push({ name, status:'PASS', checks:report.checks - before, ms:performance.now() - started, trace }); }
  catch (error) { report.cases.push({ name, status:'FAIL', checks:report.checks - before, ms:performance.now() - started, trace, error:String(error), stack:error.stack }); await shot(page, `FAIL-${name}`).catch(() => {}); }
  finally { await context.close(); await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); }
  console.log(`${name}: ${report.cases.at(-1).status}`);
}

try {
  if (mode === 'baseline') await run('baseline-native-obstruction-and-recovery', async page => {
    const f = fixture(), target = f.ids.at(-1), neighbor = f.ids.at(-2); await load(page, f.s);
    await card(page, target).click(); await hoverFromOutside(page, target);
    await page.locator('.fusion-item-tooltip').waitFor({ state:'visible' });
    const hit = await card(page, neighbor).evaluate(node => {
      const r = node.getBoundingClientRect(), top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { tooltipOwnsPoint:!!top?.closest('.fusion-item-tooltip'), topTag:top?.tagName, topText:top?.textContent,
        card:{ x:r.x, y:r.y, width:r.width, height:r.height } };
    });
    report.baselineHit = hit; check(hit.tooltipOwnsPoint, 'Baseline adjacent material is covered by the real tooltip');
    await shot(page, 'baseline-tooltip-obstruction');
    let blocked = false;
    try { await card(page, neighbor).click({ timeout:1500 }); }
    catch (error) { blocked = error.name === 'TimeoutError' && String(error).includes('intercepts pointer events'); report.nativeObstruction = String(error); }
    check(blocked, 'Baseline native material click is blocked by tooltip, without force or dispatch');
    eq(await count(page), 0, 'Blocked click did not select materials');
    await page.keyboard.press('Escape'); await page.locator('.fusion-item-tooltip').waitFor({ state:'hidden' });
    await card(page, neighbor).click(); eq(await count(page), 1, 'Existing Escape recovery permits one native selection');
    eq(await saved(page), f.s, 'Baseline review/selection preserves complete saved state');
  });
  if (mode === 'baseline') await run('baseline-pending-escape-observation', async page => {
    const f = fixture(), target = f.ids.at(-1); await load(page,f.s); await card(page,target).click();
    await page.mouse.move(4,4); await page.keyboard.press('Escape');
    await page.evaluate(() => {
      window.__pendingEscapeEvents = [];
      for (const type of ['pointerover','keydown']) document.addEventListener(type,event => {
        if (type === 'keydown' && event.key !== 'Escape') return;
        const anchor = event.target.closest?.('[data-fusion-item]'), tooltip = document.querySelector('.fusion-item-tooltip');
        window.__pendingEscapeEvents.push({type,key:event.key,item:anchor?.dataset.fusionItem,time:performance.now(),
          visible:!!tooltip && !tooltip.hidden,tag:event.target.tagName,class:event.target.className});
      },true);
    });
    await card(page,target).hover(); await page.keyboard.press('Escape'); await page.waitForTimeout(350);
    const events = await page.evaluate(() => window.__pendingEscapeEvents), over = events.find(event => event.type === 'pointerover' && event.item === target);
    const escape = events.find(event => event.type === 'keydown');
    const pending = !!over && !!escape && !escape.visible && escape.time - over.time >= 0 && escape.time - over.time < 160;
    const reopened = await page.locator('.fusion-item-tooltip').isVisible();
    report.pendingEscapeObservation = {events,delayMs:escape && over ? escape.time-over.time:null,pending,reopened,
      finding:pending ? reopened ? 'Native pending Escape was followed by a visible tooltip without further pointer input.'
        : 'The pending timer was cancelled. Reopening after pending Escape was not reproduced.' : 'Observed event timing did not establish a pending tooltip at Escape.'};
    check(pending,'Actual native pointerover and Escape timestamps establish Escape before the 160ms show deadline');
    eq(await saved(page),f.s,'The baseline Escape observation preserves complete saved state');
    await shot(page,'baseline-pending-escape-observation');
  });
  if (mode === 'fixed') {
    await run('desktop-safe-placement-and-native-adjacent-selection', async page => {
      report.desktopGeometry = [];
      for (const [width, height] of [[1366,768], [1440,900], [1920,1080], [2560,1440], [3840,2160]]) {
        await page.setViewportSize({ width, height }); const f = fixture(), target = f.ids.at(-1), neighbor = f.ids.at(-2);
        await load(page, f.s); await card(page, target).click(); await hoverFromOutside(page, target);
        const tooltip = page.locator('.fusion-item-tooltip'); await tooltip.waitFor({ state:'visible' });
        const geometry = await page.evaluate(() => {
          const panel = document.querySelector('.fusion-item-tooltip'), p = panel.getBoundingClientRect();
          const overlaps = r => p.left < r.right && p.right > r.left && p.top < r.bottom && p.bottom > r.top;
          const protectedRegions = ['#fusion-pool', '.fusion-settlement', '.fusion-dock', '.fusion-details-trigger'].map(selector => ({ selector, overlaps:overlaps(document.querySelector(selector).getBoundingClientRect()) }));
          const cards = [...document.querySelectorAll('[data-fusion-item]')];
          const blockedControls = [...document.querySelectorAll('button, input, select, textarea, summary, a[href], [contenteditable], [role="button"], [tabindex]')]
            .filter(node => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0 && overlaps(r); })
            .map(node => ({ tag:node.tagName,action:node.dataset.action,id:node.id,text:node.textContent.slice(0,80) }));
          return { width:innerWidth, height:innerHeight, panel:{ left:p.left, top:p.top, right:p.right, bottom:p.bottom, width:p.width, height:p.height }, protectedRegions,
            cardOverlaps:cards.filter(node => overlaps(node.getBoundingClientRect())).map(node => node.dataset.fusionItem),
            blockedControls,
            pointerEvents:getComputedStyle(panel).pointerEvents, overflowY:getComputedStyle(panel).overflowY,
            horizontalOverflow:document.documentElement.scrollWidth > innerWidth };
        });
        report.desktopGeometry.push(geometry);
        check(geometry.protectedRegions.every(region => !region.overlaps) && !geometry.cardOverlaps.length, `${width}: tooltip avoids the full card pool, all cards, settlement and details access`);
        eq(geometry.blockedControls,[],`${width}: preview covers no visible input, button, link or focusable control`);
        check(geometry.pointerEvents !== 'none' && geometry.overflowY === 'auto', `${width}: panel remains pointer-interactive and scrollable`);
        check(!geometry.horizontalOverflow, `${width}: no horizontal overflow`);
        check(await page.locator('.fusion-details-trigger').isVisible(),`${width}: full details remain visibly discoverable beside the catalogue heading`);
        if (width === 1440) await shot(page, 'desktop-safe-hover-1440');
        await card(page, neighbor).click(); eq(await count(page), 1, `${width}: native adjacent click works without Escape, force or dispatch`);
        await page.waitForTimeout(260); check(!(await tooltip.isVisible()), `${width}: selection render does not resurrect a stale panel`);
        await hoverFromOutside(page,target); await tooltip.waitFor({ state:'visible' });
        await button(page,'fusion-all').click();
        eq(await count(page),f.ids.length - 2,`${width}: native bulk action remains clickable directly from an open preview`);
        await page.waitForTimeout(260); check(!(await tooltip.isVisible()),`${width}: the bulk refresh leaves no stale preview`);
        eq(await saved(page), f.s, `${width}: exact saved game/RNG/gold/inventory is unchanged`);
      }
    });

    await run('escape-pending-dismissal-and-real-reentry', async page => {
      const f = fixture(), target = f.ids.at(-1); await load(page, f.s); await card(page, target).click();
      await hoverFromOutside(page, target); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      check(!(await page.locator('.fusion-item-tooltip').isVisible()), 'Escape leaves no delayed tooltip');
      await card(page, target).locator('.fusion-card-name').hover(); await page.waitForTimeout(250);
      check(!(await page.locator('.fusion-item-tooltip').isVisible()), 'Movement within the dismissed card does not redisplay');
      await hoverFromOutside(page, target); await page.locator('.fusion-item-tooltip').waitFor({ state:'visible' });
      check(await card(page, target).getAttribute('aria-describedby') === 'fusion-item-tooltip', 'A true exit and re-entry shows accessible details again');
      await page.keyboard.press('Escape'); check(await card(page, target).getAttribute('aria-describedby') === null, 'Dismissal removes the stale description relation');
      await card(page, target).click({ button:'right' }); await page.keyboard.press('Escape'); await page.waitForTimeout(250);
      check(!(await page.locator('.fusion-item-tooltip').isVisible()), 'Menu Escape returns focus without reopening the preview');
      eq(await saved(page), f.s, 'Dismissal, focus restoration and menus preserve the complete save');
    });

    await run('hover-journey-scroll-and-native-text-selection', async page => {
      const f = fixture(), target = f.ids.at(-1); await load(page, f.s); await card(page, target).click();
      const lower = await page.locator('[data-fusion-item]').nth(18).getAttribute('data-fusion-item');
      await hoverFromOutside(page, lower); const tooltip = page.locator('.fusion-item-tooltip'); await tooltip.waitFor({ state:'visible' });
      const originalHeading = await tooltip.locator('h3').innerText(), panel = await tooltip.boundingBox();
      await page.mouse.move(panel.x + panel.width / 2, panel.y + panel.height / 2, { steps:20 });
      await page.waitForTimeout(800); check(await tooltip.isVisible(), 'Pointer can travel from a lower card into the upper panel and keep reading');
      eq(await tooltip.locator('h3').innerText(), originalHeading, 'Traversing intermediate rows keeps the inspected item');
      const scrollRange = await tooltip.evaluate(node => node.scrollHeight - node.clientHeight); check(scrollRange > 0, 'The real long preview needs internal scrolling');
      await page.mouse.wheel(0, 400); await page.waitForTimeout(150); check(await tooltip.evaluate(node => node.scrollTop) > 0, 'Native wheel scrolls details without dismissing them');
      await page.mouse.wheel(0, -1200); await page.waitForTimeout(150);
      report.passiveSelectionFocus = { before:await page.evaluate(() => ({tag:document.activeElement?.tagName,item:document.activeElement?.dataset.fusionItem})) };
      await tooltip.locator('h3').click({ clickCount:3 });
      report.passiveSelectionFocus.after = await page.evaluate(() => ({tag:document.activeElement?.tagName,item:document.activeElement?.dataset.fusionItem}));
      check((await page.evaluate(() => String(getSelection()))).includes(originalHeading), 'Native pointer text selection retains readable detail text');
      const before = await count(page);
      await page.keyboard.press('Space'); await page.keyboard.press('Enter'); await page.keyboard.press('Control+a');
      eq(await count(page), before, 'Reading shortcuts do not trigger material selection through a focused card');
      check(await tooltip.isVisible(), 'Text selection is not replaced by a transient tooltip close');
      await shot(page, 'desktop-selectable-hover');
      await page.keyboard.press('Escape'); await card(page, lower).click(); eq(await count(page), before + 1, 'After reading, a native card click still selects exactly once');
      eq(await saved(page), f.s, 'Hover reading and selection leave the saved state exact');
    });

    await run('long-dialog-keyboard-undo-expiry-and-focus-return', async page => {
      const f = fixture('relic', true), ids = f.ids.slice(-4).reverse(); await load(page, f.s);
      await page.locator('[data-action="fusion-slot"][data-slot="relic"]').click();
      for (let index = 0; index < 3; index++) {
        if (index) await page.locator(`[data-action="fusion-pick-target"][data-index="${index}"]`).click();
        await card(page, ids[index]).click();
      }
      await button(page, 'fusion-all').click(); const selected = await count(page);
      await card(page, ids[3]).click({ button:'right' });
      await page.locator('.fusion-context-menu [data-action="fusion-details"]').click();
      const dialog = page.locator('.fusion-item-details'), content = dialog.locator('.fusion-details-content');
      await dialog.waitFor({ state:'visible' }); check(await content.evaluate(node => node === document.activeElement), 'Explicit detail action focuses its scrollable content');
      eq(await dialog.locator('.fusion-tooltip-target').count(), 3, 'Long details retain all three target comparisons');
      check((await content.innerText()).includes('基础经验') && (await content.innerText()).includes('与当前装备比较'), 'Details retain XP, equipped comparison and full effects');
      check(!(await dialog.locator('.fusion-tooltip-keys').innerText()).includes('Enter / 空格选择'), 'Dialog help describes reading rather than card-selection actions');
      check(await content.evaluate(node => node.scrollHeight > node.clientHeight), 'Long dialog content is actually scrollable');
      await page.keyboard.press('PageDown'); await page.waitForTimeout(150); check(await content.evaluate(node => node.scrollTop) > 0, 'Native PageDown scrolls long details');
      await page.keyboard.press('Control+a'); await page.keyboard.press('Space'); eq(await count(page), selected, 'Modal Ctrl+A and Space cannot batch-select or deselect materials');
      for (let i = 0; i < 4; i++) { await page.keyboard.press('Tab'); check(await dialog.evaluate(node => node.contains(document.activeElement)), 'Native Tab remains in the modal'); }
      await button(page, 'fusion-undo').waitFor({ state:'hidden', timeout:7000 });
      check(await dialog.isVisible(), 'Five-second undo notice expiry does not interrupt open details');
      await shot(page, 'desktop-long-details-dialog');
      await dialog.locator('.fusion-details-close').click();
      eq(await page.evaluate(() => document.activeElement?.dataset.fusionItem), ids[3], 'Visible close returns focus to the inspected card');
      await page.waitForTimeout(260); check(!(await page.locator('.fusion-item-tooltip').isVisible()), 'Closing the dialog does not reopen a dismissed preview');
      await page.keyboard.press('F2'); await dialog.waitFor({ state:'visible' });
      check((await dialog.locator('h3').innerText()) === f.s.player.items.find(item => item.id === ids[3]).name, 'F2 reopens the same focused item');
      await page.keyboard.press('Escape'); eq(await page.evaluate(() => document.activeElement?.dataset.fusionItem), ids[3], 'Escape restores the inspected card focus');
      eq(await count(page), selected, 'All dialog operations preserve exact material selection');
      eq(await saved(page), f.s, 'All dialog operations preserve complete saved state');
    });

    await run('narrow-emulated-touch-details-and-selection', async page => {
      const f = fixture(), target = f.ids.at(-1), neighbor = f.ids.at(-2), next = f.ids.at(-3); await load(page, f.s);
      await card(page, target).tap(); await card(page, neighbor).tap(); eq(await count(page), 1, 'Two native touch taps choose a target and one material');
      await page.waitForTimeout(300); check(!(await page.locator('.fusion-item-tooltip').isVisible()), 'Emulated touch does not leave a passive hover overlay');
      await page.locator('.fusion-details-trigger').tap(); const dialog = page.locator('.fusion-item-details'); await dialog.waitFor({ state:'visible' });
      eq(await dialog.locator('h3').innerText(), f.s.player.items.find(item => item.id === neighbor).name, 'Visible touch details button inspects the last touched equipment');
      const geometry = await dialog.evaluate(node => { const r = node.getBoundingClientRect(); return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:innerWidth, height:innerHeight, horizontalOverflow:document.documentElement.scrollWidth > innerWidth }; });
      report.touchDialogGeometry = geometry;
      check(geometry.left >= 0 && geometry.top >= 0 && geometry.right <= geometry.width && geometry.bottom <= geometry.height && !geometry.horizontalOverflow, 'Narrow dialog fits the viewport without horizontal clipping');
      check(await dialog.locator('.fusion-details-close').isVisible(), 'Touch close control is visible without scrolling');
      await shot(page, 'touch-details-390');
      await page.evaluate(() => {
        window.__tooltipCloseEvents = [];
        for (const type of ['focusin','focusout','pointerdown','pointerup','pointerover']) document.addEventListener(type, event => {
          const anchor = event.target.closest?.('[data-fusion-item],[data-fusion-tooltip]');
          window.__tooltipCloseEvents.push({ type, pointerType:event.pointerType, touchSource:event.sourceCapabilities?.firesTouchEvents,
            tag:event.target.tagName, class:event.target.className, item:anchor?.dataset.fusionItem || anchor?.dataset.fusionTooltip });
        }, true);
      });
      await dialog.locator('.fusion-details-close').tap();
      await page.waitForTimeout(1000); report.touchCloseEvents = await page.evaluate(() => window.__tooltipCloseEvents);
      check(!(await page.locator('.fusion-item-tooltip').isVisible()), 'Touch close leaves no synthetic hover resurrection');
      await card(page, next).tap(); eq(await count(page), 2, 'Native touch selection continues after closing details');
      eq(await saved(page), f.s, 'Touch reading and selection preserve complete saved state');
    }, { viewport:{ width:390, height:844 }, hasTouch:true, isMobile:true });
  }
} finally {
  report.finished = new Date().toISOString(); report.scriptSha256 = sha(await fs.readFile(new URL(import.meta.url)));
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser.close();
}
console.log(JSON.stringify({ mode, cases:report.cases.map(({ name, status, checks }) => ({ name, status, checks })), errors:report.errors }, null, 2));
if (!report.cases.length || report.cases.some(item => item.status !== 'PASS') || report.errors.length) process.exitCode = 1;
