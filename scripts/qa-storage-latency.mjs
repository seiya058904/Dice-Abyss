// Finite native-browser save latency; round 07 adds a predeclared balanced order.
// The original fixed B/C order remains the default; pass --balanced-order for
// twelve pairs with B/C on odd pairs and C/B on even pairs. No sample is dropped.
// Example (tester-provided Playwright and official Chrome; no runtime dependency):
// PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_PATH=/path/to/chrome node
//   scripts/qa-storage-latency.mjs --baseline-source=/path/to/baseline/Dice-Abyss
//   --output=/external/qa/browser/storage-latency
// Add --prepare-only to validate the shared fixture and publish the fixed protocol
// without loading Playwright or launching a browser.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const at = arg.indexOf('=');
  return at < 0 ? [arg, true] : [arg.slice(0, at), arg.slice(at + 1)];
}));
const currentRoot = path.resolve(args['--current-source'] || fileURLToPath(new URL('../', import.meta.url)));
assert(typeof args['--baseline-source'] === 'string', '--baseline-source is required');
const baselineRoot = path.resolve(args['--baseline-source']);
const output = path.resolve(args['--output'] || '/tmp/dice-abyss-storage-latency');
for (const root of [currentRoot, baselineRoot]) {
  assert(output !== root && !output.startsWith(root + path.sep), 'QA output must be outside both projects');
}
const variants = [
  { label: 'baseline', root: baselineRoot, url: args['--baseline-url'] || 'http://127.0.0.1:4266/' },
  { label: 'current', root: currentRoot, url: args['--current-url'] || 'http://127.0.0.1:4267/' },
];
for (const variant of variants) {
  assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(variant.url).hostname), 'Only loopback test origins');
  assert.equal(new URL(variant.url).protocol, 'http:', 'Use the same native loopback HTTP environment');
  variant.E = await import(pathToFileURL(path.join(variant.root, 'src/engine.js')).href);
  variant.S = await import(pathToFileURL(path.join(variant.root, 'src/storage.js')).href);
  variant.V = await import(pathToFileURL(path.join(variant.root, 'src/views.js')).href);
  variant.version = JSON.parse(await fs.readFile(path.join(variant.root, 'package.json'), 'utf8')).version;
}
assert.notEqual(variants[0].url, variants[1].url, 'Keep the two source trees on separate origins');
const sha = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const viewport = { width: 1920, height: 1080 };
const measuredPairs = 12; // Precommitted: never changed after observing samples.
const balancedOrder = !!args['--balanced-order'];
const sourcePaths = ['index.html', 'package.json', 'src/app.js', 'src/engine.js', 'src/storage.js',
  'src/views.js', 'src/encounters.js', 'src/equipment.js', 'src/content.js',
  'src/effects.js', 'src/dice-renderer.js', 'src/deep.css', 'src/inventory-dom.js'];
// The shipped static server intentionally refuses package.json. Keep it in the
// disk freeze, compare its version to page metadata, and separately verify 404.
const servedSourcePaths = sourcePaths.filter(file => file !== 'package.json');
const scriptPath = fileURLToPath(import.meta.url);
const sourceSnapshot = async root => Object.fromEntries(await Promise.all(sourcePaths.map(async file => {
  let bytes;
  try { bytes = await fs.readFile(path.join(root, file)); }
  catch (error) { if (file === 'src/inventory-dom.js' && error.code === 'ENOENT') return [file, null]; throw error; }
  return [file, { bytes: bytes.length, sha256: sha(bytes) }];
})));
const sourcesBefore = Object.fromEntries(await Promise.all(variants.map(async v => [v.label, await sourceSnapshot(v.root)])));

