// Read-only full build overview. Reads committed state only; never advances
// RNG, changes equipment, or invents a universal combat score.
import { stats, diceOdds, diceCount, talent, combatCriticalChance, combatFollowChance } from './engine.js';
import { ABILITY_DEFS } from './deep-content.js';
import { DICE_LEVELS } from './content.js';

const minimumDice = {
  pairBonus: 2, sumBonus: 3, distinctStrike: 4, tripleEcho: 3,
  pairFollow: 2, criticalFollow: 2, echoChance: 2, pairWard: 2,
  lowWard: 2, resonanceMend: 4, gildedSix: 2,
};

function diceHint(key, count) {
  const required = minimumDice[key] || 1;
  if (count >= required) return '';
  return `当前仅 ${count} 颗战斗骰，第 ${required} 颗在 Lv.${DICE_LEVELS[required - 1]} 解锁`;
}

export function buildSummary(s) {
  const st = stats(s), odds = diceOdds(s), count = diceCount(s);
  const row = (key, label, value, unit = 'percent', { cap = null, note = '' } = {}) => ({
    key, label, value, unit, cap,
    capped: cap !== null && value >= cap - 1e-10,
    note: [note, diceHint(key, count)].filter(Boolean).join(' · '),
  });

  const critPlain = combatCriticalChance(s, st, false);
  const critSix = combatCriticalChance(s, st, true);
  const followPlain = combatFollowChance(s, st, false, false);
  const followPair = combatFollowChance(s, st, true, false);
  const followCritPair = combatFollowChance(s, st, true, true);
  const critMult = 1.8 + talent(s, 'crush') * .1 + st.critDamage;
  const followMult = .35 + talent(s, 'pursuit') * .08 + st.followDamage;
  const resonanceBonus = talent(s, 'resonance') * .12;
  const killHeal = .16 + talent(s, 'recovery') * .03 + st.healBonus;
  const goldBonus = talent(s, 'fortune') * .1 + st.goldBonus;

  const core = [
    row('attack', '攻击强度', st.attack, 'integer'),
    row('maxHp', '生命上限', st.maxHp, 'integer', { note: `当前生命 ${s.player.hp}` }),
    row('defense', '防御', st.defense, 'integer'),
    row('dice', '战斗骰', count, 'integer', { cap: 6, note: count < 6 ? `下一颗 Lv.${DICE_LEVELS[count]} 解锁` : '六骰已齐' }),
    row('luck', '有效幸运', st.luck, 'integer', {
      cap: 200,
      note: st.luckOverflow ? `投入 ${st.rawLuck}，溢出提供 +${Math.round(Math.min(.5, st.luckOverflow * .002) * 100)}% 宝箱金币` : '100 以后软增长至 200',
    }),
    row('highChance', '单骰 5 / 6 点概率', odds.highChance, 'percent'),
    row('echoChance', '后续骰同点引导率', odds.echoChance, 'percent', { cap: .25, note: '从第 2 颗骰起生效' }),
  ];

  const offense = [
    row('crit', critSix > critPlain + 1e-10 ? '实际暴击率（未出 6）' : '实际暴击率', critPlain, 'percent', { cap: .9 }),
    ...(critSix > critPlain + 1e-10 ? [row('sixCrit', '含 6 暴击率', critSix, 'percent', { cap: .9 })] : []),
    row('critMult', '暴击主击倍率', critMult, 'multiplier'),
    row('follow', '基础追击率', followPlain, 'percent', { cap: .85 }),
    ...(followPair > followPlain + 1e-10 ? [row('pairFollow', '共鸣追击率', followPair, 'percent', { cap: .85 })] : []),
    ...(followCritPair > followPair + 1e-10 ? [row('criticalFollow', '共鸣暴击追击率', followCritPair, 'percent', { cap: .85 })] : []),
    row('followMult', '追击追加主击', followMult, 'percent'),
    row('pierce', '基础穿盾', st.pierce, 'percent', { cap: .7 }),
    ...(st.sixShatter > 0 ? [row('sixPierce', '含 6 穿盾合计', Math.min(1, st.pierce + st.sixShatter), 'percent', { cap: 1, note: '出现 6 时生效' })] : []),
    ...(resonanceBonus > 0 ? [row('resonance', '天赋共鸣增幅', resonanceBonus, 'multiplier', { note: '叠加到双同及以上倍率' })] : []),
  ];

  const defense = [
    row('reduction', '基础减伤', st.reduction, 'percent', { cap: .65 }),
    row('dodge', '闪避率', st.dodge, 'percent', { cap: .35 }),
    row('barrier', '开战护盾', st.barrier, 'maxHp', { cap: .75 }),
    row('regen', '存活回合恢复', st.regen, 'maxHp', { cap: .12 }),
    row('pairWard', '共鸣护盾', st.pairWard, 'maxHp', { cap: .2 }),
    row('killHeal', '击杀恢复', killHeal, 'maxHp'),
    ...(talent(s, 'leech') > 0 ? [row('leech', '暴击恢复', talent(s, 'leech') * .01, 'maxHp', { note: '暴击且存活时触发' })] : []),
  ];

  const deep = [
    row('goldBonus', '新宝箱金币加成', goldBonus, 'percent', { note: '含天赋、装备与幸运溢出' }),
  ];
  const tripleEcho = Math.min(1.4, (st.tripleStrike || 0) + (st.echoRelic || 0));
  if (tripleEcho > 0) deep.push(row('tripleEcho', '三同追加主击', tripleEcho, 'percent', { cap: 1.4, note: '不递归、不再暴击或追击' }));
  for (const [key, def] of Object.entries(ABILITY_DEFS)) {
    if (key === 'sixShatter' || key === 'tripleStrike' || key === 'echoRelic') continue;
    if (!(st[key] > 0)) continue;
    const unit = def.kind === 'luck' ? 'integer' : def.kind === 'ward' || def.kind === 'heal' ? 'maxHp' : def.kind === 'guard' ? 'reduction' : 'percent';
    deep.push(row(key, def.text, st[key], unit, { cap: def.cap }));
  }

  return {
    floor: s.floor,
    level: s.player.level,
    diceCount: count,
    groups: [
      { key: 'core', title: '核心与骰率', rows: core },
      { key: 'offense', title: '输出与穿盾', rows: offense },
      { key: 'defense', title: '生存与恢复', rows: defense },
      { key: 'deep', title: '深层能力与收益', rows: deep },
    ],
  };
}
