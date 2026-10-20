// One bounded, read-only quote for the existing single gold balance. Reward
// amounts, prices and RNG stay with their original producers.
export const GOLD_CAP = 1e10;
export function goldPreview(held,rawGold) {
 if(!Number.isSafeInteger(held)||held<0||held>GOLD_CAP||!Number.isSafeInteger(rawGold)||rawGold<0)return null;
 const credited=Math.min(rawGold,GOLD_CAP-held);
 return {rawGold,credited,overflow:rawGold-credited,before:held,after:held+credited};
}

// A completed chest stays identical to its original pending reward, including
// unknown metadata. The caller supplies the separate state.lootCreditedGold.
// Legacy saves have no receipt: neither reward metadata nor today's balance
// can establish how much was credited by a past open action.
export function goldReceipt(reward,creditedGold) {
 if(!reward||!Number.isSafeInteger(reward.gold)||reward.gold<0||!Number.isSafeInteger(creditedGold)||creditedGold<0||creditedGold>Math.min(reward.gold,GOLD_CAP))return null;
 return {rawGold:reward.gold,credited:creditedGold,overflow:reward.gold-creditedGold};
}

export function goldSummary(receipt,format=String,label='金币实收') {
 if(!receipt)return '';
 return `${label} ${format(receipt.credited)}${receipt.overflow?`（原额 ${format(receipt.rawGold)}，上限截去 ${format(receipt.overflow)}）`:''}`;
}
