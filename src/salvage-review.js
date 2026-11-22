import {salvagePreview,equippedIds,itemValue} from './engine.js';
import {SLOTS,EQUIP_SLOTS} from './content.js';

// A review belongs to one exact in-memory snapshot. Only the final explicit
// IDs reach the engine, which independently checks ownership and protection.
export function createSalvageReview(state, {maxRarity=1} = {}) {
  const cap = maxRarity === 2 ? 2 : 1;
  let quote;
  if (cap === 1) {
    quote = salvagePreview(state,undefined,false,true);
  } else {
    const equipped = new Set(equippedIds(state)), protectedId = state.loot?.item?.id;
    const weakest = slot => Math.min(...Object.keys(EQUIP_SLOTS)
      .filter(key => key === slot || (slot === 'relic' && key.startsWith('relic')))
      .map(key => itemValue(state.player.items.find(i => i.id === state.player.equipped[key]))));
    const thresholds = Object.fromEntries(Object.keys(SLOTS).map(slot => [slot, weakest(slot)]));
    const ids = state.player.items
      .filter(item => item && !equipped.has(item.id) && !item.locked && item.rarity <= 2 && item.id !== protectedId && itemValue(item) < thresholds[item.slot])
      .map(item => item.id);
    quote = ids.length ? salvagePreview(state,ids,false,true) : null;
  }
  return quote?{kind:'salvage',state,maxRarity:cap,items:quote.items,selected:new Set(quote.items.map(item=>item.id)),page:0}:null;
}

export function salvageReviewQuote(review,state) {
  if(!review||review.kind!=='salvage'||review.state!==state)return null;
  const ids=review.items.filter(item=>review.selected.has(item.id)).map(item=>item.id);
  if(!ids.length)return {ids,items:[],gold:0,rawGold:0,overflow:0};
  const quote=salvagePreview(state,ids,false,true);
  return quote?{...quote,ids}:null;
}
