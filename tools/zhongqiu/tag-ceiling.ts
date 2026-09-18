// 六系满配的「爆发上限」探针:每系组一支全同系队伍,分别掷再接再厉 / 一秀 / 状元,看总分
import {
	calcTeamTotal,
	calcTeeScore,
	playerDiceMods,
	selfDiceMods,
	mergeMods,
	type ScoreInput
} from '../../src/lib/zhongqiu/game';
import { CARDS, CARD_BY_ID, type TeeCard } from '../../src/lib/zhongqiu/teecards';
import {
	applyDiceMods,
	getRollLevel,
	sampleDice,
	judgeRoll
} from '../../src/lib/zhongqiu/midautumn';

const ROUND = 14; // 后期关卡,避免「每关成长」类效果干扰对比
const families = ['月', '桂', '仙', '饼', '兔', '灯'];
const tiers = ['none', 'yi_xiu', 'zhuang_yuan'];

const score = (tag: string, lid: string, n: number): { total: number; per: number } => {
	// 必须带上本系的 per_tag 引擎卡(派系流的爆发来源),其余用同系卡凑 n。
	// 原来直接 slice(0,5) 拿的是卡池最前面 5 张,量出来的是「有 5 张同系卡的杂牌队」,不是派系流。
	const isEngine = (c: TeeCard) => JSON.stringify(c.effect).includes('per_tag');
	const mem = [...CARDS.filter((c) => c.tag === tag)]
		.sort((a, b) => Number(isEngine(b)) - Number(isEngine(a)))
		.slice(0, n);
	const cards: (TeeCard | null)[] = [null, ...mem];
	const level = getRollLevel(lid);
	const dice = sampleDice(level);
	const allSelf = cards.map((c) => (c ? [{ eff: c.effect, srcId: c.id }] : []));
	const scores: number[] = [];
	cards.forEach((c, i) => {
		const self = allSelf[i];
		const mods = mergeMods(selfDiceMods(self, []), i === 0 ? playerDiceMods(cards) : undefined);
		// 用映射后的骰子:引擎里数「4 的颗数 / 某个点数」都是看实际点数(和页面 shownDice 一致)
		const shown = applyDiceMods(dice, mods);
		const own = judgeRoll(dice, mods).id;
		const input: ScoreInput = {
			levelId: own,
			self,
			allSelf,
			index: i,
			teamCards: cards,
			growth: {},
			buffs: [],
			teamSize: cards.length,
			diceSum: shown.reduce((a, b) => a + b, 0),
			ownDice: shown,
			rerolled: 0,
			playerLevelId: own,
			playerDice: dice,
			coins: 0,
			round: ROUND
		};
		scores.push(calcTeeScore(input).total);
	});
	const { total } = calcTeamTotal(scores, cards, ROUND);
	return { total, per: scores[1] ?? 0 };
};

console.log(`六系满配爆发探针 · 第 ${ROUND} 关 · 全队同系各 5 张卡(主 Tee 无卡)\n`);
console.log('系   张数  ' + tiers.map((t) => t.padStart(11)).join(''));
for (const tag of families) {
	const n = Math.min(5, CARDS.filter((c) => c.tag === tag).length);
	const row = tiers.map((lid) => `R${score(tag, lid, n).total.toFixed(0)}`.padStart(11));
	console.log(`${tag}    ${n}    ${row.join('')}`);
}
console.log(`\n目标参考:R8=1235  R10=1725  R13≈3000  R16=4660`);
