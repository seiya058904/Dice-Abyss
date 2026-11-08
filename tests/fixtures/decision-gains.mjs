import {newGame,stats} from '../../src/engine.js';
import {CATALOG_BY_ID} from '../../src/equipment-content.js';

export function fixtureItem(catalogId,id,level=10) {
 const entry=CATALOG_BY_ID.get(catalogId);
 if(!entry)throw Error(catalogId);
 return {id,catalogId,slot:entry.slot,rarity:entry.rarity,profile:entry.profile,theme:entry.theme,name:entry.name,level,levelXp:0,enhance:0,depth:10,locked:false};
}
export function healthFixture() {
 const s=newGame(8181);s.runId='synthetic-decision-health';
 s.player.items=[fixtureItem('weapon-0-0-0','i1'),fixtureItem('armor-0-0-0','i2'),fixtureItem('relic-0-0-0','i3'),fixtureItem('armor-0-2-0','i4')];
 s.nextId=5;s.player.hp=stats(s).maxHp;s.extra={kept:['supported unknown data']};
 return s;
}
export function talentFixture(mode='capped') {
 const s=healthFixture();s.runId='synthetic-decision-talent';s.floor=10;s.player.level=11;s.player.talentPoints=20;
 if(mode!=='normal') {
  s.player.items.push(fixtureItem('v4-relic-0-3-3','i5'));s.player.equipped.relic2='i5';s.nextId=6;
  if(mode==='capped'){s.player.items.push(fixtureItem('v4-relic-0-3-3','i6'));s.player.equipped.relic3='i6';s.nextId=7;}
  else {s.player.talents.luck=5;s.player.talents.attune=4;}
 }
 s.player.hp=stats(s).maxHp;return s;
}
