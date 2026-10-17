// Optional correctness QA for navigation, OS reduced-motion and temporary
// disconnection. One fresh context only; no production source is modified.
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
  else args[token] = process.argv[++i];
}
const source = path.resolve(args['--source'] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const baseURL = args['--url'] || 'http://127.0.0.1:4199';
const output = path.resolve(args['--output'] || path.join(source, 'docs/qa/evidence/browser'));
const label = args['--label'] || 'after';
const E = await import(pathToFileURL(path.join(source, 'src/engine.js')));
const S = await import(pathToFileURL(path.join(source, 'src/storage.js')));
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const sourceFiles = ['src/app.js', 'src/engine.js', 'src/encounters.js', 'src/deep-rules.js', 'src/storage.js', 'src/equipment.js', 'src/views.js', 'src/effects.js', 'src/dice-renderer.js', 'src/dice-motion.js', 'src/styles.css', 'src/quality.css', 'src/progression.css'];
const sourceHashes = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, hash(await fs.readFile(path.join(source, file)))])));
let fixture = E.newGame(20261017);
fixture = E.transition(fixture, { type: 'fate' });
fixture = E.transition(fixture, { type: 'enter' });
fixture.runId = 'qa-environment-20261017';
// Only the current enemy's remaining HP/shield are changed, to ensure one
// actual manual roll reaches the reward flow. This is a synthetic fixture.
fixture.enemy.hp = 1; fixture.enemy.shield = 0;
assert.equal(fixture.phase, 'combat');
assert(S.validateSave(fixture));
const fixtureRaw = S.encodeSave(fixture);
assert.deepEqual(S.decodeSave(fixtureRaw), fixture);
await fs.mkdir(output, { recursive: true });
const report = {
  source, baseURL, started: new Date().toISOString(), browser: null,
  method: 'One new Chromium context; native clicks, real about:blank/goBack navigation, Playwright OS-media emulation and temporary context offline mode; exact decoded main/mirror state compared with deterministic engine transitions.',
  contextCount: 1, viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1,
  fixture: { provenance: 'Seed 20261017, normal fate/enter transitions, then synthetic runId and enemy HP=1/shield=0. No user save or UI internal state accessed.', raw: fixtureRaw, sha256: hash(fixtureRaw) },
  sourceBefore: await sourceHashes(), cases: [], errors: [], requests: [], responses: [], screenshots: [],
  network: { nonLoopbackPolicy: 'Abort every non-loopback HTTP(S) request before initial navigation. No external request is needed to prepare the application.', blocked: [] },
  limitations: [
    'Functional correctness only; shared software-rendering timing is not a frame-rate or latency benchmark.',
    'Reduced-motion preference is emulated, not toggled in a physical OS settings app.',
    'Offline mode is applied after all application resources load. It also disables loopback HTTP, so no offline HTTP reload is attempted or claimed.',
    'Successful online reload with non-loopback requests blocked proves this tested build has no external network requirement; it does not claim service-worker installation or a stopped local server can serve HTTP.',
  ],
};
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({
  executablePath: args['--browser'] || process.env.CHROMIUM_PATH || '/tmp/dice-abyss-playwright/chrome-headless-shell-linux64/chrome-headless-shell',
  headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
report.browser = await browser.version();
const context = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: 1 });
const loopback = value => {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && (url.hostname === 'localhost' || url.hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(url.hostname));
};
assert(loopback(baseURL), 'Only a loopback game server may be used');
await context.route('**/*', route => {
  const url = route.request().url();
  if (loopback(url)) return route.continue();
  report.network.blocked.push(url);
  return route.abort('blockedbyclient');
});
const page = await context.newPage();
page.setDefaultTimeout(30000);
let activeCase;
page.on('pageerror', error => report.errors.push({ case: activeCase?.name, kind: 'pageerror', text: error.message }));
page.on('console', message => { if (message.type() === 'error') report.errors.push({ case: activeCase?.name, kind: 'console', text: message.text() }); });
page.on('request', request => report.requests.push({ case: activeCase?.name || 'setup', url: request.url(), type: request.resourceType() }));
page.on('response', response => report.responses.push({ url: response.url(), status: response.status() }));
const note = (name, detail = {}) => activeCase.checks.push({ name, ...detail });
async function same(expected, name) {
  const values = await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [S.SAVE_KEY, S.BACKUP_KEY]);
  assert(values[0], 'Main save exists');
  assert.deepEqual(S.decodeSave(values[0]), expected, name);
  assert.equal(values[0], values[1], `${name}: mirror matches main`);
  note(name, { revision: expected.revision, phase: expected.phase, rng: expected.rng, stateSha256: hash(expected), envelopeSha256: hash(values[0]) });
}
async function loaded(expected) {
  await page.waitForSelector('#app [data-action]');
  const button = page.locator('[data-action="continue"]');
  if (await button.isVisible()) await button.click();
  await page.waitForSelector('.game-shell');
  await page.evaluate(() => document.fonts.ready);
  await same(expected, 'Normal application load/continue restores exact state');
}
async function step(expectedBefore, action) {
  const expected = E.transition(expectedBefore, action);
  assert.notStrictEqual(expected, expectedBefore, `Engine accepts ${action.type}`);
  await page.locator(`[data-action="${action.type}"]`).first().click();
  await page.waitForFunction(({ key, revision }) => {
    try { return JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision === revision; } catch { return false; }
  }, { key: S.SAVE_KEY, revision: expected.revision });
  await same(expected, `Native ${action.type} commits exactly one expected transition`);
  await page.waitForFunction(() => !document.querySelector('#current-room')?.classList.contains('busy'));
  return expected;
}
async function shot(name) {
  const filename = `${label}-environment-${name}.png`;
  await page.screenshot({ path: path.join(output, filename), animations: 'disabled' });
  report.screenshots.push(filename);
}
async function run(name, body) {
  activeCase = { name, started: new Date().toISOString(), status: 'running', checks: [] };
  report.cases.push(activeCase);
  const errorCount = report.errors.length;
  try { await body(); assert.equal(report.errors.length, errorCount, `${name}: no console/page errors`); activeCase.status = 'passed'; console.log(`PASS ${name}`); }
  catch (error) { activeCase.status = 'failed'; activeCase.error = error.stack || String(error); throw error; }
  finally { activeCase.finished = new Date().toISOString(); await fs.writeFile(path.join(output, `${label}-environment.json`), JSON.stringify(report, null, 2)); }
}
let current = fixture;
try {
  await page.goto(baseURL);
  await page.evaluate(({ main, mirror, settings, raw }) => {
    localStorage.setItem(main, raw); localStorage.setItem(mirror, raw);
    localStorage.setItem(settings, JSON.stringify({ effects: 'full', sound: false, scale: 1 }));
  }, { main: S.SAVE_KEY, mirror: S.BACKUP_KEY, settings: S.SETTINGS_KEY, raw: fixtureRaw });
  await page.reload();
  await run('navigation-back-continue', async () => {
    await loaded(current);
    const from = page.url();
    await page.goto('about:blank');
    assert.equal(page.url(), 'about:blank');
    const response = await page.goBack({ waitUntil: 'domcontentloaded' });
    assert.equal(page.url(), from);
    note('Real about:blank navigation and browser history back return to game', { returnedURL: page.url(), responseStatus: response?.status() ?? null });
    await loaded(current);
    await page.waitForTimeout(350);
    await same(current, 'Restored idle combat does not roll or consume RNG');
    await shot('history-back');
  });

  await run('os-reduced-motion-roll-reward', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches));
    assert.equal(await page.getAttribute('html', 'data-effects'), 'full', 'OS preference is tested while in-game full effects remains selected');
    await page.evaluate(() => {
      window.__qaMotionObservations = [];
      let previous = '';
      const observe = () => {
        const room = document.querySelector('#current-room');
        const moving = document.querySelector('.die') || document.querySelector('.loot-reveal');
        const style = moving ? getComputedStyle(moving) : null;
        const state = {
          busy: !!room?.classList.contains('busy'),
          phase: document.querySelector('.game-shell')?.dataset.scene || null,
          rolling: !!document.querySelector('.dice-row.rolling'),
          fxKind: document.querySelector('.scene-fx')?.dataset.fxKind || null,
          motionQuality: document.querySelector('.dice-surface')?.dataset.motionQuality || null,
          animationDuration: style?.animationDuration || null,
          transitionDuration: style?.transitionDuration || null,
        };
        const key = JSON.stringify(state);
        if (key !== previous) { window.__qaMotionObservations.push({ ...state, time: performance.now() }); previous = key; }
      };
      window.__qaMotionObserver = new MutationObserver(observe);
      window.__qaMotionObserver.observe(document.body, { subtree: true, childList: true, attributes: true });
      observe();
    });
    await page.waitForTimeout(350);
    await same(current, 'Changing reduced-motion preference does not initiate a roll');
    current = await step(current, { type: 'roll' });
    assert.equal(current.phase, 'chest');
    await page.waitForTimeout(350);
    await same(current, 'Reduced-motion roll leaves the pending reward for a manual open');
    current = await step(current, { type: 'open' });
    assert.equal(current.phase, 'loot');
    await page.waitForTimeout(350);
    await same(current, 'Reduced-motion reward is granted once and remains saved while idle');
    const observations = await page.evaluate(() => { window.__qaMotionObserver.disconnect(); return window.__qaMotionObservations; });
    assert(observations.some(row => row.busy), 'Observed an actual reduced-motion reveal');
    assert(observations.some(row => row.rolling), 'Observed the manual roll anticipation state');
    assert(observations.some(row => row.phase === 'loot'), 'Observed the actual reward page');
    assert(observations.every(row => row.fxKind === null), 'Full moving particle overlay is not started under reduced-motion');
    assert(observations.every(row => row.motionQuality !== 'motion'), 'GPU dice stay in static pose mode under reduced-motion');
    const styles = observations.filter(row => row.animationDuration !== null);
    assert(styles.length > 0);
    assert(styles.every(row => row.animationDuration.split(',').every(value => parseFloat(value) <= .00002)), 'CSS animation duration respects reduced-motion');
    note('Observed OS preference response with full effects selected', { reducedMotion: true, inGameEffects: 'full', observations, movingOverlayStarted: false, movingGpuPoseStarted: false });
    await shot('reduced-motion-reward');
  });

  await run('offline-actions-online-local-reload', async () => {
    const requestsBeforeOffline = report.requests.length;
    await context.setOffline(true);
    await page.waitForFunction(() => navigator.onLine === false);
    await same(current, 'Temporary browser offline status keeps saved progress');
    current = await step(current, { type: 'next' });
    assert.equal(current.phase, 'combat');
    current = await step(current, { type: 'roll' });
    await page.waitForTimeout(350);
    await same(current, 'Offline manual room advance and combat roll persist exact RNG/state');
    assert.equal(report.requests.length, requestsBeforeOffline, 'Loaded offline actions do not request network resources');
    note('Two native manual actions succeed while navigator.onLine=false', { networkRequestsDuringOfflineActions: 0, offline: await page.evaluate(() => !navigator.onLine) });
    await shot('offline-saved-action');
    await context.setOffline(false);
    await page.waitForFunction(() => navigator.onLine === true);
    const response = await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(response.status(), 200);
    await loaded(current);
    await page.waitForTimeout(350);
    await same(current, 'Online local-server reload retains the exact offline action and RNG');
    assert.equal(report.network.blocked.length, 0, 'Application attempted no non-loopback request');
    assert(report.requests.every(request => loopback(request.url)), 'All recorded resource requests use loopback');
    assert(report.responses.every(response => response.status < 400), 'Local application resources load successfully');
    note('Normal HTTP reload works with every non-loopback request blocked', { mainHTTPStatus: response.status(), uniqueLocalResources: new Set(report.requests.map(request => request.url)).size, nonLoopbackRequestsAttempted: report.network.blocked.length, fontsReady: await page.evaluate(() => document.fonts.status === 'loaded') });
    await shot('online-reloaded');
  });
  assert.equal(report.errors.length, 0);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = error.stack || String(error);
  console.error(error.stack || error);
  process.exitCode = 1;
} finally {
  report.sourceAfter = await sourceHashes();
  report.productionSourceUnchanged = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter);
  if (!report.productionSourceUnchanged) { report.status = 'failed'; process.exitCode = 1; }
  report.finished = new Date().toISOString();
  report.driverSha256 = hash(await fs.readFile(fileURLToPath(import.meta.url)));
  await fs.writeFile(path.join(output, `${label}-environment.json`), JSON.stringify(report, null, 2));
  await context.close();
  await browser.close();
}
