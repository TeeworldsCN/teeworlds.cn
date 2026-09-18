// 中秋活动 · 流派跑局模拟器
//
// 目的:回答「这条流派能不能真的打通 16 关」——不是算单轮分数,而是跑完整局。
//
// 为什么快:掷骰策略用 DP(`engine.ts` 的 makeOptimal),**按配置全局缓存** ——
// 同一个 Tee 配置(卡 + 加成 + 骰子修饰)整局只建一次表(~1 秒),
// 之后每回合只是几次表查询。所以一条流派(16 关 × 6 人 × N 次试验)是秒级的,
// 不是小时级。
//
// 近似(明确写出来,免得误读结论):
//   1. 卡和加成按「终局配置」从第 1 关就齐 —— 测的是这条流派的上限,不是养成过程;
//   2. 改点工具(set_point/set_any/bump)按「搜最优改法」近似,最多 2 颗;
//   3. 不模拟商店/选卡/经济,只看「这套配置能不能达标」。
//
// 用法:
//   bun run tools/zhongqiu/sim.ts            跑全部预设流派
//   bun run tools/zhongqiu/sim.ts 4点 单点   只跑指定的几个

import {
	calcTeeScore,
	collectSetOps,
	selfDiceMods,
	playerDiceMods,
	mergeMods,
	TARGETS,
	type EffectiveEffect,
	type ScoreInput
} from '../../src/lib/zhongqiu/game';
import { BUFF_BY_ID, type AppliedBuff } from '../../src/lib/zhongqiu/items';
import { CARD_BY_ID, type TeeCard } from '../../src/lib/zhongqiu/teecards';
import { judgeRoll } from '../../src/lib/zhongqiu/midautumn';
import { FILLS, makeOptimal, pack, unpack, countOf, SUBSETS, toDice, rnd } from './engine';

const MAX_DICE = 6;

export interface TeeBuild {
	/** 这一席位的卡(可为空) */
	card?: string | null;
	/** 身上挂的加成卡 id */
	buffs?: string[];
}

export interface RunBuild {
	name: string;
	tees: TeeBuild[];
	/** 统一给全队的加成卡(会被合并到每个人身上) */
	teamBuffs?: string[];
}

/** 博弈程度:random(乱留) / sub(只留某个点数,玩家直觉打法) / opt(DP 最优) */
export type Skill = 'random' | 'sub' | 'opt';

export interface TurnContext {
	coins: number;
	round: number;
	leftScore: number;
	/** 本局累计计入的卖出数(每回合最多加 2) */
	soldCount: number;
}
interface Turn {
	/** 掷一次 + 最优保留 + 改点近似,返回这一回合的得分 */
	(ctx?: Partial<TurnContext>): number;
}

/** 改点近似:枚举「把哪几颗改成什么」,取分最高的改法(最多 2 颗) */
const applyOps = (
	dice: number[],
	ops: { kind: 'point' | 'any' | 'bump'; count: number; point?: number }[],
	scoreOfDice: (d: number[], fixed: number[]) => number
): number => {
	// 改点盖过视为:改过的骰子要豁免映射
	const diff = (a: number[], b: number[]) => a.map((_, i) => i).filter((i) => a[i] !== b[i]);
	let best = scoreOfDice(dice, []);
	if (ops.length === 0) return best;
	for (const op of ops) {
		const tries: number[][] = [];
		if (op.kind === 'bump') {
			for (let i = 0; i < dice.length; i++)
				if (dice[i] < 6) {
					const d = [...dice];
					d[i] += 1;
					tries.push(d);
				}
		} else {
			const faces = op.kind === 'any' ? [1, 2, 3, 4, 5, 6] : [op.point ?? 4];
			for (let i = 0; i < dice.length; i++)
				for (const f of faces) {
					const d = [...dice];
					d[i] = f;
					tries.push(d);
				}
		}
		for (const d of tries) best = Math.max(best, scoreOfDice(d, diff(dice, d)));
		// 两颗的情况:只在第一颗有收益时才继续搜(格子太小,收益递减)
		if (op.count > 1) {
			for (const d of tries) {
				for (let i = 0; i < d.length; i++)
					for (let f = 1; f <= 6; f++) {
						const d2 = [...d];
						d2[i] = f;
						best = Math.max(best, scoreOfDice(d2, diff(dice, d2)));
					}
			}
		}
	}
	return best;
};