function fixtureFor(api) {
  const state = api.E.newGame(27017);
  state.runId = 'qa-round06-native-storage-10000-27017';
  state.floor = 200;
  state.player.level = 100;
  state.player.gold = 1_000_000;
  state.player.hp = api.E.stats(state).maxHp;
  while (state.player.items.length < 10_000) {
    state.player.items.push(api.E.makeItem(state, undefined, state.nextId % 8));
  }
  assert(api.S.validateSave(state), 'Synthetic equipment fixture must pass the original validator');
  const html = api.V.center(state, { view: 'inventory', inventorySort: 'power', inventoryPage: 0, busy: false });
  const targetId = html.match(/data-action="lock"[^>]*data-id="([^"]+)"/)?.[1];
  assert(targetId, 'Pure inventory presentation must identify the first lock control');
  assert.equal(state.player.items.find(item => item.id === targetId).locked, false);
  const action = { type: 'lock', id: targetId };
  const after = api.E.transition(state, action);
  assert.notStrictEqual(after, state);
  assert.equal(after.player.items.find(item => item.id === targetId).locked, true);
  assert.equal(after.rng, state.rng, 'Locking must preserve RNG');
  assert.equal(after.revision, state.revision + 1);
  assert.equal(after.player.items.length, 10_000);
  const raw = api.S.encodeSave(state), afterRaw = api.S.encodeSave(after);
  assert.deepEqual(api.S.decodeSave(raw), state);
  assert.deepEqual(api.S.decodeSave(afterRaw), after);
  assert(raw.length * 3 > 5_000_000, 'This real equipment envelope must reach the new UTF-8 length-check branch');
  assert(Buffer.byteLength(afterRaw) <= 5_000_000, 'The fixture must fit the save-format limit without trimming');
  return { state, after, raw, afterRaw, targetId, action };
}
const fixture = fixtureFor(variants[0]);
assert.deepEqual(fixtureFor(variants[1]), fixture, 'Both original APIs must generate the exact same complete fixture and transition');
for (const field of ['SAVE_KEY', 'BACKUP_KEY', 'SETTINGS_KEY']) {
  assert.equal(variants[0].S[field], variants[1].S[field]);
}
const keys = { main: variants[0].S.SAVE_KEY, mirror: variants[0].S.BACKUP_KEY, settings: variants[0].S.SETTINGS_KEY };
const settingsRaw = JSON.stringify({ effects: 'low', sound: false, scale: 1 });
const schedule = [
  { phase: 'warmup', pair: 0, label: 'baseline' },
  { phase: 'warmup', pair: 0, label: 'current' },
  ...Array.from({ length: measuredPairs }, (_, i) =>
    (balancedOrder && i % 2 ? ['current', 'baseline'] : ['baseline', 'current'])
      .map(label => ({ phase: 'measured', pair: i + 1, label }))).flat(),
];
const protocol = {
  status: 'PREPARED',
  createdAtUtc: new Date().toISOString(),
  scriptSha256: sha(await fs.readFile(scriptPath)),
  nodeVersion: process.version,
  sourceRoots: variants.map(v => ({ label: v.label, root: v.root, url: v.url, version: v.version })),
  sourceHashes: sourcesBefore,
  servedSourcePaths, packageMetadataCheck: 'Package SHA remains in the disk snapshot; page release must equal package.version and the HTTP package.json path must remain 404.',
  flow: 'Load the same native main/mirror save, Continue, open Inventory, center-scroll the same lock button before timing, trust-click it, verify the exact committed state.',
  fixture: {
    synthetic: true, method: 'Seeded existing newGame/makeItem APIs; explicit floor 200, level 100 and gold 1000000. No removed fields or shortened equipment records.',
    seed: 27017, runId: fixture.state.runId, inventoryCount: fixture.state.player.items.length,
    targetId: fixture.targetId, action: fixture.action, beforeStateSha256: sha(fixture.state),
    afterStateSha256: sha(fixture.after), rawCharacters: fixture.raw.length, rawUtf8Bytes: Buffer.byteLength(fixture.raw),
    rawSha256: sha(fixture.raw), afterRawCharacters: fixture.afterRaw.length,
    afterRawUtf8Bytes: Buffer.byteLength(fixture.afterRaw), afterRawSha256: sha(fixture.afterRaw),
    guardUtf8BranchReachedByLength: fixture.afterRaw.length * 3 > 5_000_000,
  },
  viewport, deviceScaleFactor: 1, reducedMotion: 'reduce', settings: JSON.parse(settingsRaw),
  measuredPairs, measuredSamplesPerVersion: measuredPairs, warmupsPerVersion: 1, balancedOrder, schedule,
  exclusionRule: 'Only the one declared warmup per version is excluded. No slow-sample removal, adaptive sample count, rerun selection, or partial-success statistics.',
  lifecycle: 'One Chrome process, one isolated native context at a time, fresh context and reload for every scheduled sample. Warmups exercise this same lifecycle; they do not claim to warm the next document JavaScript realm.',
  clocks: {
    start: 'performance.now() in the capture listener for the trusted target click, before the unmodified app click handler.',
    lastWrite: 'Return or throw from the final original native Storage.prototype.setItem call during this action.',
    twoRaf: 'performance.now() in the second requestAnimationFrame callback scheduled after the most recent write returns.',
    nativeSetItem: 'Sum of time immediately around original setItem calls, with exact original receiver/arguments and return/exception behavior.',
    longTasks: 'Native PerformanceObserver longtask entries overlapping trusted-click start through second RAF; raw duration and interval overlap are both recorded.',
  },
  browserPath: 'Taskbook-authorized tester-provided Playwright/official Chrome. In round 07 the extension and cloud browser both returned ERR_CONNECTION_REFUSED for the executor loopback origin; no user browser session is used.',
  limits: [
    'These are API submission and UI-frame latency measurements, not physical-disk durability, FPS, GPU or natural-player distribution measurements.',
    'The operation includes engine transition, exact-snapshot checking, encoding, native storage and inventory rendering; it does not isolate TextEncoder cost.',
    'The setItem wrapper records timing/counts and calls the original native method unchanged. getItem, engine, quota and Web Locks are not replaced.',
    'Default Chromium quota is identical in configuration for both origins. Native failure to hold both real copies is BLOCKED, never bypassed.',
    'navigator.storage.estimate is origin-wide information, not a measurement of the separate localStorage size ceiling.',
    'One fixed seed and twelve pairs are finite scenario evidence. Keep all samples and do not infer a general speedup from small/noisy differences.',
  ],
};
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, 'protocol.json'), JSON.stringify(protocol, null, 2) + '\n');
if (args['--prepare-only']) {
  await fs.writeFile(path.join(output, 'PREPARED.md'), [
    '# 原生万件背包保存延迟：预定方案',
    '',
    '状态：PREPARED。只校验了共享夹具与脚本，尚未启动浏览器或产生性能样本。',
    '',
    '- 固定 12 paired，每版 12 个正式样本；另各 1 次预热，只排除这两次预热。',
    '- 顺序：' + (balancedOrder ? '奇数对 baseline/current，偶数对 current/baseline' : '每对 baseline/current') + '；每次独立原生 context，完全相同的 10,000 件装备起点。',
    '- 点击同一可见锁定按钮 ' + fixture.targetId + '，完整结果与两版真实 E.transition 严格相同。',
    '- 起点 ' + Buffer.byteLength(fixture.raw) + ' UTF-8 字节 / ' + fixture.raw.length + ' JS 字符。',
    '- 记录可信 click → 最后原生写返回、写后两次 RAF、原生 setItem 耗时与 long tasks。',
    '- 原生 quota 不修改；两份容量不足直接 BLOCKED。末个正式样本在两版各刷新续档一次。',
    '- 这是 API 提交与界面延迟，不能作为物理磁盘落盘耗时或自然玩家性能分布。',
    '',
    '详细固定方案及所有源码与夹具 SHA-256 见 protocol.json。',
    '',
  ].join('\n'));
  console.log(JSON.stringify({ status: 'PREPARED', measuredPairs, targetId: fixture.targetId, rawUtf8Bytes: Buffer.byteLength(fixture.raw), output }));
} else {
  await runBrowser();
}

