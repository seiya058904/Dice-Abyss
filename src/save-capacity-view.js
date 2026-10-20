// On-demand file-size feedback. This view neither reads browser storage nor
// serializes a save; the Settings action supplies one freshly measured result.
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const integer = value => Number(value).toLocaleString('en-US');

export function saveCapacityView(capacity) {
  const {bytes, limitBytes, remainingBytes, excessBytes, status} = capacity;
  const labels = {'ok':'文件大小正常','near-limit':'接近文件上限','at-limit':'已到文件上限','over-limit':'超过文件上限'};
  const guidance = status === 'ok'
    ? '可定期导出备份；获得装备和新的记录会继续占用空间。'
    : status === 'near-limit'
      ? '建议现在导出完整备份，再按需要回收或融合闲置装备，为后续进度留出空间。'
      : status === 'at-limit'
        ? '已没有增长余量。请先导出完整备份；回收或融合后的存档仍须通过保存校验。'
        : '此进度仍可导出完整备份。后续操作只有在保存结果回到上限以内时才能提交；不会自动删除装备或额外记录。';
  return `<div class="capacity-reading ${escape(status)}" data-capacity-status="${escape(status)}"><div class="capacity-heading"><strong>${labels[status]}</strong><span>${(bytes / limitBytes * 100).toFixed(1)}%</span></div><meter min="0" max="${limitBytes}" low="0" high="${limitBytes * .9}" optimum="0" value="${Math.min(bytes, limitBytes)}" aria-label="存档文件大小" aria-valuetext="${integer(bytes)} 字节，上限 ${integer(limitBytes)} 字节"></meter><p class="capacity-exact"><b>${integer(bytes)}</b> / ${integer(limitBytes)} 字节<br>${excessBytes ? `超出 ${integer(excessBytes)} 字节` : `文件余量 ${integer(remainingBytes)} 字节`}</p><p>${guidance}</p><small>这是当前进度的文件大小，不是浏览器剩余空间；主档、镜像和旧版归档还受浏览器配额限制。检查不会写入存档。</small></div>`;
}
