/**
 * Boss 关过关率模拟 —— 回答「第 3 关遇到黑月是不是太难了」
 *
 * 用法:
 *   bun run tools/zhongqiu/boss.ts                  # 第 3 关,无 Boss + 3 个温和 Boss 对比
 *   ROUND=6 bun run tools/zhongqiu/boss.ts          # 第 6 关
 *   RUNS=8000 BUFFS=0 bun run tools/zhongqiu/boss.ts
 *   BUFFS=0/1/2  开打前手上能买几张加成卡(默认 1)
 *
 * 与 balance.ts 的分工:
 *   balance.ts —— 全流程曲线标定,「等级分 × 卡倍率」确定性模型(快、平滑,不看 Boss)
 *   本脚本     —— 单关死磕:逐颗骰子掷,计分全走游戏本体的
 *                judgeRoll / applyDiceMods / calcTeeScore / calcTeamTotal
 *
 * 建模口径(整体偏保守,即倾向于低估玩家):
 *   1. 掷骰用 engine.ts 的最优策略(和 balance.ts 同一套),该策略只按「等级分」最优,
 *      不考虑卡牌倍率;改点类效果在掷完之后按等级分贪心用掉。
 *   2. 队伍:我 + 开局 5 张普通里挑 2 + 第 1..ROUND-1 关奖励各 1 = ROUND+2 人。
 *      挑卡按「单 Tee 期望分」排序取最好(≈ 会玩的玩家)。
 *   3. 加成卡:按商店真实价格买得起就买,挂在期望分最高的 Tee 上。
 *   4. 成长卡层数按「卡在队伍里的关数」直接给,不模拟重打。
 *   5. 跨 Tee 条件卡(「我的 N 个 4」之类)用真实队友骰子算,不是近似。
 */

import {
	applyDiceMods,
	getRollLevel,
	judgeRoll,
	type DiceMods
} from '../../src/lib/zhongqiu/midautumn';
import { CARDS, type TeeCard, type TeeEffect } from '../../src/lib/zhongqiu/teecards';
import {
	BUFF_CARDS,
	drawItems,
	type AppliedBuff,
	type BuffCard
} from '../../src/lib/zhongqiu/items';
import {
	BOSSES,
	calcTeamTotal,
	calcTeeScore,
	collectSetOps,
	effectiveEffects,
	roundReward,
	roundTarget,
	rollsAllowed,
	TEAM_LIMIT,
	selfDiceMods,
	withBossMods,
	type Boss,
	type SetOp,
	type GrowthMap,
	type ScoreInput,
	type TeamTee
} from '../../src/lib/zhongqiu/game';
import { countOf, makeOptimal, pack, rnd, toDice, unpack } from './engine';

const RUNS = Number(process.env.RUNS ?? 3000);
const ROUND = Number(process.env.ROUND ?? 3);
const BUFFS = Number(process.env.BUFFS ?? 1); // 开打前能买几张加成卡
const SAMPLE = Number(process.env.SAMPLE ?? 300); // 卡牌估值用的抽样次数
/** 等难度求解的基准过关率;默认 -1 = 用「无 Boss」那档的过关率(即 Boss 只算骰子特效的账) */
const PASS = Number(process.env.PASS ?? -1);

// ================================================================ 掷骰

/** 最优打法策略(只缓存一次;只按等级分最优,和 balance.ts 一致) */
const policyCache = new Map<string, ReturnType<typeof makeOptimal>>();
const policyOf = (mods?: DiceMods) => {
	const key = mods ? JSON.stringify(mods) : '-';
	let p = policyCache.get(key);
	if (!p) {
		p = makeOptimal(mods);
		policyCache.set(key, p);
	}
	return p;
};

/** 掷 rolls 次(带最优保留策略),返回最终 6 颗骰子的真实点数 */
const rollWith = (mods: DiceMods | undefined, rolls: number): number[] => {
	const c = new Array(7).fill(0);
	for (let k = 0; k < 6; k++) c[rnd()]++;
	let st = pack(c);
	if (rolls > 1) {
		const { bestKeep } = policyOf(mods);
		for (let left = rolls; left > 1; left--) {
			const keep = bestKeep(st, left);
			const cc = unpack(keep);
			for (let k = countOf(keep); k < 6; k++) cc[rnd()]++;
			st = pack(cc);
		}
	}
	return toDice(st);
};