// Installed identically in both variants. This observes a trusted browser event
// and wraps only setItem, transparently forwarding native behavior.
function installRecorder() {
  const descriptor = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem');
  const original = descriptor.value;
  let active = null;
  const supported = PerformanceObserver.supportedEntryTypes.includes('longtask');
  const appendTasks = entries => {
    if (!active || active.startedAt == null) return;
    for (const entry of entries) {
      const end = entry.startTime + entry.duration;
      if (end <= active.startedAt || (active.twoRafAt != null && entry.startTime > active.twoRafAt)) continue;
      active.longTasks.push({ name: entry.name, startTime: entry.startTime, duration: entry.duration,
        attribution: (entry.attribution || []).map(a => ({ name: a.name, containerType: a.containerType })) });
    }
  };
  const observer = supported ? new PerformanceObserver(list => appendTasks(list.getEntries())) : null;
  observer?.observe({ type: 'longtask', buffered: false });
  const finishAfterFrames = trial => {
    const generation = ++trial.writeGeneration;
    requestAnimationFrame(() => {
      if (active !== trial || generation !== trial.writeGeneration) return;
      trial.firstRafAt = performance.now();
      requestAnimationFrame(() => {
        if (active !== trial || generation !== trial.writeGeneration) return;
        trial.twoRafAt = performance.now();
        // Flush observer delivery after taking the actual second-RAF timestamp;
        // this timer is not part of the measured endpoint.
        setTimeout(() => {
          if (active !== trial || generation !== trial.writeGeneration) return;
          appendTasks(observer?.takeRecords() || []);
          trial.done = true;
          clearTimeout(trial.timeout);
          trial.resolve();
        }, 0);
      });
    });
  };
  Object.defineProperty(Storage.prototype, 'setItem', {
    ...descriptor,
    value: function setItem(key, value) {
      const trial = active;
      if (!trial || trial.startedAt == null || trial.done || this !== window.localStorage) {
        return Reflect.apply(original, this, arguments);
      }
      const startedAt = performance.now();
      let ok = false, errorName = null;
      try {
        const result = Reflect.apply(original, this, arguments);
        ok = true;
        return result;
      } catch (error) {
        errorName = error?.name || 'Error';
        throw error;
      } finally {
        const endedAt = performance.now();
        trial.writes.push({ key: typeof key === 'string' ? key : null,
          valueCharacters: typeof value === 'string' ? value.length : null,
          startedAt, endedAt, durationMs: endedAt - startedAt, ok, errorName });
        trial.lastWriteAt = endedAt;
        finishAfterFrames(trial);
      }
    },
  });
  document.addEventListener('click', event => {
    const control = event.target.closest?.('[data-action="lock"]');
    if (!active || active.startedAt != null || control?.dataset.id !== active.targetId) return;
    active.startedAt = performance.now();
    active.eventTimeStamp = event.timeStamp;
    active.isTrusted = event.isTrusted;
    active.visibilityAtClick = document.visibilityState;
  }, true);
  window.__qaStorageLatency = {
    originalSetItemIsNative: Function.prototype.toString.call(original).includes('[native code]'),
    longTasksSupported: supported,
    arm(targetId) {
      assertIdle();
      observer?.takeRecords();
      let resolve;
      const promise = new Promise(done => { resolve = done; });
      active = { targetId, startedAt: null, lastWriteAt: null, twoRafAt: null,
        writeGeneration: 0, writes: [], longTasks: [], done: false, promise, resolve };
      const trial = active;
      trial.timeout = setTimeout(() => {
        trial.error = 'No completed native write plus two RAF callbacks within 30000 ms';
        trial.done = true;
        trial.resolve();
      }, 30000);
    },
    async wait() {
      const trial = active;
      await trial.promise;
      appendTasks(observer?.takeRecords() || []);
      return {
        targetId: trial.targetId, startedAt: trial.startedAt, eventTimeStamp: trial.eventTimeStamp,
        isTrusted: trial.isTrusted, visibilityAtClick: trial.visibilityAtClick,
        lastWriteAt: trial.lastWriteAt, firstRafAt: trial.firstRafAt, twoRafAt: trial.twoRafAt,
        clickToLastWriteMs: trial.lastWriteAt == null ? null : trial.lastWriteAt - trial.startedAt,
        clickToTwoRafMs: trial.twoRafAt == null ? null : trial.twoRafAt - trial.startedAt,
        lastWriteToTwoRafMs: trial.twoRafAt == null ? null : trial.twoRafAt - trial.lastWriteAt,
        nativeSetItemMs: trial.writes.reduce((sum, write) => sum + write.durationMs, 0),
        writes: trial.writes, longTasksSupported: supported,
        longTasks: trial.longTasks.filter(task => task.startTime <= trial.twoRafAt).map(task => ({
          ...task, overlapMs: Math.max(0, Math.min(task.startTime + task.duration, trial.twoRafAt) - Math.max(task.startTime, trial.startedAt)),
        })),
        error: trial.error || null,
      };
    },
  };
  function assertIdle() {
    if (active && !active.done) throw new Error('Previous measurement is still armed');
  }
}