/** 建一个 Tee 的「一回合」函数(DP 表按配置缓存) */
export const makeTurn = (
	build: TeeBuild,
	teamCards: (TeeCard | null)[],
	index: number,
	extraTeamBuffs: string[] = [],
	skill: Skill = 'opt'
): Turn => {
	const buffIds = [...(build.buffs ?? []), ...extraTeamBuffs];
	const card = build.card ? CARD_BY_ID.get(build.card)! : null;
	const self: EffectiveEffect[] = card ? [{ eff: card.effect, srcId: card.id }] : [];
	const buffs: AppliedBuff[] = buffIds.map((id) => ({ cardId: id, turnsLeft: 1 }));
	const allSelf = teamCards.map((c) => (c ? [{ eff: c.effect, srcId: c.id }] : []));

	// 每回合的上下文(经济/成长/接力要) —— 掷骰策略用中性值,计分用真实值
	let ctx: TurnContext = { coins: 0, round: 1, leftScore: 0, soldCount: 0 };
	let rerolled = 0;
	// 角色自身的骰子修饰(点数阶梯 faceFloor / 点数映射)必须传给判定和 DP
	// 主 Tee(位置 0)吃全队的「我掷出的 X 视为 4」规则 —— 这是主 Tee 流的核心
	const mods =
		index === 0 ? mergeMods(selfDiceMods(self), playerDiceMods(teamCards)) : selfDiceMods(self);
	const scoreOfDice = (dice: number[], fixed: number[] = []) => {
		const lid = judgeRoll(dice, mergeMods(mods, { fixed })).id;
		const input: ScoreInput = {
			levelId: lid,
			self,
			allSelf,
			index,
			teamCards,
			growth: card ? { [card.id]: Math.max(0, ctx.round - 1) } : {},
			buffs,
			teamSize: teamCards.length,
			diceSum: dice.reduce((a, b) => a + b, 0),
			ownDice: [...dice],
			rerolled,
			playerLevelId: lid,
			playerDice: dice,
			coins: ctx.coins,
			round: ctx.round,
			leftScore: ctx.leftScore,
			soldCount: ctx.soldCount
		};
		return calcTeeScore(input).total;
	};

	// 掷骰策略的 DP:用「不含改点的分数」当目标 —— 改点是掷完之后的事
	const key = `${build.card ?? '-'}|${buffIds.join(',')}|${index}|${teamCards.map((c) => c?.id ?? '-').join(',')}`;
	let dp = DP_CACHE.get(key);
	if (!dp) {
		dp = makeOptimal(mods, (st) => scoreOfDice(toDice(st)));
		DP_CACHE.set(key, dp);
	}
	const { V, bestKeep } = dp;
	/** 按博弈程度选择保留哪些骰子 */
	const chooseKeep = (st: number, left: number): number => {
		if (skill === 'opt') return bestKeep(st, left);
		if (skill === 'random') {
			const list = SUBSETS[st] ?? [st];
			return list[Math.floor(Math.random() * list.length)];
		}
		// 次优:只留 4 点(博饼最经典的直觉打法)——
		// 刻意做得比最优笨,这样「次优能走多远」才反映流派难度,
		// 「最优能走多远」才是流派上限(两者之差 = 这条流派吃不吃操作)。
		const counts = unpack(st);
		return counts[4] > 0 ? pack(counts.map((c, i) => (i === 4 ? c : 0))) : 0;
	};

	const ops = collectSetOps(self, buffs).map((o) => ({
		kind: o.kind,
		count: o.count,
		point: o.point
	}));
	const rolls =
		2 +
		Math.max(
			0,
			(self.find((s) => s.eff.type === 'extra_roll')?.eff as { count?: number })?.count ?? 0
		);

	// 注意:状态是**计数数组**(下标 1..6),不是骰子值数组 —— 取骰子要用 toDice
	const rollState = (): number => {
		const c = new Array(7).fill(0);
		for (let k = 0; k < MAX_DICE; k++) c[rnd()]++;
		return pack(c);
	};
	return (c?: Partial<TurnContext>) => {
		ctx = {
			coins: c?.coins ?? 0,
			round: c?.round ?? 1,
			leftScore: c?.leftScore ?? 0,
			soldCount: c?.soldCount ?? 0
		};
		rerolled = 0;
		let st = rollState();
		for (let left = rolls; left > 1; left--) {
			const keep = chooseKeep(st, left);
			rerolled += MAX_DICE - countOf(keep);
			const cc = unpack(keep);
			for (let k = countOf(keep); k < MAX_DICE; k++) cc[rnd()]++;
			st = pack(cc);
		}
		return applyOps(toDice(st), ops, scoreOfDice);
	};
};

const DP_CACHE = new Map<string, ReturnType<typeof makeOptimal>>();

export interface SimResult {
	name: string;
	/** 16 关全部通过的次数占比 */
	clearRate: number;
	/** 死在第几关(中位数) */
	medianDeath: number;
	/** 每关通过率 */
	roundPass: number[];
}

