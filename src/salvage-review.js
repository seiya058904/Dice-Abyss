import {salvagePreview} from './engine.js';

// A review belongs to one exact in-memory snapshot. Only the final explicit
// IDs reach the engine, which independently checks ownership and protection.
export function createSalvageReview(state) {
  const quote=salvagePreview(state,undefined,false,true);
  return quote?{kind:'salvage',state,items:quote.items,selected:new Set(quote.items.map(item=>item.id)),page:0}:null;
}

export function salvageReviewQuote(review,state) {
  if(!review||review.kind!=='salvage'||review.state!==state)return null;
  const ids=review.items.filter(item=>review.selected.has(item.id)).map(item=>item.id);
  if(!ids.length)return {ids,items:[],gold:0,rawGold:0,overflow:0};
  const quote=salvagePreview(state,ids,false,true);
  return quote?{...quote,ids}:null;
}