function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = p => {
    const position = (sorted.length - 1) * p, lo = Math.floor(position), hi = Math.ceil(position);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (position - lo);
  };
  return { n: values.length, min: sorted[0], median: percentile(.5), p90: percentile(.9),
    p95: percentile(.95), max: sorted.at(-1), mean: values.reduce((a, b) => a + b, 0) / values.length };
}
function summarize(rows) {
  const measured = rows.filter(row => row.phase === 'measured');
  assert.equal(measured.length, measuredPairs * 2);
  assert(measured.every(row => row.status === 'PASS'), 'No statistics from selectively passing samples');
  const metrics = ['clickToLastWriteMs', 'clickToTwoRafMs', 'lastWriteToTwoRafMs', 'nativeSetItemMs', 'longTaskCount', 'longTaskTotalMs', 'longTaskMaxMs'];
  const byVersion = Object.fromEntries(variants.map(v => [v.label, Object.fromEntries(metrics.map(metric => [
    metric, distribution(measured.filter(row => row.label === v.label).map(row => row.metrics[metric])),
  ]))]));
  const pairedDifferencesCurrentMinusBaseline = Object.fromEntries(metrics.map(metric => [metric, distribution(
    Array.from({ length: measuredPairs }, (_, i) => measured.find(r => r.pair === i + 1 && r.label === 'current').metrics[metric]
      - measured.find(r => r.pair === i + 1 && r.label === 'baseline').metrics[metric]),
  )]));
  return { byVersion, pairedDifferencesCurrentMinusBaseline,
    percentileMethod: 'Linear interpolation at (n - 1) * p; all twelve measured values per version retained.' };
}