/** 跑一局(16 关) */
export const simulateRun = (build: RunBuild, trials = 200, skill: Skill = 'opt'): SimResult => {
	const teamCards: (TeeCard | null)[] = build.tees.map((t) =>
		t.card ? CARD_BY_ID.get(t.card)! : null
	);
	const turns = build.tees.map((t, i) => makeTurn(t, teamCards, i, build.teamBuffs ?? [], skill));
	const roundPass = Array.from({ length: TARGETS.length }, () => 0);
	let cleared = 0;

	const deaths: number[] = [];
	for (let trial = 0; trial < trials; trial++) {
		let alive = true;
		let soldTotal = 0; // 每局重置
		for (let r = 0; r < TARGETS.length; r++) {
			let total = 0;
			// 粗略的经济模型:基础奖励 + 每关递增(与 roundReward 同量级)
			const coins = 10 + 12 * r;
			// R6 前队伍没满不会卖;之后每回合卖 0~2 个(受"每回合最多计 2"限制)
			const soldThisRound = r + 1 < 6 ? 0 : (r + 1) % 2 === 0 ? 2 : 1;
			soldTotal += Math.min(2, soldThisRound);
			const soldCount = soldTotal;
			let prev = 0;
			for (const t of turns) {
				const s1 = t({ coins, round: r + 1, leftScore: prev, soldCount });
				prev = s1;
				total += s1;
			}
			if (total >= TARGETS[r]) {
				roundPass[r]++;
			} else {
				deaths.push(r + 1);
				alive = false;
				break;
			}
		}
		if (alive) cleared++;
	}
	const sorted = [...deaths].sort((a, b) => a - b);
	return {
		name: build.name,
		clearRate: cleared / trials,
		medianDeath: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0,
		roundPass: roundPass.map((n) => n / trials)
	};
};

// ---- 预设流派(终局配置) ----
//
// 每个流派给 6 个人配满:核心卡 + 该流派的加成卡。数值见 README「流派后期方案」。