const levelScore = (dice: number[], mods?: DiceMods) =>
	getRollLevel(judgeRoll(dice, mods).id).score;

/** 改点类效果(改 N 颗为 4 / 任意点):按「等级分最高」贪心用掉 */
const useSetOps = (dice: number[], ops: SetOp[], mods?: DiceMods): number[] => {
	const d = [...dice];
	for (const op of ops) {
		for (let k = 0; k < op.count; k++) {
			let bestI = -1;
			let bestVal = 0;
			let bestScore = levelScore(d, mods);
			for (let i = 0; i < 6; i++) {
				const saved = d[i];
				const vals = op.kind === 'point' && op.point ? [op.point] : [1, 2, 3, 4, 5, 6];
				for (const v of vals) {
					if (v === saved) continue;
					d[i] = v;
					const s = levelScore(d, mods);
					if (s > bestScore) {
						bestScore = s;
						bestI = i;
						bestVal = v;
					}
					d[i] = saved;
				}
			}
			if (bestI < 0) return d; // 改哪颗都不涨分,停手
			d[bestI] = bestVal;
		}
	}
	return d;
};

// ================================================================ 计分

const cardsOf = (team: TeamTee[]): (TeeCard | null)[] =>
	team.map((t) => (t.cardId ? (CARDS.find((c) => c.id === t.cardId) ?? null) : null));

const modsOf = (team: TeamTee[], i: number, boss: Boss | null): DiceMods | undefined =>
	withBossMods(selfDiceMods(effectiveEffects(cardsOf(team), i), team[i]?.buffs ?? []), boss?.mods);

/** 第 i 个 Tee 掷完后的得分(走游戏本体 calcTeeScore,顺带写回 lastDice/lastLevelId) */
const scoreTee = (
	team: TeamTee[],
	i: number,
	dice: number[],
	growth: GrowthMap,
	boss: Boss | null
): number => {
	const cards = cardsOf(team);
	const mods = modsOf(team, i, boss);
	const shown = applyDiceMods(dice, mods);
	const levelId = judgeRoll(dice, mods).id;
	const input: ScoreInput = {
		levelId,
		self: effectiveEffects(cards, i),
		allSelf: cards.map((_, k) => effectiveEffects(cards, k)),
		index: i,
		teamCards: cards,
		growth,
		buffs: team[i]?.buffs ?? [],
		teamSize: team.length,
		diceSum: shown.reduce((a, b) => a + b, 0),
		ownDice: [...shown],
		rerolled: 0,
		playerLevelId: i === 0 ? levelId : (team[0]?.lastLevelId ?? 'none'),
		playerDice: i === 0 ? shown : (team[0]?.lastDice ?? [])
	};
	team[i].lastDice = [...dice];
	team[i].lastLevelId = levelId;
	team[i].lastScore = calcTeeScore(input).total;
	return team[i].lastScore;
};

/** 全队打一关,返回团队总分 */
const playRound = (team: TeamTee[], growth: GrowthMap, boss: Boss | null): number => {
	team.forEach((t, i) => {
		const self = effectiveEffects(cardsOf(team), i);
		const mods = modsOf(team, i, boss);
		let dice = rollWith(mods, rollsAllowed(self, t.buffs, boss?.rollsBonus ?? 0));
		const ops = collectSetOps(self, t.buffs);
		if (ops.length) dice = useSetOps(dice, ops, mods);
		scoreTee(team, i, dice, growth, boss);
	});
	return calcTeamTotal(
		team.map((t) => t.lastScore),
		cardsOf(team).filter((c): c is TeeCard => c !== null)
	).total;
};

// ================================================================ 组队

