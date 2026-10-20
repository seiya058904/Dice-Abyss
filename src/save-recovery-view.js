// A read-only recovery surface. The full committed game stays in app memory;
// neither the view nor its summaries serialize, mutate or persist that game.
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number=value=>Number(value).toLocaleString('en-US');
const summary=s=>`<p class="save-recovery-run-id"><span>旅途标识</span><code title="${escape(s.runId)}" aria-label="完整旅途标识 ${escape(s.runId)}">${escape(s.runId.length>16?'…'+s.runId.slice(-16):s.runId)}</code></p><dl class="save-recovery-summary"><div><dt>所在层数</dt><dd>第 ${number(s.floor)} 层</dd></div><div><dt>人物等级</dt><dd>Lv.${number(s.player.level)}</dd></div><div><dt>背包装备</dt><dd>${number(s.player.items.length)} 件</dd></div><div><dt>金币</dt><dd>${number(s.player.gold)}</dd></div><div><dt>战斗掷骰</dt><dd>${number(s.counters.rolls)} 次</dd></div><div><dt>已完成操作</dt><dd>${number(s.revision)} 次</dd></div></dl>`;

export function recoveryMessage(snapshot) {
  return snapshot.status==='missing'?'浏览器中的两份存档已缺失，本页仍保留当前进度。请先导出备份，再确认恢复。'
    :snapshot.status==='available'?'浏览器中发现可读取的进度。本页保留的进度仍可导出，请确认后再选择读取。'
      :'浏览器中的存档无法读取，本页仍保留当前进度。原始记录未改动，请先导出备份。';
}

export function saveRecoveryView(memory,snapshot,error='') {
  const available=snapshot.status==='available',missing=snapshot.status==='missing';
  const rawPresent=snapshot.raw&&(snapshot.raw.primary!==null||snapshot.raw.mirror!==null);
  return `<main class="save-recovery" data-save-recovery="${snapshot.status}" aria-labelledby="save-recovery-title"><header class="recovery-header"><span>骰狱 · 无尽深渊</span><span>存档保护</span></header><section class="recovery-content"><h1 id="save-recovery-title" tabindex="-1">${missing?'浏览器存档已缺失':available?'发现另一份已保存进度':'浏览器存档暂时无法读取'}</h1><p class="recovery-intro">${escape(recoveryMessage(snapshot))} 游戏操作已暂停；恢复前请保留此页面。</p><section class="recovery-memory" aria-labelledby="recovery-memory-title"><div class="recovery-section-heading"><h2 id="recovery-memory-title">本页保留的进度</h2><span>完整进度 · 可导出</span></div>${summary(memory)}<p>装备、金币、旅途记录及额外存档数据均保留在这份备份中。关闭或刷新此页会失去尚未恢复的本页副本。</p><button class="primary" data-action="export">导出本页完整备份</button></section>${available?`<section class="recovery-saved" aria-labelledby="recovery-saved-title"><h2 id="recovery-saved-title">浏览器中的进度</h2>${summary(snapshot.state)}<p>${escape(snapshot.warning||'这份进度可以读取。读取前可再次导出本页副本。')}</p></section>`:''}<section class="recovery-next" aria-labelledby="recovery-next-title"><h2 id="recovery-next-title">${missing?'备份后，恢复这段旅途':available?'选择接下来使用的进度':'保留备份，再检查浏览器记录'}</h2><p>${missing?'确认恢复时会再次检查浏览器记录。只有两份存档仍然缺失，才会将本页完整进度保存回浏览器。':available?'读取会替换本页显示的副本，并保留浏览器中已保存的那份进度。请在确认前保存好需要留下的备份。':'当前存在的原始记录会保持不变。可先导出本页完整进度和浏览器原始记录，待存储恢复可用后重新检查。'}</p><div class="recovery-actions">${missing?'<button data-action="recovery-restore">恢复本页进度</button>':available?'<button data-action="recovery-load">读取浏览器进度</button>':''}<button class="quiet" data-action="recovery-check">重新检查</button>${rawPresent?'<button class="quiet" data-action="recovery-export-raw">导出浏览器原始记录</button>':''}</div>${rawPresent?'<small>原始记录文件保留两份存档的原始文本，供检查使用，不能直接作为游戏存档导入。</small>':''}${error&&error!==recoveryMessage(snapshot)?`<p class="recovery-error" role="status">${escape(error)}</p>`:''}</section></section></main>`;
}
