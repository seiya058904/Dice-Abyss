// Optional, isolated, read-only layout QA for the route-summary containment fix.
// Uses the same nine-item fusion fixture as qa-pages.mjs. No performance claims.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';
import * as Q from '../src/equipment.js';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(value => { const i = value.indexOf('='); return [value.slice(0, i), value.slice(i + 1)]; }));
const phase = args['--phase'] || 'after';
assert(['before', 'after'].includes(phase));
const sizes = (args['--sizes'] || '1920x1080,2560x1440,3840x2160').split(',').map(value => value.split('x').map(Number));
assert(sizes.every(([width, height]) => Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0));
const reportName = args['--report'] || `${phase}-rail-fix`;
assert(/^[a-z0-9-]+$/.test(reportName));
const url = args['--url'] || 'http://127.0.0.1:4199';
const output = path.join(project, 'docs/qa/evidence/browser');
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const css = await fs.readFile(path.join(project, 'src/visual.css'), 'utf8');
const declaration = css.match(/\.left-rail:not\(\.build-rail\)\{[^}]+\}/)?.[0];
assert(declaration?.includes(phase === 'before' ? '1.27fr' : '1.5fr'), `Expected ${phase} route row ratio`);
function fixture() {
  let s = E.newGame(20261017);
  s.runId = 'qa-interactions-fusion-80-20261017';
  s.floor = 80; s.player.level = 40; s.player.gold = 250000; s.player.talentPoints = 30;
  s.fate = [3, 4]; s.phase = 'route'; s.roomIndex = 0;
  s.route = Array.from({ length: 6 }, (_, i) => ({ id: `f80r${i}`, type: i === 0 ? 'fusion' : i === 5 ? 'boss' : 'combat', quality: 0, done: false }));
  s.player.hp = E.stats(s).maxHp; s = E.transition(s, { type: 'enter' });
  const targets = [], materials = [];
  for (let i = 0; i < 3; i++) {
    const item = Q.makeItem(s, 'relic', 2 + i % 2, s.floor);
    item.level = 32 + i * 3; item.levelXp = 40 + i * 11; item.enhance = [7, 4, 10][i];
    s.player.items.push(item); s.player.equipped[['relic', 'relic2', 'relic3'][i]] = item.id; targets.push(item.id);
  }
  for (let i = 0; i < 3; i++) {
    const item = Q.makeItem(s, 'relic', i === 0 ? 5 : 1, s.floor);
    item.level = 37 + i; item.enhance = i === 0 ? 6 : 0; item.locked = i === 0;
    s.player.items.push(item); materials.push(item.id);
  }
  s.player.hp = E.stats(s).maxHp;
  return { state: s, targets, materials };
}
const fusion = fixture(), first = E.newGame(20261017), firstRoute = E.transition(first, { type: 'fate' });
const longLog = structuredClone(fusion.state);
longLog.log = Array.from({ length: 6 }, (_, i) => ({ tone: i % 2 ? 'gold' : 'rare', text: `第 ${i + 1} 条有效日志 · ` + '击败深渊守卫，装备经验和金币已经保存。'.repeat(6) }));
assert.equal(hash(fusion.state), 'd49b740370e2f7cf57cc7490e4fc9d041103e5df80049302dad50bf563077b2a');
for (const state of [fusion.state, first, firstRoute, longLog]) { assert(S.validateSave(state)); assert.deepEqual(S.decodeSave(S.encodeSave(state)), state); }
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/tmp/dice-abyss-playwright/chrome-headless-shell-linux64/chrome-headless-shell', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const report = { phase, started: new Date().toISOString(), browser: await browser.version(), css: { file: 'src/visual.css', sha256: hash(css), declaration }, fixtureSha256: hash(fusion.state), rows: [], errors: [], screenshots: [], limitations: ['Targeted DOM bounds and native wheel checks in isolated software-rendered Chromium; no FPS claims.', 'The long-log fixture contains six valid entries of at most 180 characters, within the unchanged save schema.'] };
let context;
try {
  for (const [width, height] of sizes) {
    context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    await page.goto(url);
    for (const [name, state] of [['matching-fusion', fusion.state], ['first-floor-fate', first], ['first-floor-route', firstRoute], ['six-valid-long-logs', longLog]]) {
      await page.evaluate(({ raw, save, mirror, settings }) => { localStorage.clear(); localStorage.setItem(save, raw); localStorage.setItem(mirror, raw); localStorage.setItem(settings, JSON.stringify({ effects: 'low', sound: false, scale: 1 })); }, { raw: S.encodeSave(state), save: S.SAVE_KEY, mirror: S.BACKUP_KEY, settings: S.SETTINGS_KEY });
      await page.reload(); await page.evaluate(() => document.fonts.ready); await page.locator('[data-action="continue"]').click(); await page.waitForSelector('.game-shell');
      if (name === 'matching-fusion') {
        await page.locator('[data-action="fusion-slot"][data-slot="relic"]').click();
        for (const id of fusion.targets) await page.locator(`[data-action="fusion-target"][data-id="${id}"]`).click();
        for (const id of fusion.materials) await page.locator(`[data-action="fusion-material"][data-id="${id}"]`).click();
      }
      const bounds = await page.evaluate(() => {
        const rect = element => { if (!element) return null; const r = element.getBoundingClientRect(); return Object.fromEntries(['x', 'y', 'width', 'height', 'top', 'right', 'bottom', 'left'].map(key => [key, +r[key].toFixed(3)])); };
        const frame = document.querySelector('.route-panel'), summary = frame.querySelector('.fate-summary'), log = document.querySelector('.log-panel'), list = log.querySelector('ol'), last = frame.lastElementChild;
        const a = rect(frame), b = rect(summary), tail = rect(last), paddingBottom = parseFloat(getComputedStyle(frame).paddingBottom), borderBottom = parseFloat(getComputedStyle(frame).borderBottomWidth);
        return { width: innerWidth, height: innerHeight, frame: a, summary: b, summaryContained: b ? b.top >= a.top && b.bottom <= a.bottom && b.left >= a.left && b.right <= a.right : null, lastChild: { tag: last.tagName, className: last.className, rect: tail }, bottomClearance: +(a.bottom - borderBottom - paddingBottom - tail.bottom).toFixed(3), gridRows: getComputedStyle(document.querySelector('.left-rail')).gridTemplateRows, center: rect(document.querySelector('.center-panel')), dice: rect(document.querySelector('.dice-row')), log: { rect: rect(log), heading: rect(log.querySelector('.section-label')), overflowY: getComputedStyle(log).overflowY, scrollTop: log.scrollTop, clientHeight: log.clientHeight, scrollHeight: log.scrollHeight }, list: { rect: rect(list), overflowY: getComputedStyle(list).overflowY, scrollTop: list.scrollTop, clientHeight: list.clientHeight, scrollHeight: list.scrollHeight }, textFontLoaded: document.fonts.check('400 16px "Abyss Text"', '中文日志顺遂'), page: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight } };
      });
      if (phase === 'after') {
        if (bounds.summary) assert(bounds.summaryContained, `${name} ${width}: summary must fit route frame`);
        assert(bounds.bottomClearance >= -0.5, `${name} ${width}: normal-flow content fits frame padding`);
      }
      if (name === 'six-valid-long-logs') {
        const textBefore = await page.locator('.log-panel ol > li').allTextContents();
        assert.equal(textBefore.length, state.log.length); state.log.forEach((entry, i) => assert(textBefore[i].includes(entry.text)));
        const headingBefore = await page.locator('.log-panel > .section-label').boundingBox();
        const box = await page.locator('.log-panel').boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(0, 800);
        await page.waitForTimeout(100);
        bounds.wheel = await page.evaluate(() => Object.fromEntries(['.log-panel', '.log-panel ol', '.left-rail'].map(selector => { const element = document.querySelector(selector); return [selector, { scrollTop: element.scrollTop, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, overflowY: getComputedStyle(element).overflowY }]; })));
        const headingAfter = await page.locator('.log-panel > .section-label').boundingBox();
        assert.deepEqual(await page.locator('.log-panel ol > li').allTextContents(), textBefore);
        assert.deepEqual(headingAfter, headingBefore); bounds.headingFixedAfterWheel = true; bounds.allLogTextRetained = true; bounds.logTextSha256 = hash(textBefore);
        if (phase === 'after') {
          assert(bounds.wheel['.log-panel ol'].scrollTop > 0, `Native wheel scrolls the log list at ${width}`);
          assert.equal(bounds.wheel['.log-panel'].scrollTop, 0, 'Frame stays fixed');
          assert.equal(bounds.wheel['.left-rail'].scrollTop, 0, 'Outer rail stays fixed');
        }
      }
      const raw = await page.evaluate(key => localStorage.getItem(key), S.SAVE_KEY); assert.deepEqual(S.decodeSave(raw), state);
      report.rows.push({ name, stateSha256: hash(state), ...bounds });
      console.log(JSON.stringify({ phase, name, width, contained: bounds.summaryContained, bottomClearance: bounds.bottomClearance }));
      if (phase === 'after' && name === 'matching-fusion') { const filename = `after-rail-fix-${width}.png`; await page.screenshot({ path: path.join(output, filename), animations: 'disabled', timeout: 120000 }); report.screenshots.push(filename); }
    }
    await context.close(); context = null;
  }
  assert.equal(report.errors.length, 0); report.passed = true;
} catch (error) { report.passed = false; report.error = error.stack; throw error;
} finally {
  await context?.close(); await browser.close(); report.finished = new Date().toISOString();
  await fs.writeFile(path.join(output, `${reportName}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ phase, passed: report.passed, measurements: report.rows.length, errors: report.errors.length, screenshots: report.screenshots }));
}
