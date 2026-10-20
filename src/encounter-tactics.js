import {deepEnemyAttack} from './deep-rules.js';
import {deepVariantProfile} from './deep-content.js';

// Read the public, pre-roll encounter only. This is a turn guide, never a dice
// forecast: it does not receive a state RNG, draw faces, or change a combat rule.
// Numeric effects remain auditable against the authoritative encounter helpers.
export function encounterTactics(enemy,count) {
 if(!enemy||enemy.hp<=0||![4,5].includes(enemy.combatRules)||!Number.isInteger(count)||count<1||count>6)return null;
 const e=enemy,turn=e.turns+1,lines=[],majority=Math.floor(count/2)+1,variant=deepVariantProfile(e);
 let note='',next='',stage=null,wave=null,remaining=null;
 const line=(condition,effect,requirement={kind:'always'},effects={},possible=true)=>lines.push({condition,effect,requirement,effects,possible});
 const distinct=n=>({kind:'distinctAtLeast',value:n});
 const same=n=>({kind:'sameAtLeast',value:n});
 const sumAtLeast=n=>({kind:'sumAtLeast',value:n});
 const sumAtMost=n=>({kind:'sumAtMost',value:n});
 const hasSix={kind:'hasFace',value:6};
 const hpLimit='敌方回血、补盾不超过上限；击破可阻止。';
 const phaseNote='弱点按出手前阶段判定；本击跨入半血仍用当前阶段规则。';
 switch(e.mechanic){
  case 'bandit':{
   // Damage ends after two rolls for both identities. The gold deadline is
   // three rolls for the first identity, two for the alternate; do not merge
   // these windows. Reward helpers receive the completed roll count.
   const alternate=e.variant===1,damageLeft=Math.max(0,2-e.turns),goldFactor=alternate?3:2;
   remaining=Math.max(0,(alternate?2:3)-e.turns);
   line(damageLeft?`先手增伤还剩 ${damageLeft} 掷`:'先手增伤已结束',damageLeft?`本击伤害 +${alternate?15:25}%`:'本击无先手增伤',{kind:'always'},{damageMultiplier:damageLeft?(alternate?1.15:1.25):1});
   line(remaining?`夺金窗口还剩 ${remaining} 掷`:'夺金窗口已结束',remaining?`本掷击破时金币 ×${goldFactor}`:'金币恢复原倍率；击破仍有宝箱',{kind:'always'},{goldMultiplier:remaining?goldFactor:1});
   note=alternate?'前两掷都有 15% 先手增伤；前两掷内击破获得三倍金币。':'前两掷有 25% 先手增伤；前三掷内击破获得双倍金币。第三掷只保留金币奖励。';
   note+='剩余掷数包含当前这一掷；金币在击破后按原规则结算，不改变宝箱品质。';
   next=remaining===1?`这是获得${alternate?'三倍':'双倍'}金币的最后一掷。`:!remaining?'窗口已过，击破仍有正常战利品。':damageLeft===1?'下一掷先手增伤结束；仍可争取双倍金币。':`下一掷仍有先手增伤与${alternate?'三倍':'双倍'}金币机会。`;
   break;
  }
  case 'boss_sixseal':
   stage=e.stage===2?2:1;
   line('出现 6 点','本击伤害 +25%；免除六封的反击增幅',hasSix,{damageMultiplier:1.25,attackMultiplier:1});
   line('没有 6 点','本次反击 +15%',{kind:'lacksFace',value:6},{attackMultiplier:1.15});
   next='下一掷仍以出现 6 点破封。';break;
  case 'boss_choir':
   stage=e.stage===2?2:1;
   line('双同或更高共鸣','本次反击 -20%',same(2),{attackMultiplier:.8},count>=2);
   line('所有点数各不相同','本次反击 +15%',{kind:'allDistinct'},{attackMultiplier:1.15});
   next='下一掷仍以双同或更高共鸣压制反击。';break;
  case 'boss_tide':
   stage=e.stage===2?2:1;
   if(turn%2){
    line('当前为奇数回合','本次反击后不触发归潮回血',{kind:'always'},{preventsHeal:true});
    next='下一掷为偶数回合：总点至少 18 阻止回血；按最大生命 3% 向上取整，受缺失生命限制。';
   }else{
    line('总点数至少 18','阻止本次归潮回血',sumAtLeast(18),{preventsHeal:true},count*6>=18);
    line('总点数不超过 17','存活反击后，按最大生命 3% 向上取整回血，受缺失生命限制',sumAtMost(17),{enemyHealFraction:.03});
    next='下一掷为奇数回合：不触发归潮回血。';
   }
   note='回血量先按最大生命的 3% 向上取整，再受反击结算时的缺失生命限制；击破可阻止。'+(e.hp===e.maxHp?'当前敌方满血，本击受伤后仍可能有回血空间。':'');break;
  case 'boss_cinder':{
   stage=e.stage===2?2:1;const even=turn%2===0;
   line(even?'当前为偶数回合':'当前为奇数回合',even?'本次反击 +30%':'本次反击无熔棱增幅',{kind:'always'},{baseAttackMultiplier:even?1.3:1});
   line('至少 3 颗 4 / 5 / 6 点','本击额外穿盾 50%',{kind:'highAtLeast',value:3,minFace:4},{shieldPierce:.5},count>=3);
   note='回合增幅已计入反击预告；半血后的阶段增幅会继续叠加。';
   next=even?'下一掷为奇数回合：无熔棱反击增幅，穿盾条件不变。':'下一掷为偶数回合：反击 +30%，穿盾条件不变。';break;
  }
  case 'boss_hourglass':
   stage=e.stage===2?2:1;
   if(turn%2){
    line('当前为奇数回合','本次反击 +25%',{kind:'always'},{baseAttackMultiplier:1.25,damageMultiplier:1});
    next='下一掷为偶数回合：本击伤害 +25%，无倒沙反击增幅。';
   }else{
    line('当前为偶数回合','本击伤害 +25%；无倒沙反击增幅',{kind:'always'},{damageMultiplier:1.25,baseAttackMultiplier:1});
    next='下一掷为奇数回合：反击 +25%。';
   }
   note='首领阶段增幅仍会生效，已计入反击预告。';break;
  case 'boss_collector':
   stage=e.stage===2?2:1;
   line('总点数不超过 13','本次反击 +20%',sumAtMost(13),{attackMultiplier:1.2});
   line('总点数至少 14','没有低总点的额外反击',sumAtLeast(14),{attackMultiplier:1},count*6>=14);
   line('三同或更高共鸣','获得我方生命上限 8% 的护盾，当次即可抵挡反击',same(3),{wardFraction:.08},count>=3);
   note='总点与共鸣分别结算：低总点反击增幅与三同护盾可同时触发。';
   next='下一掷仍分别判定总点与共鸣。';break;
  case 'parity':{
   const odd=(turn%2===1)!==!!variant,faces=odd?'1 / 3 / 5':'2 / 4 / 6';
   line(`${count} 骰中至少 ${majority} 颗${odd?'奇':'偶'}点（${faces}）`,'本击伤害 +35%',{kind:odd?'oddAtLeast':'evenAtLeast',value:majority},{damageMultiplier:1.35});
   note=count%2===0?'奇偶各半不会触发；未达多数也无额外奖励。':'未达多数时，无此额外伤害奖励。';
   next=`下一掷改为${odd?'偶':'奇'}点占多数。`;break;
  }
  case 'sequence':
   if(variant){
    line('双同或更高共鸣','本击伤害 +40%，阻止本次重筑',same(2),{damageMultiplier:1.4,preventsWard:true},count>=2);
    line('所有点数各不相同','存活反击后，敌方重筑最大生命 3% 的护盾',{kind:'allDistinct'},{enemyWardFraction:.03});
   }else{
    line('至少 3 种不同点数','本击伤害 +40%',distinct(3),{damageMultiplier:1.4},count>=3);
    line('不足 3 种点数','存活反击后，敌方重筑最大生命 3% 的护盾',{kind:'distinctAtMost',value:2},{enemyWardFraction:.03});
   }
   note=hpLimit;break;
  case 'laststand':{
   const current=deepEnemyAttack(e,1),following=deepEnemyAttack({...e,turns:e.turns+1},1);
   const change=n=>n<1?`反击 -${Math.round((1-n)*100)}%`:`反击 +${Math.round((n-1)*100)}%`;
   line(turn<=2?'前两掷的缓冲期':current>=1.6?'反击增幅已封顶':'反击正在增强',change(current),{kind:'always'},{baseAttackMultiplier:current});
   next=`下一掷：${change(following)}${following>=1.6?'（已达 +60% 上限）':''}。`;break;
  }
  case 'undertow':
   line('总点数至少 24','本击伤害 +25%，阻止本次回血',sumAtLeast(24),{damageMultiplier:1.25,preventsHeal:true},count*6>=24);
   line('总点数不足 24','存活反击后，敌方恢复最大生命的 2%',sumAtMost(23),{enemyHealFraction:.02});
   note=hpLimit;break;
  case 'hush':
   line('双同或更高共鸣','本次反击 -20%',same(2),{attackMultiplier:.8},count>=2);
   line('所有点数各不相同','本击额外穿盾 50%',{kind:'allDistinct'},{shieldPierce:.5});break;
  case 'hourward':
   if(turn%2){line('当前为奇数回合','本次反击 -20%',{kind:'always'},{attackMultiplier:.8});next='下一掷为偶数回合：本击伤害 +35%。';}
   else{line('当前为偶数回合','本击伤害 +35%',{kind:'always'},{damageMultiplier:1.35});next='下一掷为奇数回合：本次反击 -20%。';}break;
  case 'onslaught':{
   wave=e.wave||1;const factor=deepEnemyAttack(e,1);
   line(`当前为第 ${wave} 波`,wave===1?'首波反击强度':`反击比首波高 ${Math.round((factor-1)*100)}%`,{kind:'always'},{baseAttackMultiplier:factor});
   line('三同或更高共鸣','压低本次反击 25%',same(3),{attackMultiplier:.75},count>=3);
   note='各波独立结算战利品；开箱后才迎接下一波。';break;
  }
  case 'bounty':
   remaining=Math.max(0,3-e.turns);
   line(remaining?`加赏窗口还剩 ${remaining} 掷`:'三掷加赏窗口已过',remaining?'本击伤害 +20%；本掷击破时金币 ×3':'击破仍有宝箱；金币恢复原倍率',{kind:'always'},{damageMultiplier:remaining?1.2:1,goldMultiplier:remaining?3:1});
   note='史诗保底始终保留；窗口结束后，先手增伤与三倍金币一并结束。';
   next=remaining===1?'这是获得三倍金币的最后一掷。':'';break;
  case 'abyssking':
   stage=e.stage===2?2:1;
   if(stage===1)line('第一阶段：出现 6 点','本击伤害 +35%',hasSix,{damageMultiplier:1.35});
   else line('第二阶段：三同或更高共鸣','本击伤害 +60%',same(3),{damageMultiplier:1.6},count>=3);
   note=stage===1?phaseNote:'二阶段的基础反击 +15%，已计入反击预告。';break;
  case 'archiveguard':
   line('至少 4 种不同点数','本击伤害 +50%；获得生命上限 8% 的护盾',distinct(4),{damageMultiplier:1.5,wardFraction:.08},count>=4);
   line('不足 4 种点数','本次反击 +15%',{kind:'distinctAtMost',value:3},{attackMultiplier:1.15});break;
  case 'boss_prism':
   line('至少 3 种不同点数','本击伤害 +40%',distinct(3),{damageMultiplier:1.4},count>=3);
   line('不足 3 种点数','本次反击 +15%',{kind:'distinctAtMost',value:2},{attackMultiplier:1.15});break;
  case 'boss_eclipse':
   if(turn%2){
    line('奇数回合：出现 6 点','阻止本次额外反击',hasSix,{attackMultiplier:1});
    line('没有 6 点','本次反击 +25%',{kind:'lacksFace',value:6},{attackMultiplier:1.25});
    next='下一掷为偶数回合：三同使本击伤害 +50%。';
   }else{
    line('偶数回合：三同或更高共鸣','本击伤害 +50%',same(3),{damageMultiplier:1.5},count>=3);
    next='下一掷为奇数回合：没有 6 点则反击 +25%。';
   }break;
  case 'boss_witness':
   if(e.turns===0){line('本场首次掷骰','本击伤害 +50%',{kind:'always'},{damageMultiplier:1.5});next='之后：至少 3 颗 5 / 6 点可使反击 -25%。';}
   else line('至少 3 颗 5 / 6 点','本次反击 -25%',{kind:'highAtLeast',value:3,minFace:5},{attackMultiplier:.75},count>=3);break;
  case 'boss_thread':
   line('双同或更高共鸣','本击额外穿盾 45%，阻止本次重织',same(2),{shieldPierce:.45,preventsWard:true},count>=2);
   line('所有点数各不相同','存活反击后，敌方重筑最大生命 2% 的护盾',{kind:'allDistinct'},{enemyWardFraction:.02});
   note=hpLimit;break;
  case 'boss_origin':
   line('总点数至少 24','本击伤害 +40%',sumAtLeast(24),{damageMultiplier:1.4},count*6>=24);
   line('总点数不超过 14','本次反击 +25%',sumAtMost(14),{attackMultiplier:1.25});
   note='总点 15–23 时，没有这两项额外变化。';break;
  case 'boss_infinite':
   stage=e.stage===2?2:1;
   if(stage===1)line('第一阶段：至少 4 种不同点数','本击伤害 +40%',distinct(4),{damageMultiplier:1.4},count>=4);
   else line('第二阶段：三同或更高共鸣','本击伤害 +60%',same(3),{damageMultiplier:1.6},count>=3);
   note=stage===1?phaseNote:'二阶段的基础反击 +15%，已计入反击预告。';break;
  default:return null;
 }
 return {mechanic:e.mechanic,turn,count,stage,wave,remaining,lines,note,next,...(variant?{variantLabel:variant.title}:{})};
}
