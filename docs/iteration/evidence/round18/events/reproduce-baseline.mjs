import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve,dirname} from 'node:path';

const root=resolve(process.argv[2]),output=resolve(process.argv[3]);
const at=file=>new URL(file,pathToFileURL(root+'/'));
const E=await import(at('src/engine.js'));
const S=await import(at('src/storage.js'));
const C=await import(at('src/encounters.js'));
const {eventFixture}=await import(at('scripts/audit-event-context.mjs'));
let state;
for(let seed=17017;seed<17317;seed++){
 const candidate=eventFixture({E,S},'mystery',{seed,floor:140,rich:true});
 if(candidate.event.key==='silent_anvil'){state=candidate;break;}
}
assert(state,'seeded existing event entry must reach silent_anvil');
const registeredTarget=state.player.items.find(item=>item.id===state.event.targetId);
registeredTarget.enhance=5;
const replacement=E.makeItem(state,'weapon',0);state.player.items.push(replacement);
state=E.transition(state,{type:'equip',id:replacement.id});
state.event.offerId=registeredTarget.id;
state.event.auditUnknown={keep:'原始矛盾引用，不猜替代目标',id:registeredTarget.id};
state.externalAudit={keep:['原串','unknown','RNG','revision']};
const snapshot=structuredClone(state),raw=S.encodeSave(state),decoded=S.decodeSave(raw);
const choice=C.eventChoices(decoded).find(option=>option.id==='accept');
const after=E.transition(decoded,{type:'event-choice',id:'accept',confirmed:true});
const result={source:root,scope:'Constructed import boundary; the real entry generated distinct IDs before the imported offer ID was deliberately made contradictory.',
 baselineAccepted:S.validateSave(state),decodedAccepted:S.validateSave(decoded),offerId:state.event.offerId,targetId:state.event.targetId,
 choiceDisabled:choice.disabled,transitionCommitted:after!==decoded,targetSurvives:after.player.items.some(item=>item.id===state.event.targetId),
 beforeIds:state.player.items.map(item=>item.id),afterIds:after.player.items.map(item=>item.id),
 beforeRng:state.rng,afterRng:after.rng,beforeRevision:state.revision,afterRevision:after.revision,
 beforeGold:state.player.gold,afterGold:after.player.gold,postStateAccepted:S.validateSave(after),inputUntouched:JSON.stringify(state)===JSON.stringify(snapshot)};
await writeFile(output,JSON.stringify({result,before:state,after},null,2)+'\n');
await writeFile(resolve(dirname(output),'contradictory-import-original.json'),raw+'\n');
console.log(JSON.stringify(result,null,2));
assert.strictEqual(after,decoded,'contradictory imported anvil payment must be a lossless rejected action');
