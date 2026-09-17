// 中秋活动的**数值引擎**:掷骰状态打包 + 最优保留策略的 DP。
//
// 2025-09 从 tools/zhongqiu/engine.ts 抽到 src/lib —— 游戏侧(提示/AI/Boss 平衡)
// 与模拟器/平衡工具都用这一份,避免"两边各写一套、靠注释提醒保持一致"。
// tools/zhongqiu/engine.ts 现在是本文件的一层 re-export,老工具不用改。

/**
 * 博饼判定/最优打法引擎(从 balance.ts 抽出来,给 balance.ts 与 boss.ts 共用)
 *
 * 状态编码:手牌 = 6 个点数的计数 c[1..6],打包成 4 bit/位(每位数不会超过 12),
 * 于是「保留 + 重掷结果」就是一次普通整数加法(无进位),这是整个脚本的性能关键。
 *
 * **必须与 src/lib/midautumn.ts 的 judgeRoll/applyDiceMods 保持一致** ——
 * 这里只重写「怎么掷」(策略与枚举),判定与计分一律调用游戏本体的函数。
 */
import { ROLL_LEVELS, getRollLevel, judgeRoll, type DiceMods } from './midautumn';

export const pack = (c: number[]) =>
	c[1] | (c[2] << 4) | (c[3] << 8) | (c[4] << 12) | (c[5] << 16) | (c[6] << 20);
export const NIB = (x: number, v: number) => (x >> (4 * (v - 1))) & 15;

export function unpack(e: number): number[] {
	const c = new Array(7).fill(0);
	for (let v = 1; v <= 6; v++) c[v] = NIB(e, v);
	return c;
}

export const countOf = (e: number) =>
	NIB(e, 1) + NIB(e, 2) + NIB(e, 3) + NIB(e, 4) + NIB(e, 5) + NIB(e, 6);

export function toDice(e: number): number[] {
	const out: number[] = [];
	for (let v = 1; v <= 6; v++) {
		const n = NIB(e, v);
		for (let i = 0; i < n; i++) out.push(v);
	}
	return out;
}

/** 掷 need 颗骰子的全部结果(打包编码)。need = 0 时只有一种结果(空)。 */
export const FILLS: number[][] = (() => {
	const out: number[][] = [];
	for (let need = 0; need <= 6; need++) {
		const list: number[] = [];
		const cur = new Array(need).fill(1);
		while (true) {
			const c = new Array(7).fill(0);
			for (const v of cur) c[v]++;
			list.push(pack(c));
			let i = need - 1;
			while (i >= 0 && cur[i] === 6) {
				cur[i] = 1;
				i--;
			}
			if (i < 0) break;
			cur[i]++;
		}
		out.push(list);
	}
	return out;
})();

/** 该手牌的全部「保留子集」(去重,打包编码) */
export const SUBSETS: (number[] | undefined)[] = (() => {
	const N = 1 << 24;
	const out: (number[] | undefined)[] = new Array(N);
	for (let e = 0; e < N; e++) {
		const n = countOf(e);
		if (n === 0 || n > 6) continue;
		const c = unpack(e);
		const opts: number[] = [];
		const rec = (v: number, acc: number[]) => {
			if (v === 7) {
				opts.push(pack(acc));
				return;
			}
			for (let k = 0; k <= c[v]; k++) {
				const nxt = acc.slice();
				nxt[v] = k;
				rec(v + 1, nxt);
			}
		};
		rec(1, new Array(7).fill(0));
		out[e] = opts;
	}
	return out;
})();

/** 全部「6 颗骰子」的多重集及其概率(462 个状态,而不是 46656 个有序结果) */
export const DIST6: [number, number][] = (() => {
	const cnt = new Map<number, number>();
	const cur = [1, 1, 1, 1, 1, 1];
	while (true) {
		const c = new Array(7).fill(0);
		for (const v of cur) c[v]++;
		const e = pack(c);
		cnt.set(e, (cnt.get(e) ?? 0) + 1);
		let i = 5;
		while (i >= 0 && cur[i] === 6) {
			cur[i] = 1;
			i--;
		}
		if (i < 0) break;
		cur[i]++;
	}
	return [...cnt.entries()].map(([e, n]) => [e, n / 46656] as [number, number]);
})();

