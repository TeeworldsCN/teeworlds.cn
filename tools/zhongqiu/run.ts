// 中秋活动 · 完整跑局模拟(从养成开始)
//
// 和 sim.ts 的区别:sim.ts 假设「终局配置从第 1 关就齐」,测的是**流派上限**;
// 这里模拟真实养成 —— 开局 5 选 2 → 每关奖励 3 选 1 → 商店买加成 → 用**当时的队伍**结算。
// 所以它回答的是「这条流派实际上能不能打通」,而不是「满配能打多远」。
//
// 速度:DP 按「卡 + 加成」缓存(不把队伍放进 key —— 队伍只影响计分,不影响掷骰策略),
// 因此每局 16 关 × 6 人只会建几十张表,单局毫秒级。
//
// 简化(写出来免得误读):
//   1. 商店按「买得起就买最贵的一张可用加成」的贪心策略,不模拟锁卡/刷新;
//   2. 选卡按「流派偏好」贪心(优先拿目标流派的卡),不模拟长期规划;
//   3. 经济按 roundReward 的近似曲线。

import {
	calcTeamTotal,
	calcTeeScore,
	collectSetOps,
	selfDiceMods,
	TARGETS,
	type ScoreInput
} from '../../src/lib/game';
import { BUFF_BY_ID, BUFF_CARDS, type AppliedBuff, type BuffCard } from '../../src/lib/items';
import { CARDS, CARD_BY_ID, drawCards, type Tag, type TeeCard } from '../../src/lib/teecards';
import { judgeRoll } from '../../src/lib/midautumn';
import {
	FILLS,
	makeOptimal,
	pack,
	unpack,
	countOf,
	SUBSETS,
	toDice,
	rnd
} from '../../src/lib/midautumn-dp';

type Skill = 'random' | 'sub' | 'opt';

/** 流派偏好:优先选什么卡 */
export interface Pref {
	name: string;
	/** 卡牌打分:越高越优先拿 */
	score: (c: TeeCard) => number;
	/** 加成卡打分 */
	buffScore?: (b: BuffCard) => number;
	/** 招牌加成卡 id:它也算「成型」的一部分(负分流的引擎有一半在逆月符上) */
	buffId?: string;
	/** 流派类别:tag 类靠"同 tag 人头"(需要 5 张);effect 类靠 2~3 张同效果卡 */
	family: 'tag' | 'effect';
}

/** 会改变「最优保留策略」的加成:改骰子/判定/等级下限/多投掷/逆向/统计点数/条件/和值类。
 *  纯 chips / 纯 mult / 队伍人数 / 月饼币 / 成长 / 卖卡 这类是「常数缩放」,
 *  V' = m·V + a 是单调变换,argmax 不变 → **不需要重建 DP**(实测 462 个状态零差异)。 */
const POLICY_CHANGING =
	/"(dice_mods|map_player_die|level_floor|extra_roll|reverse|own_face|face_floor|cond|sum_chips|sum_mult|per_reroll|player_die|on_player|straight_chips|straight_ladder|face_ladder|levelCap|noSameFace|self_mods|void|map)"/;
const isPolicyChanging = (id: string): boolean => {
	const b = BUFF_BY_ID.get(id);
	return !!b && POLICY_CHANGING.test(JSON.stringify(b.effect));
};

