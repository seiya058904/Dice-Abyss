import {itemStats,itemValue} from './equipment.js';

// Search is a transient view choice. It never changes the owned item array,
// its order, a transaction's targets, or a saved field.
export const inventoryQuery = value => typeof value === 'string' ? value.trim() : '';
export const INVENTORY_DEFENSE_FILTERS = Object.freeze([
  Object.freeze({key:'regen',label:'存活恢复'}),
  Object.freeze({key:'barrier',label:'开战护盾'}),
  Object.freeze({key:'reduction',label:'基础减伤'}),
]);
export const inventoryDefense = value => INVENTORY_DEFENSE_FILTERS.some(filter => filter.key === value) ? value : '';

export function selectInventoryItems(items, ui = {}) {
  const query = inventoryQuery(ui.inventoryQuery).toLowerCase(), defense = inventoryDefense(ui.inventoryDefense);
  const selected = items.filter(item => (!ui.inventorySlot || item.slot === ui.inventorySlot)
    && (ui.inventoryRarity == null || ui.inventoryRarity === '' || item.rarity === Number(ui.inventoryRarity))
    && (!query || item.name.toLowerCase().includes(query))
    // itemStats preserves legacy effects and is only read for remaining matches.
    // A trait's presence does not promise an uncapped gain in the current build.
    && (!defense || itemStats(item)[defense] > 0));
  // Empty/single-result sorts did not need an equipment value before. For a
  // larger result, derive each needed power key at most once within this call.
  // Rarity/level sorts only need power when their primary keys tie. No cache or
  // decorated object escapes into the saved inventory; stable ties (including
  // NaN comparator results) keep their existing acquisition order.
  if (selected.length < 2) return selected.toSorted(() => 0);
  const rarity = ui.inventorySort === 'rarity', level = ui.inventorySort === 'level';
  if (rarity || level) {
    // Do not allocate a decorated record for every item when primary keys alone
    // can decide the order. Only an actual tie needs this call-local value map.
    const powers = new Map();
    const power = item => {
      let value = powers.get(item);
      if (value === undefined) { value = itemValue(item); powers.set(item, value); }
      return value;
    };
    return selected.toSorted(rarity
      ? (a, b) => b.rarity - a.rarity || power(b) - power(a)
      : (a, b) => b.level - a.level || power(b) - power(a));
  }
  return selected.map(item => ({item, power:itemValue(item)}))
    .sort((a, b) => b.power - a.power)
    .map(entry => entry.item);
}
