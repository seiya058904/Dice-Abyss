// Offline audit adapter. The product and original simulate.mjs are untouched.
// Only comparison's read view is compacted; gameplay transitions still receive
// the complete original inventory and execute the original deterministic policy.
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

export async function loadCompactSimulator(projectRoot,{verifyComparisons=256}={}){
 const path=resolve(projectRoot,'scripts/simulate.mjs'),original=await readFile(path,'utf8');
 const sites=original.match(/\bcompareEquipment\(/g)||[];
 if(sites.length!==3)throw Error('The simulator comparison sites changed; review this QA adapter before reuse.');
 if(!Number.isSafeInteger(verifyComparisons)||verifyComparisons<0)throw Error('Invalid comparison verification budget.');
 const sourceHash=createHash('sha256').update(original).digest('hex');
 const source=original.replace(/\bcompareEquipment\(/g,'qaCompareEquipment(').replace(/\bfrom\s+(['"])(\.\.?\/[^'"]+)\1/g,(_,quote,relative)=>`from ${quote}${pathToFileURL(resolve(dirname(path),relative)).href}${quote}`);
 const helper=`
import qaAssert from 'node:assert/strict';
export const QA_COMPARISON_AUDIT={sourceSha256:'${sourceHash}',comparisonSites:3,calls:0,verified:0,viewBuilds:0};
const qaViews=new WeakMap();
function qaCompareEquipment(s,item,requestedSlot){
 QA_COMPARISON_AUDIT.calls++;
 let view=qaViews.get(s);
 if(!view){
  const ids=new Set(equippedIds(s));
  view={...s,player:{...s.player,items:s.player.items.filter(i=>ids.has(i.id))}};
  qaViews.set(s,view);QA_COMPARISON_AUDIT.viewBuilds++;
 }
 const actual=compareEquipment(view,item,requestedSlot);
 if(QA_COMPARISON_AUDIT.verified<${verifyComparisons}){
  qaAssert.deepEqual(actual,compareEquipment(s,item,requestedSlot),'Compact comparison differs from the original full inventory comparison');
  QA_COMPARISON_AUDIT.verified++;
 }
 return actual;
}
`;
 return import('data:text/javascript;base64,'+Buffer.from(source+helper).toString('base64'));
}