export const BUILDS: RunBuild[] = [
	{
		name: '4 点基础',
		tees: [
			{ card: 'shiyue', buffs: ['yuefu'] },
			{ card: 'sixi', buffs: ['yuefu'] },
			{ card: 'mantanghong', buffs: ['yuefu'] },
			{ card: 'jinhua', buffs: ['yuefu'] },
			{ card: 'shiyue', buffs: ['yueshika'] },
			{ card: 'sixi', buffs: ['yueshika'] }
		]
	},
	{
		name: '单点流(1 点)',
		tees: [
			{ card: 'guyue', buffs: ['yueyachi'] },
			{ card: 'hanxing', buffs: ['yueyachi'] },
			{ card: 'yiyang', buffs: ['yueyachi'] },
			{ card: 'guyue', buffs: ['suyuepan'] },
			{ card: 'hanxing', buffs: ['suyuepan'] },
			{ card: 'yiyang', buffs: ['suyuepan'] }
		]
	},
	{
		name: '流派流(兔 tag)',
		tees: [
			{ card: 'yutuhui' },
			{ card: 'yutulinfan' },
			{ card: 'baiyutu' },
			{ card: 'yutuyao' },
			{ card: 'yuhuachi' },
			{ card: 'yutuzuqun' }
		]
	},
	{
		name: '连号流',
		tees: [
			{ card: 'lianzhudeng' },
			{ card: 'qixingdeng' },
			{ card: 'zhideng' },
			{ card: 'lianzhudeng' },
			{ card: 'qixingdeng' },
			{ card: 'zhideng' }
		],
		teamBuffs: ['hebi']
	},
	{
		name: '负分流',
		tees: [
			{ card: 'canyue', buffs: ['niyuefu'] },
			{ card: 'queyue', buffs: ['niyuefu'] },
			{ card: 'kuiyue', buffs: ['niyuefu'] },
			{ card: 'canyue', buffs: ['niyuefu'] },
			{ card: 'queyue', buffs: ['niyuefu'] },
			{ card: 'kuiyue', buffs: ['niyuefu'] }
		]
	},
	{
		name: '团队流(人数)',
		tees: [
			{ card: 'dazhanggui' },
			{ card: 'quanjiafu' },
			{ card: 'yeshi' },
			{ card: 'quanjiafu' },
			{ card: 'kongmingdeng' },
			{ card: 'quanjiafu' }
		]
	},
	{
		name: '经济流',
		tees: [
			{ card: 'panlong' },
			{ card: 'mantanghong' },
			{ card: 'panlong' },
			{ card: 'mantanghong' },
			{ card: 'panlong' },
			{ card: 'mantanghong' }
		]
	},
	{
		name: '成长流',
		tees: [
			{ card: 'guanghangong' },
			{ card: 'mantanghong' },
			{ card: 'guishu' },
			{ card: 'mantanghong' },
			{ card: 'guanghangong' },
			{ card: 'mantanghong' }
		]
	},
	{
		name: '加持流(加成卡)',
		tees: [
			{ card: 'pengyue', buffs: ['yuefu', 'yulu', 'manyuezhufu', 'hebi', 'yueyachi'] },
			{ card: 'dengguan', buffs: ['yuefu', 'yulu', 'manyuezhufu', 'hebi', 'yueyachi'] },
			{ card: 'guanghandenghui', buffs: ['yuefu', 'yulu', 'manyuezhufu', 'hebi', 'yueyachi'] },
			{ card: 'pengyue', buffs: ['yuefu', 'yulu', 'manyuezhufu', 'hebi', 'yueyachi'] },
			{ card: 'dengguan', buffs: ['yuefu', 'yulu', 'manyuezhufu', 'hebi', 'yueyachi'] },
			{ card: 'guanghandenghui', buffs: ['yuefu', 'yulu', 'manyuezhufu', 'hebi', 'yueyachi'] }
		]
	},
	{
		name: '主 Tee 联动',
		tees: [
			{ card: 'shiyue' },
			{ card: 'mingyuegongzhao' },
			{ card: 'wangyuehuaiyuan' },
			{ card: 'shiyue' },
			{ card: 'mingyuegongzhao' },
			{ card: 'wangyuehuaiyuan' }
		]
	},
	{
		name: '和值流',
		tees: [
			{ card: 'yuechao' },
			{ card: 'wangyue' },
			{ card: 'yuechao' },
			{ card: 'wangyue' },
			{ card: 'yuechao' },
			{ card: 'wangyue' }
		]
	},
	{
		name: '重掷流',
		tees: [
			{ card: 'kuaiyu' },
			{ card: 'mantanghong' },
			{ card: 'kuaiyu' },
			{ card: 'mantanghong' },
			{ card: 'kuaiyu' },
			{ card: 'mantanghong' }
		]
	},
	{
		name: '复制流',
		tees: [
			{ card: 'yuelao' },
			{ card: 'jinhua' },
			{ card: 'yuelao' },
			{ card: 'jinhua' },
			{ card: 'yuelao' },
			{ card: 'jinhua' }
		]
	},
	{
		name: '支援流(左右)',
		tees: [
			{ card: 'qiansixi' },
			{ card: 'sixi' },
			{ card: 'qiansixi' },
			{ card: 'jinhua' },
			{ card: 'qiansixi' },
			{ card: 'shiyue' }
		]
	},
	{
		name: '主 Tee 流(全视为 4)',
		tees: [
			{ card: 'yiyang', buffs: ['yuefu', 'manyuezhufu'] },
			{ card: 'xiaoyue' },
			{ card: 'wangshu' },
			{ card: 'meiyue' },
			{ card: 'shangxian' },
			{ card: 'xinyue' }
		]
	},
	{
		name: '纯通用(对照)',
		tees: Array.from({ length: 6 }, () => ({ card: 'mantanghong' }))
	},
	{
		name: '无卡(最低基准)',
		tees: Array.from({ length: 6 }, () => ({ card: null }))
	}
];

// ---- CLI ----
if (import.meta.main) {
	const wanted = process.argv.slice(2);
	const list = wanted.length
		? BUILDS.filter((b) => wanted.some((w) => b.name.includes(w)))
		: BUILDS;
	const trials = Number(process.env.TRIALS ?? 300);
	const cell = (r: SimResult) =>
		r.clearRate > 0
			? `✓${(r.clearRate * 100).toFixed(0)}%`
			: r.medianDeath
				? `R${r.medianDeath}`
				: '—';
	console.log(`流派跑局模拟 · 每条 ${trials} 局 · 目标 R1=${TARGETS[0]} … R16=${TARGETS[15]}\n`);
	console.log(
		'难度 ← 随机 / 次优(直觉打法) / 最优(DP) → 收益上限'.padEnd(30) +
			'随机'.padStart(8) +
			'次优'.padStart(8) +
			'最优'.padStart(8)
	);
	const t0 = Date.now();
	for (const b of list) {
		const rr = simulateRun(b, trials, 'random');
		const rs = simulateRun(b, trials, 'sub');
		const ro = simulateRun(b, trials, 'opt');
		const gap = (ro.medianDeath || 16) - (rs.medianDeath || 16);
		console.log(
			b.name.padEnd(18) +
				cell(rr).padStart(8) +
				cell(rs).padStart(8) +
				cell(ro).padStart(8) +
				`   次优→最优 +${gap} 关`
		);
	}
	console.log(`\n耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
