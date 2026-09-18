// 一次性探针:验证「重复牌倍率」(face_count_mult) 在引擎里到底生不生效
import { applyDiceMods, judgeRoll } from '../../src/lib/zhongqiu/midautumn';
import {
	calcTeeScore,
	mergeMods,
	playerDiceMods,
	selfDiceMods,
	type ScoreInput
} from '../../src/lib/zhongqiu/game';
import { CARD_BY_ID, type TeeCard, type TeeEffect } from '../../src/lib/zhongqiu/teecards';

const teamCards: (TeeCard | null)[] = [
	null, // 主 Tee(「我」)没有卡
	CARD_BY_ID.get('shangxian')!, // 上弦:5 视为 4 + face_count_mult(5)
	CARD_BY_ID.get('guishu')! // 桂树:纯数值卡,不参与判定
];
const dice = [5, 5, 5, 1, 2, 3]; // 原始骰面:三颗 5 → 期望 ×3

const self: { eff: TeeEffect; srcId: string }[] = []; // 主 Tee(「我」)自己没有卡
const mods = mergeMods(selfDiceMods(self, []), playerDiceMods(teamCards));
const own = judgeRoll(dice, mods).id;
const input: ScoreInput = {
	levelId: own,
	self,
	allSelf: teamCards.map((c) => (c ? [{ eff: c.effect, srcId: c.id }] : [])),
	index: 0,
	teamCards,
	growth: {},
	buffs: [],
	teamSize: teamCards.length,
	diceSum: applyDiceMods(dice, mods).reduce((a, b) => a + b, 0),
	ownDice: applyDiceMods(dice, mods),
	rerolled: 0,
	playerLevelId: own,
	playerDice: applyDiceMods(dice, mods),
	playerRawDice: dice, // ← 关键:原始骰面
	coins: 0,
	round: 10
};
const bd = calcTeeScore(input);
console.log(
	'判定等级:',
	own,
	'| 原始骰面:',
	dice.join(''),
	'| 映射后:',
	applyDiceMods(dice, mods).join('')
);
console.log('base:', bd.base, ' chips:', bd.chips, ' mult:', bd.mult, ' total:', bd.total);
console.log('得分来源:');
for (const s of bd.sources)
	console.log('  ', s.srcId, 'chips+' + s.chips, 'mult×' + Number(s.mult.toFixed(3)), s.from ?? '');

// 对照:不给 playerRawDice
const bd2 = calcTeeScore({ ...input, playerRawDice: undefined });
console.log('\n不给 playerRawDice → mult:', bd2.mult, ' total:', bd2.total, '(应当比上面小)');