async function runBrowser() {
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  assert(process.env.CHROMIUM_PATH, 'CHROMIUM_PATH must explicitly identify the tester-provided official Chrome');
  const report = { status: 'RUNNING', startedAtUtc: new Date().toISOString(), protocol, rows: [], errors: [], environments: {} };
  const persist = () => fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await persist();
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    report.browserVersion = browser.version();
    report.browserExecutable = process.env.CHROMIUM_PATH;
    report.playwrightModule = process.env.PLAYWRIGHT_MODULE || 'playwright';
    for (const scheduled of schedule) {
      const variant = variants.find(v => v.label === scheduled.label);
      const row = { ...scheduled, status: 'RUNNING', startedAtUtc: new Date().toISOString() };
      report.rows.push(row);
      await trial(browser, variant, row, report);
      await persist();
      console.log(row.phase + ' ' + row.pair + ' ' + row.label + ': ' + row.status
        + (row.metrics ? ' click→write ' + row.metrics.clickToLastWriteMs.toFixed(3) + ' ms; click→2RAF ' + row.metrics.clickToTwoRafMs.toFixed(3) + ' ms' : ''));
      if (row.status !== 'PASS') {
        report.status = row.status;
        break; // Preserve the failure; do not replace it with a new sample.
      }
    }
    if (report.status === 'RUNNING') {
      assert.equal(report.rows.length, schedule.length);
      assert.deepEqual(report.errors, [], 'Native application/browser errors must be resolved before a passing result');
      report.statistics = summarize(report.rows);
      report.status = 'PASS';
    }
  } catch (error) {
    report.status = 'FAIL';
    report.failure = { message: String(error), stack: error.stack };
  } finally {
    await browser?.close();
    report.browserClosed = true;
    report.finishedAtUtc = new Date().toISOString();
    report.sourcesAfter = Object.fromEntries(await Promise.all(variants.map(async v => [v.label, await sourceSnapshot(v.root)])));
    report.sourceStable = JSON.stringify(report.sourcesAfter) === JSON.stringify(sourcesBefore);
    report.scriptStable = sha(await fs.readFile(scriptPath)) === protocol.scriptSha256;
    if (!report.sourceStable || !report.scriptStable) {
      report.status = 'FAIL';
      report.errors.push({ type: 'source-change', message: 'Measured runtime sources or this QA script changed during the run' });
    }
    await persist();
    await fs.writeFile(path.join(output, 'SUMMARY.md'), summaryMarkdown(report));
  }
  console.log(JSON.stringify({ status: report.status, rows: report.rows.length, measuredRows: report.rows.filter(r => r.phase === 'measured').length,
    browserClosed: report.browserClosed, sourceStable: report.sourceStable, scriptStable: report.scriptStable, output }));
  if (report.status !== 'PASS') process.exitCode = 1;
}

