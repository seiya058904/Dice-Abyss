// Capacity is applied before stored experience is converted into levels.
// This quote is read-only: acceptedXp is that intermediate balance, never the
// final XP counter after level-ups. Reward formulas stay with their producers.
export const XP_CAP = 1e8;
export const LEVEL_CAP = 1e6;
export function xpPreview(held,rawXp) {
 if(!Number.isSafeInteger(held)||held<0||held>XP_CAP||!Number.isSafeInteger(rawXp)||rawXp<0)return null;
 const creditedXp=Math.min(rawXp,XP_CAP-held),overflowXp=rawXp-creditedXp;
 return {rawXp,creditedXp,overflowXp,beforeXp:held,acceptedXp:held+creditedXp,atCap:held===XP_CAP,limited:overflowXp>0};
}
export function xpSummary(quote,format=String,label='经验计入') {
 if(!quote)return '';
 return `${label} ${format(quote.creditedXp)}${quote.overflowXp?`（原额 ${format(quote.rawXp)}，上限未计入 ${format(quote.overflowXp)}）`:''}`;
}
