import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const baselineRoot=process.argv[2],currentRoot=process.argv[3];
if(!baselineRoot||!currentRoot)throw Error('Usage: node scripts/audit-inventory-builds.mjs INPUT_ROOT CURRENT_ROOT [OUTPUT_JSON]');
const baselineFile=p=>pathToFileURL(resolve(baselineRoot,p));
const currentFile=p=>pathToFileURL(resolve(currentRoot,p));

const E=await import(currentFile('src/engine.js')),{TALENTS}=await import(currentFile('src/content.js')),V=await import(currentFile('src/views.js')),BV=await import(baselineFile('src/views.js')),{validateSave}=await import(currentFile('src/storage.js'));

let builds=0,cardsCompared=0,pages=0;
for(const relics of [1,2,3])for(const mode of [0,1,2,3]){
 const s=E.newGame(7123+relics*97+mode);s.floor=200;s.player.level=80;s.fate=[6,6];s.phase='route';
 s.route=['combat','combat','rest','combat','gold','boss'].map((type,i)=>({id:`f200r${i}`,type,done:false,quality:0}));
 while(s.player.items.length<90){const i=s.player.items.length,item=E.makeItem(s,['weapon','armor','relic'][i%3],i%8);item.enhance=i%21;item.locked=i%7===0;if(mode===3&&item.rarity<4)item.legacy=true;s.player.items.push(item);}
 for(const slot of ['weapon','armor'])s.player.equipped[slot]=s.player.items.toReversed().find(item=>item.slot===slot).id;
 const ownedRelics=s.player.items.toReversed().filter(item=>item.slot==='relic');
 for(const [i,key]of ['relic','relic2','relic3'].entries())s.player.equipped[key]=i<relics?ownedRelics[i].id:null;
 if(mode){for(const [i,[key,talent]]of Object.entries(TALENTS).entries())s.player.talents[key]=mode===2?talent.cap:Math.min(talent.cap,(i+mode)%4);s.nextLuck=24;s.eventLuck=20;s.eventPower=30;s.player.fateBlessings=5;s.player.pactScars=4;s.v5Boons={echo:1,ward:1};}
 s.player.hp=E.stats(s).maxHp;assert(validateSave(s));const before=JSON.stringify(s);builds++;
 for(const inventorySort of ['power','level','rarity']){
  const ui={view:'inventory',inventorySort,inventoryPage:0,busy:false};
  const current=V.center(s,ui),baseline=BV.center(s,ui),cards=html=>html.match(/<article\b[\s\S]*?<\/article>/g)||[];
  assert.deepEqual(cards(current),cards(baseline),`full card equality: ${relics} relics / mode ${mode} / ${inventorySort}`);
  for(const card of cards(current)){const id=card.match(/data-action="equip" data-id="([^"]+)"/)?.[1],item=s.player.items.find(item=>item.id===id);assert(item);assert(card.includes(V.comparison(s,item)));cardsCompared++;}
  pages++;
 }
 assert.equal(JSON.stringify(s),before);
}
const result={method:'read-only independent build comparison matrix',builds,pages,cardsCompared,includes:['one/two/three equipped relics','all eight equipment rarities','reinforcement and locked items','original legacy effects','all talent nodes at varied and maximum ranks','nextLuck/eventLuck/eventPower/fateBlessings/pactScars/double fate/v5Boons'],equal:true,mutation:false};
if(process.argv[4])writeFileSync(resolve(process.argv[4]),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