async function trial(browser, variant, row, report) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  let page;
  try {
    await context.route('**/*', route => {
      const u = new URL(route.request().url());
      return ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) ? route.continue() : route.abort();
    });
    await context.addInitScript(installRecorder);
    page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => report.errors.push({ phase: row.phase, pair: row.pair, label: row.label, type: 'pageerror', message: error.message }));
    page.on('console', message => {
      if (message.type() === 'error') report.errors.push({ phase: row.phase, pair: row.pair, label: row.label, type: 'console', message: message.text() });
    });
    await page.goto(variant.url);
    assert((await page.title()).includes('骰'), 'Page identity must be the game title');
    const seeding = await page.evaluate(({ raw, settingsRaw, keys }) => {
      const result = { successfulWrites: [], error: null };
      localStorage.clear(); // This is a new isolated synthetic context.
      try {
        for (const [key, value] of [[keys.settings, settingsRaw], [keys.main, raw], [keys.mirror, raw]]) {
          localStorage.setItem(key, value);
          result.successfulWrites.push({ key, characters: value.length });
        }
      } catch (error) { result.error = { name: error.name, message: error.message }; }
      return result;
    }, { raw: fixture.raw, settingsRaw, keys });
    row.nativeSeeding = seeding;
    if (seeding.error) {
      row.status = seeding.error.name === 'QuotaExceededError' ? 'BLOCKED' : 'FAIL';
      row.error = 'Native storage could not hold the unchanged fixture and both complete copies: ' + JSON.stringify(seeding.error);
      return;
    }
    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    const environment = await page.evaluate(async () => ({
      ua: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency, deviceMemory: navigator.deviceMemory,
      webLocks: !!navigator.locks?.request, longTasksSupported: window.__qaStorageLatency.longTasksSupported,
      originalSetItemIsNative: window.__qaStorageLatency.originalSetItemIsNative,
      visibility: document.visibilityState, quotaEstimate: await navigator.storage.estimate(),
      release: document.querySelector('meta[name="dice-abyss-release"]')?.content,
    }));
    row.environment = environment;
    assert(environment.originalSetItemIsNative, 'The transparent timing wrapper must call the native original setItem');
    assert(environment.webLocks, 'The measured app must use its real Web Locks path');
    assert(environment.longTasksSupported, 'Record native Long Tasks for this protocol');
    assert.equal(environment.visibility, 'visible');
    assert.equal(environment.release, variant.version, 'Page release metadata must exactly match the frozen on-disk package version');
    if (!report.environments[variant.label]) {
      const servedForVariant = servedSourcePaths.filter(file => sourcesBefore[variant.label][file] !== null);
      const servedHashes = await page.evaluate(async files => Object.fromEntries(await Promise.all(files.map(async file => {
        const response = await fetch(new URL(file, location.href), { cache: 'no-store' }), bytes = await response.arrayBuffer();
        if (!response.ok) throw new Error('Unable to verify served source ' + file);
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return [file, { bytes: bytes.byteLength, sha256: [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('') }];
      }))), servedForVariant);
      assert.deepEqual(servedHashes, Object.fromEntries(servedForVariant.map(file => [file, sourcesBefore[variant.label][file]])),
        'The browser must fetch the exact intended frozen servable source');
      // An HTTP metadata assertion outside the timed page flow, avoiding a
      // deliberate browser-console resource error from this denied path.
      const packageStatus = (await context.request.get(new URL('package.json', variant.url).href)).status();
      assert.equal(packageStatus, 404, 'The shipped HTTP allowlist must continue protecting package.json');
      report.environments[variant.label] = { ...environment, servedHashes, httpPackagePathStatus: packageStatus };
    }
    await page.locator('[data-action="continue"]').click();
    await page.locator('.main-nav [data-action="inventory"]').click();
    assert.equal(await page.locator('.inventory-list .item-card').count(), 60);
    const control = page.locator('.inventory-list [data-action="lock"][data-id="' + fixture.targetId + '"]');
    // Center the fixed target during untimed preparation. Nearest scrolling can
    // leave a button at a fractional clipping edge of the real inventory panel.
    await control.evaluate(button => button.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
    row.visibleTarget = await control.evaluate(button => {
      const r = button.getBoundingClientRect(), list = button.closest('.inventory-list').getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { id: button.dataset.id, pressed: button.getAttribute('aria-pressed'), disabled: button.disabled,
        rect: { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
        listRect: { x: list.x, y: list.y, right: list.right, bottom: list.bottom },
        centerHitsButton: hit === button || button.contains(hit),
        fullyVisible: r.width > 0 && r.height > 0 && r.x >= Math.max(0, list.x) && r.y >= Math.max(0, list.y)
          && r.right <= Math.min(innerWidth, list.right) && r.bottom <= Math.min(innerHeight, list.bottom) };
    });
    assert.equal(row.visibleTarget.id, fixture.targetId);
    assert(row.visibleTarget.fullyVisible && row.visibleTarget.centerHitsButton && !row.visibleTarget.disabled,
      'Use an actually visible, hit-testable and enabled native lock button');
    assert.equal(row.visibleTarget.pressed, 'false');
    const read = () => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])));
    const before = await read();
    assert.equal(before[keys.main], fixture.raw);
    assert.equal(before[keys.mirror], fixture.raw);
    assert.equal(before[keys.settings], settingsRaw);
    assert.deepEqual(variant.S.decodeSave(before[keys.main]), fixture.state);
    row.beforeSnapshotSha256 = sha(before);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.evaluate(targetId => window.__qaStorageLatency.arm(targetId), fixture.targetId);
    // Start the observer wait before the native input. Its promise does not run
    // polling callbacks during the app transaction or include driver round trips.
    const completed = page.evaluate(() => window.__qaStorageLatency.wait()).catch(error => ({ error: String(error) }));
    await control.click();
    row.timing = await completed;
    assert.equal(row.timing.isTrusted, true, 'The timing start must be a real trusted click');
    assert.equal(row.timing.visibilityAtClick, 'visible');
    assert.equal(row.timing.error, null);
    const quotaFailure = row.timing.writes.find(write => write.errorName === 'QuotaExceededError');
    if (quotaFailure) {
      row.status = 'BLOCKED';
      row.error = 'The native storage quota rejected an actual timed write; no quota override or replacement sample';
      return;
    }
    assert.deepEqual(row.timing.writes.map(write => ({ key: write.key, ok: write.ok })),
      [{ key: keys.main, ok: true }, { key: keys.mirror, ok: true }], 'Exactly two successful native writes, primary then mirror');
    const after = await read(), expected = variant.E.transition(fixture.state, fixture.action);
    assert.deepEqual(expected, fixture.after);
    assert.deepEqual(variant.S.decodeSave(after[keys.main]), expected, 'The entire committed main state must equal the real transition');
    assert.deepEqual(variant.S.decodeSave(after[keys.mirror]), expected, 'The entire committed mirror state must equal the real transition');
    assert.equal(after[keys.main], fixture.afterRaw);
    assert.equal(after[keys.mirror], after[keys.main]);
    assert.deepEqual(Object.keys(after), Object.keys(before), 'Locking introduces no extra archive or storage keys');
    assert.equal(after[keys.settings], before[keys.settings]);
    assert.equal(await control.getAttribute('aria-pressed'), 'true', 'The real UI must display the committed lock');
    row.afterSnapshotSha256 = sha(after);
    row.afterStateSha256 = sha(expected);
    row.exactTransition = true;
    row.mirrorExact = true;
    row.metrics = {
      clickToLastWriteMs: row.timing.clickToLastWriteMs, clickToTwoRafMs: row.timing.clickToTwoRafMs,
      lastWriteToTwoRafMs: row.timing.lastWriteToTwoRafMs, nativeSetItemMs: row.timing.nativeSetItemMs,
      longTaskCount: row.timing.longTasks.length, longTaskTotalMs: row.timing.longTasks.reduce((n, task) => n + task.duration, 0),
      longTaskMaxMs: Math.max(0, ...row.timing.longTasks.map(task => task.duration)),
    };
    for (const value of Object.values(row.metrics)) assert(Number.isFinite(value) && value >= 0);
    if (row.phase === 'measured' && row.pair === measuredPairs) {
      await page.screenshot({ path: path.join(output, variant.label + '-locked-10000.png') });
      await page.reload();
      await page.locator('[data-action="continue"]').click();
      await page.locator('.main-nav [data-action="inventory"]').click();
      assert.deepEqual(await read(), after, 'The last measured state must survive a real refresh with both exact copies');
      assert.equal(await control.getAttribute('aria-pressed'), 'true');
      row.finalRefreshExact = true;
    }
    row.status = 'PASS';
  } catch (error) {
    row.status = 'FAIL';
    row.error = String(error);
    row.stack = error.stack;
    if (page) await page.screenshot({ path: path.join(output, 'FAIL-' + row.phase + '-' + row.pair + '-' + row.label + '.png') }).catch(() => {});
  } finally {
    row.finishedAtUtc = new Date().toISOString();
    await context.close();
  }
}

