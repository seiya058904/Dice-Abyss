import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, talentPreview } from '../src/engine.js';
import { TALENTS, TALENT_GROUPS } from '../src/content.js';
import { DEEP_TALENTS } from '../src/deep-content.js';
import { center, gameView, talentInspectorView, talentInvestmentCount } from '../src/views.js';

const ui = { view:'talents', busy:false, rolling:false, talentGroup:'high' };
const controls = html => html.match(/<button\b[^>]*data-action="talent"[^>]*>/g) || [];
const control = (html,id) => controls(html).find(markup => markup.includes(`data-id="${id}"`));

test('allocation defaults to one point and presets only change a pure production quote', () => {
  const s=newGame(4401);s.floor=100;s.player.talentPoints=27;s.player.talents.power=3;
  const stateBefore=JSON.stringify(s);
  for(const count of [undefined,1,5,10,'max']) {
    const stateUI={...ui,talentCount:count,talentInspect:'power'},beforeUI=JSON.stringify(stateUI);
    const html=center(s,stateUI),quote=talentPreview(s,'power',talentInvestmentCount(count));
    const amount=talentInvestmentCount(count);
    assert.match(html,new RegExp(`data-action="talent-count" data-count="${amount}" aria-pressed="true"`));
    assert.match(control(html,'power'),new RegExp(`data-count="${amount}" data-talent-preview="power" data-investment="${quote.count}"`));
    assert.match(html,new RegExp(`data-talent-inspected="power" data-preview-count="${quote.count}" data-preview-before="3" data-preview-after="${quote.afterRank}" data-preview-remaining="${quote.remainingPoints}"`));
    assert.equal(JSON.stringify(stateUI),beforeUI,'render does not change preset or focus state');
    assert.equal(JSON.stringify(s),stateBefore,'preview never spends, saves, changes HP, revision or RNG');
  }
  for(const invalid of [undefined,null,0,-1,2,Infinity,NaN,{},'all','undefined']) assert.equal(talentInvestmentCount(invalid),1);
  assert.equal(talentInvestmentCount('5'),5);
  assert.equal(talentInvestmentCount('max'),'max');
});

test('all presets show actual point and rank changes when wallet or the selected node cap is smaller', () => {
  const s=newGame(4402);s.floor=100;s.player.talentPoints=2;s.player.talents.high=4;s.player.talents.power=17;
  for(const count of [5,10,'max']) {
    const html=center(s,{...ui,talentCount:count});
    assert.match(control(html,'high'),/data-investment="1"/);
    assert.match(control(html,'high'),/实际投入 1 点，等级 4 到 5/);
    assert.match(control(html,'power'),/data-investment="2"/);
    assert.match(control(html,'power'),/实际投入 2 点，等级 17 到 19/);
    const detail=talentInspectorView(s,{...ui,talentCount:count},'power');
    assert.match(detail,/实际投入 \+2 点/);assert.match(detail,/data-preview-remaining="0"/);
    if(count==='max')assert.match(detail,/仅投入此节点，其他节点不会变化/);
    else assert.match(detail,new RegExp(`所选 ${count} 点受余额或节点上限限制，本次实际投入 2 点`));
  }
  s.player.talentPoints=100;
  const max=center(s,{...ui,talentCount:'max',talentInspect:'high'});
  assert.match(control(max,'high'),/data-investment="1"/);
  assert.match(control(max,'power'),/data-investment="100"/);
  assert.match(max,/本节点最多/);assert.match(max,/最多仅用于所点击的节点/);
  assert.equal(s.player.talents.high,4);assert.equal(s.player.talents.power,17);assert.equal(s.player.talentPoints,100);
});