/** 单 Tee 期望分(无 Boss),用来给卡排序 / 决定加成卡挂给谁 */
const valueCache = new Map<string, number>();
const valueOf = (card: TeeCard | null): number => {
	const key = card?.id ?? '__self__';
	const hit = valueCache.get(key);
	if (hit !== undefined) return hit;
	const team: TeamTee[] = [newTee(card?.id ?? null)];
	let sum = 0;
	for (let k = 0; k < SAMPLE; k++) sum += scoreTee(team, 0, rollWith(undefined, 2), {}, null);
	const v = sum / SAMPLE;
	valueCache.set(key, v);
	return v;
};

const newTee = (cardId: string | null): TeamTee => ({
	cardId,
	lastScore: 0,
	lastLevelId: 'none',
	lastDice: [1, 1, 1, 1, 1, 1],
	buffs: []
});

/** 稀有度加权抽 n 张(和奖励/商店一致) */
const drawWeighted = (pool: TeeCard[], n: number): TeeCard[] => {
	const weight: Record<string, number> = { common: 7, rare: 3, legendary: 1 };
	const rest = [...pool];
	const out: TeeCard[] = [];
	while (out.length < n && rest.length) {
		const total = rest.reduce((s, c) => s + (weight[c.rarity] ?? 1), 0);
		let r = Math.random() * total;
		let idx = 0;
		for (let i = 0; i < rest.length; i++) {
			r -= weight[rest[i].rarity] ?? 1;
			if (r <= 0) {
				idx = i;
				break;
			}
		}
		out.push(rest[idx]);
		rest.splice(idx, 1);
	}
	return out;
};

const bestOf = (pool: TeeCard[], n: number, used: Set<string>): TeeCard | null => {
	const cands = drawWeighted(
		pool.filter((c) => !used.has(c.id)),
		n
	);
	let best: TeeCard | null = null;
	for (const c of cands) if (!best || valueOf(c) > valueOf(best)) best = c;
	return best;
};

/** 打到第 ROUND 关开打前的队伍 + 成长层数 */
const buildTeam = (): { team: TeamTee[]; growth: GrowthMap } => {
	const used = new Set<string>();
	/** 卡 id -> 已经打了多少关 */
	const roundsIn: Record<string, number> = {};

	// 开局:5 张普通里挑 2 张
	const commons = CARDS.filter((c) => c.rarity === 'common');
	for (let k = 0; k < 2; k++) {
		const best = bestOf(commons, 5, used);
		if (!best) break;
		used.add(best.id);
		roundsIn[best.id] = ROUND - 1;
	}
	// 第 1..ROUND-1 关各一张奖励(队伍满了就不再加人,和 pickReward 一致)
	for (let r = 1; r < ROUND; r++) {
		if (used.size + 1 >= TEAM_LIMIT) break;
		const best = bestOf(CARDS, 3, used);
		if (!best) break;
		used.add(best.id);
		roundsIn[best.id] = ROUND - 1 - r;
	}

	const team = [newTee(null), ...[...used].map((id) => newTee(id))];
	// 成长卡层数:在队伍里待了几关就叠几层(和 applyGrowth 同口径)
	const growth: GrowthMap = {};
	const walk = (id: string, e: TeeEffect | undefined, rounds: number) => {
		if (!e) return;
		if (e.type === 'scaling_mult') growth[id] = (growth[id] ?? 0) + e.per * rounds;
		else if (e.type === 'bundle') e.parts.forEach((p) => walk(id, p, rounds));
	};
	for (const [id, rounds] of Object.entries(roundsIn)) {
		const card = CARDS.find((c) => c.id === id);
		walk(id, card?.effect, rounds);
	}
	return { team, growth };
};

// ================================================================ 加成卡

/** 开打前攒下的月饼币(只算过关奖励 + 商店基础 2 币,按刚好达标估 = 偏少) */
const coinsBefore = Array.from({ length: ROUND - 1 }, (_, i) => roundReward(i + 1) + 2).reduce(
	(a, b) => a + b,
	0
);

