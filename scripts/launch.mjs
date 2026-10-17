import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout } from 'node:timers/promises';

const url = 'http://127.0.0.1:4188';
const root = fileURLToPath(new URL('../', import.meta.url));
export const CURRENT_RELEASE = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;

// The save/build major stays at 5. A detached V5.0 server must not be mistaken
// for a newly extracted V5.1 release that happens to use the same title and port.
export function classifyServerHtml(html, release = CURRENT_RELEASE) {
  if (typeof release !== 'string' || !release) return 'other';
  const source = String(html).replace(/<!--[\s\S]*?-->/g, '');
  const meta = name => {
    const values = [];
    for (const tag of source.match(/<meta\b[^>]*>/gi) || []) {
      const attributes = Object.fromEntries([...tag.matchAll(/\s(name|content)\s*=\s*(["'])(.*?)\2/gi)]
        .map(([, key, , value]) => [key.toLowerCase(), value]));
      if (attributes.name?.toLowerCase() === name) values.push(attributes.content);
    }
    return values.length === 1 ? values[0] : null;
  };
  return source.includes('<title>骰狱：无尽深渊 · Dice Abyss</title>') &&
    meta('dice-abyss-build') === '5' && meta('dice-abyss-release') === release ? 'game' : 'other';
}

async function probe() {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(800) });
    return response.ok ? classifyServerHtml(await response.text()) : 'other';
  } catch { return 'closed'; }
}

async function main() {
  let status = await probe();
  if (status === 'other') { console.error(`端口 4188 的服务不是当前 ${CURRENT_RELEASE} 版本。请先关闭旧本地服务，再双击当前目录的启动脚本；也可用自定义 PORT 运行 npm start。更换端口后需在设置中导入存档。`); process.exit(1); }
  if (status === 'closed') {
    const server = spawn(process.execPath, [fileURLToPath(new URL('./serve.mjs', import.meta.url))], { cwd: root, detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, PORT: '4188' } });
    server.unref();
    for (let i = 0; i < 25; i++) { await setTimeout(100); status = await probe(); if (status === 'game') break; }
  }
  if (status !== 'game') { console.error('游戏服务未能启动。请运行 npm start 查看原因。'); process.exit(1); }
  console.log(`Dice Abyss ${CURRENT_RELEASE} 已就绪：${url}`);
  if (process.argv.includes('--check')) process.exit(0);
  if (process.platform === 'win32') {
    spawn('cmd.exe', ['/c', 'start', '', url], { windowsHide: true, stdio: 'ignore' }).unref();
  } else console.log('请在浏览器中打开上面的地址。');
}

// Importing the identity classifier for QA must not start a server or browser.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
