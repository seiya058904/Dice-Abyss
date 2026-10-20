// Optional browser regression for quantity-based talent allocation.
// Uses isolated, explicitly synthetic saves and external Playwright/Chromium.
// Game startup does not require either QA dependency.
// PLAYWRIGHT_MODULE=/path/playwright CHROMIUM_PATH=/path/chrome node scripts/qa-talents-browser.mjs --url=http://127.0.0.1:4192 --output=/tmp/talent-qa
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';

const args = Object.fromEntries(process.argv.slice(2).map(value => {
  const at = value.indexOf('='); return at < 0 ? [value, true] : [value.slice(0, at), value.slice(at + 1)];
}));
const url = args['--url'] || 'http://127.0.0.1:4192';
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname), 'Only loopback game servers are permitted');
const output = path.resolve(args['--output'] || '/tmp/dice-abyss-talents-qa');
await fs.mkdir(output, { recursive: true });
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: args['--browser'] || process.env.CHROMIUM_PATH, headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const report = { started: new Date().toISOString(), browser: browser.version(), url,
  method: 'Native mouse and keyboard actions in new Chromium contexts; exact decoded main/mirror states compared with authoritative engine transitions. Fixture and storage-failure injection are deliberate QA setup, never player data.',
  synthetic: true, cases: [], checks: 0, errors: [], warnings: [], geometry: [], screenshots: [],
  limitations: ['Viewport emulation is not physical mobile/4K hardware validation.', 'ANGLE SwiftShader is software rendering; these functional observations do not measure hardware FPS.', 'Storage quota injection is not physical power loss.', 'Keyboard semantics are checked; no external screen reader was used.'] };