test('every selected branch keeps the original nodes, floor gates, caps and busy state', () => {
  const s=newGame(4403);s.player.talentPoints=20;s.player.talents.four=TALENTS.four.cap;
  for(const group of Object.keys(TALENT_GROUPS)) {
    const html=center(s,{...ui,talentGroup:group,talentCount:10});
    const rendered=controls(html),ids=rendered.map(markup=>markup.match(/data-id="([^"]+)"/)[1]);
    assert.equal(rendered.length,33);
    assert.deepEqual(new Set(ids),new Set(Object.keys(TALENTS).filter(id=>!DEEP_TALENTS[id]||TALENTS[id].group===group)));
    for(const id of ids.filter(id=>DEEP_TALENTS[id])) assert.match(control(html,id),/disabled/);
    assert.match(control(html,'four'),/disabled/);assert.match(control(html,'four'),/data-investment="0"/);
    assert(!control(html,'power').includes('disabled'));
  }
  s.floor=80;
  assert(controls(center(s,{...ui,busy:true,talentCount:'max'})).every(markup=>markup.includes('disabled')));
  s.player.talentPoints=0;
  assert(controls(center(s,{...ui,talentCount:10})).every(markup=>markup.includes('disabled')));
  assert.match(talentInspectorView(s,ui,'power'),/暂无可用天赋点/);
  assert.match(talentInspectorView(s,ui,'four'),/本节点已满/);
});

test('power, treasure and conditional deep benefits keep threshold numbers unchanged', () => {
  const s=newGame(4404);s.floor=100;s.player.talentPoints=100;
  s.player.talents.power=2;s.player.talents.fortune=2;s.player.talents.finality=1;s.player.talents.lastResolve=1;s.player.talents.diversity=1;
  const bulk={...ui,talentCount:10};
  const power=talentInspectorView(s,bulk,'power');
  assert.match(power,/全部伤害 \+6%/);assert.match(power,/全部伤害 \+36%/);
  const fortune=talentInspectorView(s,bulk,'fortune');
  assert.match(fortune,/所有宝箱金币 \+20%/);assert.match(fortune,/所有宝箱金币 \+50%/);
  const finality=talentInspectorView(s,bulk,'finality');
  assert.match(finality,/≤35%/);assert.match(finality,/\+10%/);assert.match(finality,/\+30%/);assert(!finality.includes('≤105%'));
  const resolve=talentInspectorView(s,bulk,'lastResolve');
  assert.match(resolve,/&lt;35%/);assert.match(resolve,/-6%/);assert.match(resolve,/-18%/);assert(!resolve.includes('105%'));
  const diversity=talentInspectorView(s,bulk,'diversity');
  assert.match(diversity,/至少 4 种不同骰面/);assert.match(diversity,/\+8%/);assert.match(diversity,/\+24%/);assert(!diversity.includes('至少 12 种'));
  const vitality=talentInspectorView(s,bulk,'vitality');
  assert.match(vitality,/最大生命 \+0%/);assert.match(vitality,/最大生命 \+50%/);assert.match(vitality,/仅增加生命上限，当前生命不恢复/);
  const four=talentInspectorView(s,bulk,'four');
  assert.match(four,/每颗 4 点/);assert.match(four,/点数贡献 \+75%/);assert(!four.includes('每颗 20 点'));
});

test('talent layout supplies a stable scroll region, accessible preview, and five compact branch controls', () => {
  const s=newGame(4405);s.player.talentPoints=10;
  const html=gameView(s,{...ui,talentCount:5});
  assert.match(html,/id="talent-scroll" class="talent-scroll" tabindex="-1"/);
  assert.match(html,/id="talent-preview"[^>]+aria-live="polite"[^>]+aria-atomic="true"/);
  assert.match(html,/data-talent-points>10</);
  assert.match(html,/role="group" aria-labelledby="talent-count-label"/);
  const branchNavigation=html.split('<nav class="talent-branch-nav"')[1].split('</nav>')[0];
  assert.equal((branchNavigation.match(/data-action="talent-group"/g)||[]).length,5);
  assert.match(html,/left-rail build-rail/);assert.match(html,/right-rail frame build-details/);
  assert(!html.includes('undefined'));assert(!html.includes('NaN'));
});