// ---------- 核心期望值 ----------

// ---------- 核心期望值 ----------

export const scoreCache = new Map<number, number>();
export function scoreOf(e: number, mods?: DiceMods): number {
	if (!mods) {
		const hit = scoreCache.get(e);
		if (hit !== undefined) return hit;
	}
	const v = getRollLevel(judgeRoll(toDice(e), mods).id).score;
	if (!mods) scoreCache.set(e, v);
	return v;
}

/** E_final(keep): 留 keep,其余重掷一次之后的期望分 */
export function makeExpectedFinal(
	mods?: DiceMods,
	scoreFn: (e: number) => number = (e) => scoreOf(e, mods)
) {
	const own = new Map<number, number>();
	return (keep: number): number => {
		const hit = own.get(keep);
		if (hit !== undefined) return hit;
		const list = FILLS[6 - countOf(keep)];
		let sum = 0;
		for (const f of list) sum += scoreFn(keep + f);
		const v = sum / list.length;
		own.set(keep, v);
		return v;
	};
}

/**
 * 最优打法:V(state, rollsLeft) = 还能掷 rollsLeft 次时的最优期望分。
 * rollsLeft = 1 表示这是最后一次:直接掷满,不再保留。
 */
export function makeOptimal(mods?: DiceMods, scoreFn?: (e: number) => number) {
	const EFinal = makeExpectedFinal(mods, scoreFn);
	const memo = new Map<number, number>();
	const N = 1 << 24;

	const V = (st: number, rollsLeft: number): number => {
		if (rollsLeft <= 1) return EFinal(st);
		const mk = rollsLeft * N + st;
		const hit = memo.get(mk);
		if (hit !== undefined) return hit;
		let best = -1;
		for (const keep of SUBSETS[st] ?? []) {
			const list = FILLS[6 - countOf(keep)];
			let sum = 0;
			for (const f of list) sum += V(keep + f, rollsLeft - 1);
			const v = sum / list.length;
			if (v > best) best = v;
		}
		memo.set(mk, best);
		return best;
	};

	/** 最优策略下该保留什么(平局偏向多留,更符合直觉)。状态只有几百种,记忆化 */
	const keepMemo = new Map<number, number>();
	const bestKeep = (st: number, rollsLeft: number): number => {
		const kk = rollsLeft * N + st;
		const cached = keepMemo.get(kk);
		if (cached !== undefined) return cached;
		let bestVal = -1;
		let bestState = st;
		let bestN = -1;
		for (const keep of SUBSETS[st] ?? []) {
			const list = FILLS[6 - countOf(keep)];
			let sum = 0;
			for (const f of list) sum += V(keep + f, rollsLeft - 1);
			const v = sum / list.length;
			const n = countOf(keep);
			if (v > bestVal + 1e-9 || (Math.abs(v - bestVal) <= 1e-9 && n > bestN)) {
				bestVal = v;
				bestState = keep;
				bestN = n;
			}
		}
		keepMemo.set(kk, bestState);
		return bestState;
	};

	return { V, bestKeep };
}

/** 投掷 rolls 次的期望分(最优打法) */
export function expectedScore(rolls: number, mods?: DiceMods): number {
	const { V } = makeOptimal(mods);
	let sum = 0;
	for (const [e, p] of DIST6) sum += V(e, rolls) * p;
	return sum;
}

export const rnd = () => 1 + Math.floor(Math.random() * 6);

/** 蒙特卡洛:最优打法下最终等级的分布 */
export function levelDistribution(rolls: number, samples: number, mods?: DiceMods) {
	const { V, bestKeep } = makeOptimal(mods);
	const dist = new Map<string, number>();
	for (let i = 0; i < samples; i++) {
		const c = new Array(7).fill(0);
		for (let k = 0; k < 6; k++) c[rnd()]++;
		let st = pack(c);
		for (let left = rolls; left > 1; left--) {
			const keep = bestKeep(st, left);
			const cc = unpack(keep);
			for (let k = countOf(keep); k < 6; k++) cc[rnd()]++;
			st = pack(cc);
		}
		const id = judgeRoll(toDice(st), mods).id;
		dist.set(id, (dist.get(id) ?? 0) + 1);
	}
	for (const [k, v] of dist) dist.set(k, v / samples);
	return dist;
}