let active;
const note = (condition, label, details = {}) => {
  report.checks++; active.checks.push({ label, passed: !!condition, ...details }); assert(condition, label);
};
const button = (page, action) => page.locator(`[data-action="${action}"]`);
const node = (page, id) => page.locator(`[data-action="talent"][data-id="${id}"]`);
const preset = (page, count) => page.locator(`[data-action="talent-count"][data-count="${count}"]`);
const raw = page => page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [S.SAVE_KEY, S.BACKUP_KEY]);
const saved = async page => S.decodeSave((await raw(page))[0]);
const waitRevision = (page, revision) => page.waitForFunction(({ key, revision }) => {
  try { return JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision === revision; } catch { return false; }
}, { key: S.SAVE_KEY, revision });
function fixture(points = 369, floor = 140) {
  const s = E.newGame(20261017); s.runId = `qa-round03-talents-${points}-${floor}`;
  s.floor = floor; s.player.level = 165; s.player.talentPoints = points; s.player.talents.power = 1;
  s.player.hp = E.stats(s).maxHp;
  assert(S.validateSave(s)); return s;
}
async function exact(page, expected, label) {
  const [main, mirror] = await raw(page); assert.deepEqual(S.decodeSave(main), expected, label);
  note(main === mirror, label, { revision: expected.revision, rng: expected.rng, points: expected.player.talentPoints, stateSha256: hash(expected) });
}
function observe(page) {
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => report.errors.push({ case: active?.name, kind: 'pageerror', message: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') report.errors.push({ case: active?.name, kind: 'console', message: message.text() });
    if (message.type() === 'warning') report.warnings.push({ case: active?.name, message: message.text() });
  });
}
async function load(page, state, viewport = { width: 1440, height: 900 }) {
  assert(S.validateSave(state)); await page.setViewportSize(viewport); await page.goto(url);
  await page.evaluate(({ main, mirror, settings, value }) => {
    localStorage.setItem(main, value); localStorage.setItem(mirror, value);
    localStorage.setItem(settings, JSON.stringify({ sound: false, effects: 'low', scale: 1 }));
  }, { main: S.SAVE_KEY, mirror: S.BACKUP_KEY, settings: S.SETTINGS_KEY, value: S.encodeSave(state) });
  await page.reload(); await page.evaluate(() => document.fonts.ready);
  await button(page, 'continue').click(); await page.locator('.main-nav [data-action="talents"]').click();
  await page.locator('#talent-scroll').waitFor({ state: 'visible' });
  note((await page.title()) === '骰狱：无尽深渊 · Dice Abyss', 'Correct page identity');
  await exact(page, state, 'Opening the talent screen is read-only');
}
async function shot(page, name) {
  const filename = `${name}.png`; await page.screenshot({ path: path.join(output, filename), animations: 'disabled' }); report.screenshots.push(filename);
}
async function invest(page, before, id, count, keyboard = false) {
  const expected = E.transition(before, { type: 'talent', id, count }); assert.notStrictEqual(expected, before);
  if (keyboard) await node(page, id).press('Enter'); else await node(page, id).click();
  await waitRevision(page, expected.revision); await exact(page, expected, `${id}: one exact ${count}-point request`);
  return expected;
}
async function run(name, body) {
  if (args['--cases'] && !String(args['--cases']).split(',').includes(name)) return;
  active = { name, status: 'RUNNING', checks: [] }; report.cases.push(active);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const page = await context.newPage(); observe(page); const start = performance.now();
  try { await body({ context, page }); active.status = 'PASS'; }
  catch (error) { active.status = 'FAIL'; active.error = error.stack; await shot(page, `FAIL-${name}`).catch(() => {}); }
  finally { active.elapsedMs = performance.now() - start; await context.close(); await fs.writeFile(path.join(output, 'talents-browser.json'), JSON.stringify(report, null, 2)); }
  console.log(`${name}: ${active.status}${active.error ? `\n${active.error}` : ''}`);
}
try {
  await run('quantity-preview-and-exact-commit', async ({ page }) => {
    let s = fixture(); await load(page, s);
    note(await button(page, 'talent-count').count() === 4, 'Four bounded quantity presets are exposed');
    note(await preset(page, 1).getAttribute('aria-pressed') === 'true', 'New screen defaults to one point');
    await preset(page, 10).click(); await node(page, 'power').hover();
    note(await preset(page, 10).getAttribute('aria-pressed') === 'true', 'Quantity choice has an accessible selected state');
    note(await node(page, 'power').getAttribute('data-investment') === '10', 'The node exposes the exact investment');
    const preview = await page.locator('#talent-preview').innerText();
    note(preview.includes('无尽锋刃') && preview.includes('359') && preview.includes('11'), 'Preview names the node, resulting rank and remaining points', { text: preview });
    await exact(page, s, 'Quantity and hover preview never consume points or RNG'); await shot(page, 'talents-preview-1440');
    s = await invest(page, s, 'power', 10, true);
    note(await page.evaluate(() => document.activeElement?.dataset.id) === 'power', 'Keyboard focus follows the same usable node after rendering');
    await preset(page, 'max').click();
    note(await node(page, 'high').getAttribute('data-investment') === '5', 'Current-node max respects the five-rank cap');
    s = await invest(page, s, 'high', 'max');
    note(await node(page, 'high').isDisabled(), 'A completed node is disabled');
    note(await node(page, 'shatter').getAttribute('data-investment') === '3', 'Deep nodes retain their three-rank cap');
    s = await invest(page, s, 'shatter', 'max');
    await node(page, 'power').hover();
    note(await node(page, 'power').getAttribute('data-investment') === String(s.player.talentPoints), 'Unlimited-growth node max uses only remaining points');
    s = await invest(page, s, 'power', 'max');
    note(s.player.talentPoints === 0, 'Current-node max spends the exact remainder');
    note(await node(page, 'power').isDisabled(), 'Zero balance blocks a further investment');
    await page.reload(); await button(page, 'continue').click(); await exact(page, s, 'Refresh preserves every committed talent, RNG and revision');
  });
  await run('unlock-cap-and-dead-state', async ({ page }) => {
    let s = fixture(2, 29); await load(page, s); await preset(page, 10).click();
    note(await node(page, 'shatter').isDisabled(), 'Floor 29 cannot invest in the floor-30 talent');
    note(await node(page, 'power').getAttribute('data-investment') === '2', 'A ten-point request previews the two available points');
    s = await invest(page, s, 'power', 10); note(s.player.talentPoints === 0, 'Insufficient balance truncates rather than overspends');
    s = fixture(8, 30); s.player.talents.high = 4; await load(page, s); await preset(page, 10).click();
    note(await node(page, 'high').getAttribute('data-investment') === '1', 'Near-cap talent previews one actual point');
    s = await invest(page, s, 'high', 10);
    note(await node(page, 'shatter').getAttribute('data-investment') === '3', 'Floor 30 unlocks precisely the original deep node');
    s = fixture(2); s.phase = 'route'; s.fate = [3, 4];
    s.route = ['combat', 'combat', 'rest', 'combat', 'gold', 'boss'].map((type, i) => ({ id: `f140r${i}`, type, quality: 0, done: false }));
    s = E.transition(s, { type: 'enter' }); s.enemy.hp = s.enemy.maxHp = 5e14; s.enemy.attack = 1000000;
    s = E.transition(s, { type: 'roll' }); assert.equal(s.phase, 'dead'); assert(S.validateSave(s));
    await load(page, s); await preset(page, 'max').click(); s = await invest(page, s, 'power', 'max');
    note(s.phase === 'dead' && s.player.hp === 0, 'Investing while defeated neither heals nor revives');
    await button(page, 'game').first().click(); note(await page.locator('.death-screen').isVisible(), 'Returning to the room preserves the real death screen');
  });
  await run('scroll-and-keyboard-retention', async ({ page }) => {
    let s = fixture(20); await load(page, s, { width: 1366, height: 768 });
    await node(page, 'shatter').scrollIntoViewIfNeeded(); await node(page, 'shatter').focus();
    const position = await page.locator('#talent-scroll').evaluate(el => el.scrollTop);
    s = await invest(page, s, 'shatter', 1, true);
    const next = await page.locator('#talent-scroll').evaluate(el => el.scrollTop);
    note(Math.abs(position - next) <= 1, 'A keyboard investment preserves talent scroll position', { before: position, after: next });
    note(await page.evaluate(() => document.activeElement?.dataset.id) === 'shatter', 'The keyboard remains on the same still-usable deep node');
    await node(page, 'shatter').press('Space');
    s = E.transition(s, { type: 'talent', id: 'shatter', count: 1 }); await waitRevision(page, s.revision);
    await exact(page, s, 'Space activates the focused talent once without a combat roll');
    await shot(page, 'talents-keyboard-1366');
  });
  await run('save-failure-and-cross-tab', async ({ context, page }) => {
    let s = fixture(); await load(page, s); await preset(page, 10).click(); const before = await raw(page);
    await page.evaluate(key => {
      window.__talentSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (k === key) throw new DOMException('Synthetic talent write failure', 'QuotaExceededError'); return window.__talentSetItem.call(this, k, v); };
    }, S.SAVE_KEY);
    await node(page, 'power').click(); await page.locator('.toast.visible').filter({ hasText: '本次操作未生效' }).waitFor();
    assert.deepEqual(await raw(page), before); note(true, 'Failed primary write preserves both durable copies');
    note(await node(page, 'power').getAttribute('data-investment') === '10', 'Failure leaves the intended investment available');
    await page.evaluate(() => { Storage.prototype.setItem = window.__talentSetItem; });
    s = await invest(page, s, 'power', 10);
    const other = await context.newPage(); observe(other); await other.goto(url); await button(other, 'continue').click();
    await other.locator('.main-nav [data-action="talents"]').click(); await preset(other, 'max').click();
    s = await invest(page, s, 'power', 10);
    await other.waitForFunction(points => document.querySelector('[data-talent-points]')?.textContent.replace(/,/g, '').includes(String(points)), s.player.talentPoints);
    note(await node(other, 'power').getAttribute('data-investment') === String(s.player.talentPoints), 'Other tab rebuilds its max quote from the synchronized balance');
    s = await invest(other, s, 'power', 'max'); await exact(page, s, 'Both tabs retain the same final build and branch');
    note(await page.evaluate(() => !!navigator.locks?.request), 'Browser provides the existing cross-tab Web Locks path');
  });
  await run('four-desktop-and-narrow-layouts', async ({ page }) => {
    const s = fixture();
    for (const [width, height] of [[1366, 768], [1920, 1080], [2560, 1440], [3840, 2160], [390, 844]]) {
      await load(page, s, { width, height }); await preset(page, 10).click();
      const geometry = await page.evaluate(() => {
        const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
        return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
          presets: [...document.querySelectorAll('[data-action="talent-count"]')].map(rect),
          screen: rect(document.querySelector('#talent-scroll')),
          fonts: [document.fonts.check('16px "Abyss Text"'), document.fonts.check('16px "Abyss Pixel"')],
          count: document.querySelectorAll('[data-action="talent"]').length };
      });
      report.geometry.push(geometry); note(geometry.scrollWidth <= width + 1, `${width}: no horizontal page overflow`);
      note(geometry.fonts.every(Boolean), `${width}: both offline font families are available`);
      note(geometry.presets.every(r => r.x >= -1 && r.right <= width + 1 && r.width >= 30 && r.height >= 28), `${width}: quantity controls have usable in-bounds hit areas`);
      for (let i = 0; i < geometry.presets.length; i++) for (let j = i + 1; j < geometry.presets.length; j++) {
        const a = geometry.presets[i], b = geometry.presets[j]; note(Math.min(a.right, b.right) - Math.max(a.x, b.x) <= 1 || Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) <= 1, `${width}: quantity controls ${i}/${j} do not overlap`);
      }
      await shot(page, `talents-${width}`);
      if (width === 390) {
        await node(page, 'power').scrollIntoViewIfNeeded(); note(await node(page, 'power').isVisible(), '390: active-branch nodes are reachable');
        const after = await invest(page, s, 'power', 10); note(after.player.talentPoints === 359, '390: real investment works in the narrow layout');
        await shot(page, 'talents-390-invested');
        await page.locator('.talent-branch-nav [data-action="talent-group"][data-id="luck"]').click();
        await exact(page, after, '390: switching a branch is read-only');
        note(await node(page, 'luck').isVisible() && !(await node(page, 'power').isVisible()), '390: selected branch controls visible nodes');
        await preset(page, 5).click();
        const next = await invest(page, after, 'luck', 5);
        note(next.player.talentPoints === 354 && next.player.talents.luck === 5, '390: another branch accepts one exact native investment');
      } else await exact(page, s, `${width}: responsive layout and quantity choice remain read-only`);
    }
  });
} finally {
  report.finished = new Date().toISOString(); report.pass = report.cases.every(item => item.status === 'PASS') && report.errors.length === 0;
  await fs.writeFile(path.join(output, 'talents-browser.json'), JSON.stringify(report, null, 2)); await browser.close();
}
console.log(JSON.stringify({ pass: report.pass, cases: report.cases.length, checks: report.checks, errors: report.errors }, null, 2));
if (!report.pass) process.exitCode = 1;