/** 固定种子的可复现随机(mulberry32):让不同轮次的表能互相对照(抽卡/掷骰/平局全覆盖) */
export const mulberry32 = (a: number) => () => {
	a = (a + 0x6d2b79f5) | 0;
	let t = Math.imul(a ^ (a >>> 15), 1 | a);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const seedHash = (key: string) => {
	let h = 2166136261;
	for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
	return h >>> 0;
};
/** 用 `${SEED}:${流派名}` 接管 Math.random —— 每条流派一条独立且固定的随机流 */
export const seedRandomFor = (key: string) => {
	Math.random = mulberry32(seedHash(`${process.env.SEED ?? '1'}:${key}`));
};

const dpCache = new Map<string, ReturnType<typeof makeOptimal>>();

/** 一个 Tee 在当前配置下的「掷一次」函数(DP 按 卡+加成 缓存) */
const makeRoller = (cardId: string | null, buffIds: string[], skill: Skill) => {
	const card = cardId ? CARD_BY_ID.get(cardId)! : null;
	// 只有「会改策略」的加成进 key:纯数值加成不重建表
	const policyBuffs = buffIds.filter(isPolicyChanging);
	const key = `${cardId ?? '-'}|${policyBuffs.join(',')}`;
	let dp = dpCache.get(key);
	if (!dp) {
		const self = card ? [{ eff: card.effect, srcId: card.id }] : [];
		const mods = selfDiceMods(self);
		dp = makeOptimal(mods, (st) => {
			const dice = toDice(st);
			return calcTeeScore({
				levelId: judgeRoll(dice, mods).id,
				self,
				allSelf: [],
				index: 0,
				teamCards: card ? [card] : [null],
				growth: {},
				buffs: policyBuffs.map((id) => ({ cardId: id, turnsLeft: 1 })),
				teamSize: 6,
				diceSum: dice.reduce((a, b) => a + b, 0),
				ownDice: dice,
				rerolled: 0,
				playerLevelId: judgeRoll(dice, mods).id,
				playerDice: dice
			}).total;
		});
		dpCache.set(key, dp);
	}
	const { bestKeep } = dp;
	const rolls = 2 + (card && card.effect.type === 'extra_roll' ? card.effect.count : 0);
	return () => {
		const c = new Array(7).fill(0);
		for (let k = 0; k < 6; k++) c[rnd()]++;
		let st = pack(c);
		for (let left = rolls; left > 1; left--) {
			let keep: number;
			if (skill === 'opt') keep = bestKeep(st, left);
			else if (skill === 'random') {
				const list = SUBSETS[st] ?? [st];
				keep = list[Math.floor(Math.random() * list.length)];
			} else {
				const counts = unpack(st);
				keep = counts[4] > 0 ? pack(counts.map((v, i) => (i === 4 ? v : 0))) : 0;
			}
			const cc = unpack(keep);
			for (let k = countOf(keep); k < 6; k++) cc[rnd()]++;
			st = pack(cc);
		}
		return toDice(st);
	};
};

interface TeamSlot {
	card: string | null;
	buffs: string[];
}

const scoreTeam = (
	team: TeamSlot[],
	round: number,
	coins: number,
	soldCount: number,
	rollers: (() => number[])[]
): number => {
	const cards = team.map((t) => (t.card ? CARD_BY_ID.get(t.card)! : null));
	const allSelf = cards.map((c) => (c ? [{ eff: c.effect, srcId: c.id }] : []));
	const scores: number[] = [];
	let total = 0;
	let prev = 0;
	team.forEach((t, i) => {
		const dice = rollers[i]();
		const self = allSelf[i];
		const buffs: AppliedBuff[] = t.buffs.map((id) => ({ cardId: id, turnsLeft: 1 }));
		const mods = i === 0 ? selfDiceMods(self, buffs) : selfDiceMods(self, buffs);
		const lid = judgeRoll(dice, mods).id;
		const input: ScoreInput = {
			levelId: lid,
			self,
			allSelf,
			index: i,
			teamCards: cards,
			growth: {},
			buffs,
			teamSize: team.length,
			diceSum: dice.reduce((a, b) => a + b, 0),
			ownDice: dice,
			rerolled: 0,
			playerLevelId: judgeRoll(dice, mods).id,
			playerDice: dice,
			coins,
			round,
			leftScore: prev,
			soldCount
		};
		const s = calcTeeScore(input).total;
		prev = s;
		scores.push(s);
		total += s;
	});
	// 全队总分必须走游戏里的公式:接力回流 + 全队倍率都在里面
	return calcTeamTotal(scores, cards).total;
};

export interface RunSimResult {
	name: string;
	/** 一局打通 16 关的概率(含主动技救命) */
	clearRate: number;
	/** 本局结束的中位关数 —— 注意游戏里没有「阵亡」,一关没达标就是本局结束(记分重开) */
	medianDeath: number;
	/** 平均第几关达成「流派成型」(5 张同流派/目标) */
	onlineRound: number;
	/** 平均每局用掉几次主动技(时轮 / 补分) */
	skillUses: number;
	/** 平均每局用掉几次时轮 */
	retryUses: number;
	/** 平均每局靠主动技救回的关卡数(本来会本局结束) */
	rescued: number;
	/** 各关「第一次掷就过」的概率(不含主动技)· 难度曲线 */
	passRate: number[];
}

const pickBest = <T>(opts: T[], score: (x: T) => number): T => {
	let best = opts[0];
	let bv = -Infinity;
	for (const o of opts) {
		const v = score(o);
		if (v > bv) {
			bv = v;
			best = o;
		}
	}
	return best;
};

/** 跑一局(从开局选卡开始) */
export const simulateFullRun = (
	pref: Pref,
	skill: Skill,
	trials: number,
	teamLimit = 6
): RunSimResult => {
	seedRandomFor(pref.name); // 固定种子:同 SEED 同流派 → 同结果
	/** 「成型」门槛:该流派卡池有多大,门槛就有多低。
	 *  固定写死 5 张只对 tag 类流派成立 —— 负分流全池只有 4 张,永远显示"从未成型"。 */
	const poolSize = CARDS.filter((c) => pref.score(c) > 50).length;
	const needOnline = pref.family === 'tag' ? 5 : Math.max(2, Math.min(3, poolSize));
	/** 该流派的招牌加成卡也算"成型"(负分流的引擎有一半在逆月符上) */
	const sigBuff = pref.buffId;
	const commons = CARDS.filter((c) => c.rarity === 'common');
	let cleared = 0;
	const deaths: number[] = [];
	const online: number[] = [];
	let skillUses = 0;
	let retryUses = 0;
	let rescued = 0;
	const passCnt = new Array<number>(TARGETS.length).fill(0);
	for (let t = 0; t < trials; t++) {
		// 开局:5 张普通里挑 2 张
		const draft = [...commons].sort(() => Math.random() - 0.5).slice(0, 5);
		const picked = [...draft].sort((a, b) => pref.score(b) - pref.score(a)).slice(0, 2);
		const team: TeamSlot[] = [
			{ card: null, buffs: [] },
			...picked.map((c) => ({ card: c.id, buffs: [] }))
		];
		let mooncakes = 0;
		let soldTotal = 0;
		let reached = 0;
		let onlineRound = 0;
		let alive = true;
		const buffStock: string[] = [];
		/** 主动技冷却:`槽位|卡id` → 剩余关数(换卡即视为新卡,从 0 开始) */
		const cdMap = new Map<string, number>();
		const cdLeft = (i: number, id: string) => cdMap.get(`${i}|${id}`) ?? 0;
		const useCd = (i: number, id: string, n: number) => cdMap.set(`${i}|${id}`, n);

		for (let r = 0; r < TARGETS.length && alive; r++) {
			for (const [k, v] of cdMap) if (v > 0) cdMap.set(k, v - 1); // 冷却按关推进
			mooncakes += 10 + 4 * r; // 近似 roundReward + 溢出奖励
			// 商店:买得起就买最贵的一张可用加成,挂给最需要的 Tee
			if (pref.buffScore) {
				const price = (b: BuffCard) => b.price;
				const affordable = BUFF_CARDS.filter((b) => b.price <= mooncakes);
				if (affordable.length) {
					const buy = pickBest(affordable, (b) => pref.buffScore!(b) * 100 - price(b));
					mooncakes -= buy.price;
					buffStock.push(buy.id);
				}
			}
			// 挂加成:平均分给队伍(简化)
			buffStock.forEach((id, k) => {
				const slot = team[k % team.length];
				if (slot && !slot.buffs.includes(id)) slot.buffs.push(id);
			});
			const rollers = team.map((s) => makeRoller(s.card, s.buffs, skill));
			const total = scoreTeam(team, r + 1, mooncakes, soldTotal, rollers);
			if (process.env.TRACE && pref.name === process.env.TRACE && t === 0) {
				const cards = team
					.filter((s) => s.card)
					.map((s) => `${CARD_BY_ID.get(s.card!)?.name}[${s.buffs.join('+')}]`)
					.join(' ');
				console.log(
					`  R${String(r + 1).padStart(2)} 队${team.length} 币${mooncakes} 分${total.toFixed(0).padStart(7)} / 目标${String(TARGETS[r]).padStart(6)}  ${cards}`
				);
			}
			// ---- 过关判定 + 主动技(掷完可发动) ----
			// 只在「这一关本来会失败」时才动技能,所以热路径(能过关时)零开销。
			const rawPass = total >= TARGETS[r];
			let passed = rawPass;
			if (rawPass) passCnt[r]++;
			if (!passed) {
				// ① 补分(chips / left_chips):能补满缺口才用,缺口从大往小凑
				const gap = TARGETS[r] - total;
				const cands: { i: number; id: string; value: number; cd: number }[] = [];
				team.forEach((s, i) => {
					if (!s.card) return;
					const e = CARD_BY_ID.get(s.card)?.effect;
					if (!e || e.type !== 'active' || (e.skill !== 'chips' && e.skill !== 'left_chips'))
						return;
					if (e.skill === 'left_chips' && i === 0) return; // 左边没人
					const v = e.value ?? 0;
					if (v > 0) cands.push({ i, id: s.card, value: v, cd: e.cooldown });
				});
				cands.sort((a, b) => b.value - a.value);
				let gain = 0;
				const used: typeof cands = [];
				for (const c of cands) {
					if (gain >= gap) break;
					if (cdLeft(c.i, c.id) > 0) continue;
					gain += c.value;
					used.push(c);
				}
				if (used.length && gain >= gap) {
					for (const c of used) {
						useCd(c.i, c.id, c.cd);
						skillUses++;
					}
					passed = true;
				}
			}
			// ② 时轮:本关重掷(全队分数清零,目标/Boss 不变)。掷骰本身无记忆,
			//    所以「重掷」= 用同一套 rollers 再算一次本关。
			for (let k = 0; !passed && k < 3; k++) {
				const slot = team.findIndex((s, i) => {
					const e = s.card ? CARD_BY_ID.get(s.card)?.effect : undefined;
					return !!e && e.type === 'active' && e.skill === 'retry' && cdLeft(i, s.card ?? '') <= 0;
				});
				if (slot < 0) break;
				const id = team[slot].card ?? '';
				const e = CARD_BY_ID.get(id)?.effect;
				if (!e || e.type !== 'active') break;
				useCd(slot, id, e.cooldown);
				skillUses++;
				retryUses++;
				const again = scoreTeam(team, r + 1, mooncakes, soldTotal, rollers);
				passed = again >= TARGETS[r];
			}
			if (passed) {
				if (!rawPass) rescued++;
				reached = r + 1;
			} else {
				alive = false;
				deaths.push(r + 1);
				break;
			}
			// 奖励:3 选 1
			const opts = drawCards(3);
			const take = pickBest(opts, pref.score);
			if (team.length < teamLimit) team.push({ card: take.id, buffs: [] });
			else {
				// 队伍满了:换掉最差的(按偏好),被换下的算"卖出"
				const worst = pickBest(team, (s) => -(s.card ? pref.score(CARD_BY_ID.get(s.card)!) : -999));
				if (take && (!worst.card || pref.score(take) > pref.score(CARD_BY_ID.get(worst.card)!))) {
					if (soldTotal < r + 1) soldTotal += 1;
					worst.card = take.id;
				}
			}
			if (!onlineRound) {
				const onFaction = (s: TeamSlot) =>
					(s.card ? pref.score(CARD_BY_ID.get(s.card)!) > 50 : false) ||
					(!!sigBuff && s.buffs.includes(sigBuff));
				if (team.filter(onFaction).length >= needOnline) onlineRound = r + 1;
			}
		}
		if (alive) cleared++;
		online.push(onlineRound || 17);
	}
	const sorted = [...deaths].sort((a, b) => a - b);
	return {
		name: pref.name,
		clearRate: cleared / trials,
		medianDeath: sorted.length ? sorted[sorted.length >> 1] : 0,
		onlineRound: online.reduce((a, b) => a + b, 0) / trials,
		skillUses: skillUses / trials,
		retryUses: retryUses / trials,
		rescued: rescued / trials,
		passRate: passCnt.map((n) => n / trials)
	};
};

// ---- 流派偏好定义 ----
const tagPref = (tag: Tag): Pref => ({
	name: `流派流(${tag})`,
	family: 'tag',
	score: (c) =>
		(c.tag === tag ? 100 : 0) + (c.rarity === 'legendary' ? 20 : c.rarity === 'rare' ? 10 : 0),
	buffScore: (b) => (b.tag === tag ? 10 : 1)
});

const effPref = (name: string, needles: string[], buffId?: string): Pref => ({
	name,
	family: 'effect',
	buffId,
	score: (c) => {
		const j = JSON.stringify(c.effect);
		const hit = needles.reduce((a, n) => a + (j.includes(n) ? 1 : 0), 0);
		return hit * 40 + (c.rarity === 'legendary' ? 20 : c.rarity === 'rare' ? 10 : 5);
	},
	buffScore: (b) => (buffId && b.id === buffId ? 10 : 1)
});

export const PREFS: Pref[] = [
	effPref('4 点基础', ['"face":4'], 'yuefu'),
	// 4 点不在这条线里:四点系是游戏主轴(见上面的「4 点基础」),
	// 真正的单点流是"把别的点数改造成某个点数"再吃 own_face/face_ladder
	...([1, 2, 3, 5, 6] as const).map((f) => effPref(`单点流(${f}点)`, [`"face":${f}`])),
	tagPref('月'),
	tagPref('灯'),
	tagPref('桂'),
	tagPref('兔'),
	tagPref('仙'),
	tagPref('饼'),
	effPref('负分流', ['"reverse"', '"void"'], 'niyuefu'),
	effPref('团队流', ['team_scale', 'team_chips', 'sell_scale']),
	effPref('连号流', ['straight_'], 'hebi'),
	effPref('加持流', ['per_buff'], 'yuefu'),
	effPref('经济流', ['economy', 'interest', 'coin_mult'], 'panlong'),
	effPref('成长流', ['growth_mult', 'scaling_mult']),
	effPref('重掷流', ['per_reroll', 'extra_roll']),
	effPref('复制流', ['copy_right']),
	effPref('支援流', ['neighbor', 'relay_left', 'relay_pct', 'team_mult'], 'hebi'),
	effPref('主 Tee 联动', ['on_player', 'player_die']),
	effPref('主 Tee 流', ['map_player_die'], 'yueyachi'),
	effPref('和值流', ['sum_chips', 'sum_mult']),
	{
		name: '通用最强',
		score: (c) => (c.rarity === 'legendary' ? 30 : c.rarity === 'rare' ? 20 : 10)
	}
];

if (import.meta.main) {
	const trials = Number(process.env.TRIALS ?? 60);
	const skill = (process.env.SKILL ?? 'opt') as Skill;
	const maxWorkers = Number(process.env.WORKERS ?? 0); // 0 = 用满 CPU
	console.log(
		`完整跑局模拟(含养成)· ${PREFS.length} 条流派 × ${trials} 局 · 打法 ${skill} · 种子 ${process.env.SEED ?? '1'} · 目标 R16=${TARGETS[15]}\n`
	);
	const t0 = Date.now();
	const results: (RunSimResult | null)[] = new Array(PREFS.length).fill(null);

	// 多线程:一条流派一个 worker(Bun 原生跑 TS worker)
	const useWorkers = process.env.WORKERS !== '0';
	if (useWorkers) {
		const cpu =
			maxWorkers || (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 8;
		console.log(`(并行:${cpu} 个 worker)\n`);
		const queue = PREFS.map((_, i) => i);
		const workers: Worker[] = [];
		let done = 0;
		await new Promise<void>((resolve) => {
			const spawn = () => {
				const next = queue.shift();
				if (next === undefined) {
					if (done === PREFS.length) resolve();
					return;
				}
				const w = new Worker(new URL('./run-worker.ts', import.meta.url).href);
				workers.push(w);
				w.onmessage = (e: MessageEvent<{ i: number; r?: RunSimResult; error?: string }>) => {
					done++;
					if (e.data.r) results[e.data.i] = e.data.r;
					else console.error(`流派 #${e.data.i} 出错: ${e.data.error}`);
					w.terminate();
					if (done === PREFS.length) resolve();
					else spawn();
				};
				w.postMessage({ i: next, skill, trials });
			};
			for (let k = 0; k < Math.min(cpu, PREFS.length); k++) spawn();
		});
	} else {
		PREFS.forEach((p, i) => (results[i] = simulateFullRun(p, skill, trials)));
	}

	const WALL = 12; // R13 = 目标曲线的墙
	console.log(
		'流派'.padEnd(16) +
			'通关率'.padStart(8) +
			`R${WALL + 1}一次过`.padStart(10) +
			'救回/局'.padStart(9) +
			'时轮/局'.padStart(9) +
			'中位结束'.padStart(10) +
			'  流派成型'
	);
	for (let i = 0; i < PREFS.length; i++) {
		const r = results[i];
		if (!r) continue;
		console.log(
			r.name.padEnd(16) +
				`${(r.clearRate * 100).toFixed(0)}%`.padStart(8) +
				`${((r.passRate[WALL] ?? 0) * 100).toFixed(0)}%`.padStart(10) +
				r.rescued.toFixed(2).padStart(9) +
				r.retryUses.toFixed(2).padStart(9) +
				(r.medianDeath ? `R${r.medianDeath}` : '—').padStart(10) +
				`        ${r.onlineRound < 17 ? `R${r.onlineRound.toFixed(1)}` : '从未成型'}`
		);
	}
	// 难度曲线:全流派在各关的「第一次掷就过」率(重掷/技能都不帮忙)
	const lv = [0, 4, 7, 10, 12, 15];
	const rows = results.filter((r): r is RunSimResult => !!r);
	console.log(
		'\n一次过率(占全部开局 · 含没活到那关的失败局): ' +
			lv
				.map((k) => {
					const v = rows.reduce((a, r) => a + (r.passRate[k] ?? 0), 0) / (rows.length || 1);
					return `R${k + 1}=${(v * 100).toFixed(0)}%`;
				})
				.join('  ')
	);
	console.log(`\n耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