function summaryMarkdown(report) {
  const lines = ['# 原生万件背包锁定保存延迟', '', '状态：' + report.status + '。', '',
    '固定同一 10,000 件装备起点和物品 ' + fixture.targetId + '；每版 12 个正式样本，另各 1 次预热。仅预热不计入统计，慢样本全部保留。',
    '运行于同一官方 Chrome 进程、相同默认原生 quota、1920 × 1080、低特效与 reduced motion；一次只保留一个隔离测试页面。', '',
    '时间从可信 click 捕获开始，至最后原生 setItem 返回及写后第二次 RAF。setItem 只加透明计时并原样调用原生实现。结果是 API 提交和界面延迟，不是物理磁盘落盘耗时。',
    '两份完整存档若原生容量不足则 BLOCKED。每个通过样本都要求完整状态严格等于真实 E.transition、主档与镜像逐字节相等；最后一对各执行一次真实刷新续档。', ''];
  if (report.statistics) {
    lines.push('| 指标 | 输入版中位数 / P90 / 最大 | 当前版中位数 / P90 / 最大 |', '|---|---:|---:|');
    for (const [metric, label] of [['clickToLastWriteMs', 'click → 最后写返回（ms）'],
      ['clickToTwoRafMs', 'click → 写后 2 RAF（ms）'], ['nativeSetItemMs', '原生 setItem 合计（ms）'],
      ['longTaskCount', 'Long Task 个数'], ['longTaskTotalMs', 'Long Task 总时长（ms）'], ['longTaskMaxMs', '最长 Long Task（ms）']]) {
      const format = value => [value.median, value.p90, value.max].map(n => n.toFixed(3)).join(' / ');
      lines.push('| ' + label + ' | ' + format(report.statistics.byVersion.baseline[metric]) + ' | ' + format(report.statistics.byVersion.current[metric]) + ' |');
    }
    lines.push('', '全部 24 个正式样本保留，详细单样本、配对差值、原生写入与 Long Task 条目见 report.json。',
      '该路径同时包含状态转换、校验、编码、原生存储及万件背包重绘，不能把全部差异归因于 TextEncoder。此单一固定夹具也不代表自然玩家分布。');
  } else {
    lines.push('没有生成筛选后的性能统计。已尝试的样本、阻塞或失败原因全部保存在 report.json。');
  }
  lines.push('', '源码前后稳定：' + report.sourceStable + '；驱动脚本稳定：' + report.scriptStable + '；Chrome 已关闭：' + report.browserClosed + '。', '');
  return lines.join('\n');
}