/** 商店 3 选 1:买得起就买,挂到期望分最高的 Tee 上 */
const buyBuffs = (team: TeamTee[], budget: number, want: number) => {
	if (want <= 0) return;
	const offers = drawItems(BUFF_CARDS, 3).sort((a, b) => a.price - b.price);
	let money = budget;
	const bought: BuffCard[] = [];
	for (const b of offers) {
		if (bought.length >= want) break;
		if (b.price <= money) {
			money -= b.price;
			bought.push(b);
		}
	}
	for (const b of bought) {
		let idx = 0;
		let bestV = -1;
		team.forEach((t, i) => {
			const v = valueOf(t.cardId ? (CARDS.find((c) => c.id === t.cardId) ?? null) : null);
			if (v > bestV) {
				bestV = v;
				idx = i;
			}
		});
		const buff: AppliedBuff = { cardId: b.id, turnsLeft: b.turns };
		team[idx].buffs = [...team[idx].buffs, buff];
	}
};

// ================================================================ 主流程

const pct = (p: number) => (p * 100).toFixed(1) + '%';
const quant = (sorted: number[], q: number) =>
	sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];

/** 温和池(第 1~6 关)与全池,直接读 Boss 定义里的 mild 标记 */
const scenarios: (Boss | null)[] = [
	null,
	...BOSSES.filter((b) => b.mild),
	...BOSSES.filter((b) => !b.mild)
];

console.log(
	`\n第 ${ROUND} 关模拟 · ${RUNS} 次开局 · 开打前约 ${coinsBefore} 🥮 可买 ${BUFFS} 张加成卡\n`
);
console.log(
	'  Boss'.padEnd(13) +
		'目标'.padStart(7) +
		'过关率'.padStart(9) +
		'p25'.padStart(8) +
		'p50'.padStart(8) +
		'p75'.padStart(8) +
		'p50/目标'.padStart(10)
);

/** 每档 Boss 跑一遍,顺手收集总分分布(等难度求解要用) */
const runs: { boss: Boss | null; target: number; pass: number; totals: number[] }[] = [];
for (const boss of scenarios) {
	const target = Math.round(roundTarget(ROUND) * (boss?.targetMult ?? 1));
	const totals: number[] = [];
	for (let run = 0; run < RUNS; run++) {
		const { team, growth } = buildTeam();
		buyBuffs(team, coinsBefore, BUFFS);
		totals.push(playRound(team, growth, boss));
	}
	totals.sort((a, b) => a - b);
	runs.push({
		boss,
		target,
		pass: totals.filter((t) => t >= target).length / RUNS,
		totals
	});
}

const base = runs[0];
/** 等难度求解的目标过关率 */
const want = PASS >= 0 ? PASS : base.pass;
/** 反推「让这档 Boss 的过关率 = want」所需的目标倍率 */
const fairMult = (r: (typeof runs)[number]) =>
	quant(r.totals, Math.min(0.999, 1 - want)) / roundTarget(ROUND);

console.log(
	'  Boss'.padEnd(13) +
		'目标'.padStart(7) +
		'过关率'.padStart(9) +
		'p25'.padStart(8) +
		'p50'.padStart(8) +
		'p75'.padStart(8) +
		'p50/目标'.padStart(10) +
		'等难度目标'.padStart(12)
);

for (const r of runs) {
	const med = quant(r.totals, 0.5);
	const label = r.boss ? `${r.boss.emoji} ${r.boss.name}` : '（无 Boss）';
	console.log(
		label.padEnd(12) +
			String(r.target).padStart(7) +
			pct(r.pass).padStart(9) +
			String(Math.round(quant(r.totals, 0.25))).padStart(8) +
			String(Math.round(med)).padStart(8) +
			String(Math.round(quant(r.totals, 0.75))).padStart(8) +
			`${(med / r.target).toFixed(2)}×`.padStart(10) +
			(r.boss ? `${fairMult(r).toFixed(2)}×`.padStart(12) : ''.padStart(12))
	);
}
console.log(
	`\n  等难度目标 = 让这档 Boss 的过关率 = ${pct(want)}` +
		(PASS >= 0 ? `(env PASS)` : `(追平「无 Boss」)`) +
		` 所需的目标倍率\n`
);
