import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';

const url = 'http://127.0.0.1:4188';
const root = fileURLToPath(new URL('../', import.meta.url));
async function probe() {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(800) });
    return (await response.text()).includes('<title>骰狱：无尽深渊 · Dice Abyss</title>') ? 'game' : 'other';
  } catch { return 'closed'; }
}
let status = await probe();
if (status === 'other') { console.error('端口 4188 被其他程序占用。请用自定义 PORT 启动游戏。'); process.exit(1); }
if (status === 'closed') {
  const server = spawn(process.execPath, [fileURLToPath(new URL('./serve.mjs', import.meta.url))], { cwd: root, detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, PORT: '4188' } });
  server.unref();
  for (let i = 0; i < 25; i++) { await setTimeout(100); status = await probe(); if (status === 'game') break; }
}
if (status !== 'game') { console.error('游戏服务未能启动。请运行 npm start 查看原因。'); process.exit(1); }
console.log(`游戏已就绪：${url}`);
if (process.argv.includes('--check')) process.exit(0);
if (process.platform === 'win32') {
  spawn('cmd.exe', ['/c', 'start', '', url], { windowsHide: true, stdio: 'ignore' }).unref();
} else console.log('请在浏览器中打开上面的地址。');
