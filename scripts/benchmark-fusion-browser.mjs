// Optional development benchmark, using real clicks and synthetic saves only.
// Playwright/Chromium are external QA tools, never runtime dependencies.
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { newGame, transition, stats } from '../src/engine.js';
import { makeItem } from '../src/equipment.js';
import { encodeSave, decodeSave, validateSave, SAVE_KEY, BACKUP_KEY, SETTINGS_KEY } from '../src/storage.js';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const args = Object.fromEntries(process.argv.slice(2).map(value => { const i = value.indexOf('='); return [value.slice(0, i), value.slice(i + 1)]; }));
const output = path.resolve(args['--output'] || '/tmp/dice-abyss-fusion-browser-benchmark');
await fs.mkdir(output, { recursive:true });
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const samples = Number(args['--samples'] || 16);
assert(Number.isInteger(samples) && samples >= 6 && samples <= 200 && samples % 2 === 0, 'Use an even sample count from 6 to 200 to keep toggle cohorts identical');
const summary = values => { const sorted = [...values].sort((a,b) => a-b); const q = p => sorted[Math.max(0, Math.ceil(sorted.length*p)-1)]; return { count:values.length, p50:q(.5), p95:q(.95), p99:q(.99), max:sorted.at(-1), samples:values }; };
let s = newGame(20261017); s.runId = 'qa-fusion-browser-benchmark'; s.floor = 140; s.player.level = 40; s.player.gold = 10000000000;
s.fate = [3,4]; s.phase = 'route'; s.roomIndex = 0;
s.route = Array.from({ length:6 }, (_, i) => ({ id:`f140r${i}`, type:i === 0 ? 'fusion' : i === 5 ? 'boss' : 'combat', quality:0, done:false }));
s = transition(s, { type:'enter' });
const target = s.player.items[0]; target.level = 100;
while (s.player.items.length < 10000) { const item = makeItem(s, 'weapon', 0, 140); item.level = s.player.items.length === 3 ? 99 : 10; item.enhance = 0; s.player.items.push(item); }
s.player.hp = stats(s).maxHp; assert(validateSave(s));
const materialId = s.player.items[3].id;
const report = { started:new Date().toISOString(), method:'Native clicks; capture-phase browser performance.now to second requestAnimationFrame. Two warmups excluded per point; paired order alternates. Native Escape dismisses optional hover details before arming each measurement. Fixture setup/save injection, Escape and Playwright transport excluded from click samples.', limitations:['Synthetic legal 10,000-item save; not natural play.', 'ANGLE SwiftShader software rendering; RAF is not hardware GPU FPS.', 'One full fusion transaction per version and effect mode is coverage, not a population performance estimate.'], fixture:{ items:s.player.items.length, target:target.id, materialId, materials:9997, stateSha256:hash(s), rawBytes:Buffer.byteLength(encodeSave(s)) }, versions:{}, errors:[] };
const browser = await chromium.launch({ executablePath:args['--browser'] || process.env.CHROMIUM_PATH, headless:true, args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader'] }); report.browser = await browser.version();
const opened = {};
async function setup(label, url, effects = 'low') {
  const context = await browser.newContext({ viewport:{ width:1440, height:900 }, deviceScaleFactor:1 }); const page = await context.newPage();
  page.setDefaultTimeout(30000); page.on('pageerror', error => report.errors.push({ label, error:error.message }));
  await page.goto(url); await page.evaluate(({ raw, main, mirror, settings, effects }) => { localStorage.setItem(main,raw); localStorage.setItem(mirror,raw); localStorage.setItem(settings,JSON.stringify({ sound:false,effects,scale:1 })); }, { raw:encodeSave(s), main:SAVE_KEY, mirror:BACKUP_KEY, settings:SETTINGS_KEY, effects });
  await page.reload(); await page.evaluate(() => document.fonts.ready); await page.locator('[data-action="continue"]').click();
  const workbench = await page.locator('[data-fusion-item]').count() > 0;
  if (workbench) { await page.locator('#fusion-sort').selectOption('level'); await page.locator(`[data-fusion-item="${target.id}"]`).click(); }
  else await page.locator(`[data-action="fusion-target"][data-id="${target.id}"]`).click();
  await page.evaluate(() => {
    window.__qa = { records:[], longTasks:[] };
    new PerformanceObserver(list => window.__qa.longTasks.push(...list.getEntries().map(e => ({ start:e.startTime, duration:e.duration })))).observe({ type:'longtask', buffered:false });
    document.addEventListener('click', event => { if (!window.__qa.armed) return; const before = performance.now(), pool = document.querySelector('#fusion-pool'), dice = document.querySelector('.fusion-kiln-dice'); window.__qa.armed = false; requestAnimationFrame(() => requestAnimationFrame(() => window.__qa.records.push({ duration:performance.now()-before, poolRetained:pool ? pool === document.querySelector('#fusion-pool') : null, diceRetained:dice ? dice === document.querySelector('.fusion-kiln-dice') : null }))); }, true);
  });
  return { page, context, label, url, workbench };
}
async function clickMeasured(test, selector) {
  const { page } = test; await page.keyboard.press('Escape');
  const index = await page.evaluate(() => { window.__qa.armed = true; return window.__qa.records.length; });
  await page.locator(selector).click(); await page.waitForFunction(index => window.__qa.records.length > index, index);
  return page.evaluate(index => window.__qa.records[index], index);
}
async function assertUnchanged(test) {
  const raw = await test.page.evaluate(key => localStorage.getItem(key), SAVE_KEY); assert.deepEqual(decodeSave(raw), s); assert.equal(await test.page.evaluate(key => localStorage.getItem(key), BACKUP_KEY), raw);
}
const itemSelector = test => test.workbench ? `[data-fusion-item="${materialId}"]` : `[data-action="fusion-material"][data-id="${materialId}"]`;
try {
  opened.before = await setup('before', args['--baseline-url']); opened.after = await setup('after', args['--url']);
  for (const label of ['before','after']) report.versions[label] = { url:opened[label].url, workbench:opened[label].workbench, points:{} };
  for (const point of ['single-material-toggle','near-full-material-toggle']) {
    if (point === 'near-full-material-toggle') for (const test of Object.values(opened)) await test.page.locator('[data-action="fusion-all"]').click();
    for (const test of Object.values(opened)) for (let i=0;i<2;i++) await clickMeasured(test,itemSelector(test));
    const values = { before:[], after:[] }, retention = { before:[], after:[] };
    for (let i=0;i<samples;i++) for (const label of i%2 ? ['after','before'] : ['before','after']) { const row = await clickMeasured(opened[label],itemSelector(opened[label])); values[label].push(row.duration); retention[label].push(row); }
    for (const label of ['before','after']) { report.versions[label].points[point] = { milliseconds:summary(values[label]), retention:retention[label] }; await assertUnchanged(opened[label]); }
    for (const label of ['before','after']) if (opened[label].workbench) for (const row of retention[label]) assert(row.poolRetained && row.diceRetained, 'Local selections must retain pool and dice nodes');
  }
  // Measure the actual bulk button separately from a single item near a full
  // selection. Each pair returns to an empty selection before the next sample.
  for (const test of Object.values(opened)) await test.page.locator('[data-action="fusion-all"]').click();
  const bulk = { before:{ select:[], clear:[] }, after:{ select:[], clear:[] } };
  for (let i=0;i<samples+2;i++) for (const label of i%2 ? ['after','before'] : ['before','after']) {
    for (const action of ['select','clear']) {
      const row = await clickMeasured(opened[label], '[data-action="fusion-all"]');
      if (i >= 2) bulk[label][action].push(row);
      if (opened[label].workbench) assert(row.poolRetained && row.diceRetained, 'Bulk selection must retain pool and dice nodes');
    }
  }
  for (const label of ['before','after']) {
    for (const action of ['select','clear']) report.versions[label].points[`${action}-all`] = { milliseconds:summary(bulk[label][action].map(row => row.duration)), retention:bulk[label][action] };
    await assertUnchanged(opened[label]);
  }
  for (const test of Object.values(opened)) await test.context.close();
  for (const effects of ['low','full']) for (const label of ['before','after']) {
    const test = await setup(label, report.versions[label].url, effects), { page } = test;
    await page.locator('[data-action="fusion-all"]').click();
    await page.evaluate(() => { window.__qa.frames=[]; window.__qa.start=performance.now(); window.__qa.last=window.__qa.start; window.__qa.running=true; function frame(t) { if (!window.__qa.running) return; window.__qa.frames.push(t-window.__qa.last); window.__qa.last=t; window.__qa.maxSparks=Math.max(window.__qa.maxSparks||0,document.querySelectorAll('.fusion-spark').length); requestAnimationFrame(frame); } requestAnimationFrame(frame); });
    await page.locator('[data-action="fusion-preview"]').click();
    if (await page.locator('dialog[open] [data-action="confirm"]').count()) await page.locator('dialog[open] [data-action="confirm"]').click();
    await page.waitForFunction(({ key, revision }) => { try { return JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision === revision; } catch { return false; } }, { key:SAVE_KEY, revision:s.revision+1 });
    await page.waitForFunction(() => !document.querySelector('#current-room')?.classList.contains('busy'));
    const after = decodeSave(await page.evaluate(key => localStorage.getItem(key),SAVE_KEY));
    assert.equal(after.lastForge.consumed.length,9997); assert.equal(after.player.items.length,3);
    assert.deepEqual(after, transition(s,{ type:'fuse',targets:[target.id],materials:after.lastForge.consumed }));
    assert.equal(await page.evaluate(key => localStorage.getItem(key),SAVE_KEY),await page.evaluate(key => localStorage.getItem(key),BACKUP_KEY));
    const measured = await page.evaluate(() => { window.__qa.running=false; return { frames:window.__qa.frames,longTasks:window.__qa.longTasks.filter(e=>e.start>=window.__qa.start),elapsed:performance.now()-window.__qa.start,maxSparks:window.__qa.maxSparks||0 }; });
    report.versions[label].transactions ||= {}; report.versions[label].transactions[effects] = { exactEngineState:true, mirrorIdentical:true, consumed:9997, remaining:3, cost:s.player.gold - after.player.gold, resultSha256:hash(after), elapsedMs:measured.elapsed, rafIntervalsMs:summary(measured.frames), longTasks:measured.longTasks, maxMaterialSparks:measured.maxSparks };
    await test.context.close();
  }
  report.pass = true;
} catch (error) { report.pass=false; report.failure=error.stack; process.exitCode=1; }
finally { report.finished=new Date().toISOString(); await fs.writeFile(path.join(output,'fusion-browser-performance.json'),JSON.stringify(report,null,2)); await browser.close(); }
console.log(JSON.stringify({ pass:report.pass, cases:Object.keys(report.versions), errors:report.errors, failure:report.failure }));
