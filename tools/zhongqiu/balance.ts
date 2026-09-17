import { ROLL_LEVELS, getRollLevel, judgeRoll, type DiceMods } from '../../src/lib/midautumn';
import {
	pack,
	NIB,
	unpack,
	countOf,
	toDice,
	FILLS,
	DIST6,
	scoreOf,
	makeOptimal,
	expectedScore,
	rnd,
	levelDistribution
} from './engine';

/** 最优打法下,最终 6 颗骰子的点数直方图 + 改点类卡的价值 */
function finalDiceStats(rolls: number, samples: number, mods?: DiceMods) {
	const { V, bestKeep } = makeOptimal(mods);
	const hist = new Array(7).fill(0);
	const vals: number[] = []; // 最终手牌的等级分
	let sumSet4 = 0;
	let sumSetAny = 0;
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
		const dice = toDice(st);
		for (const d of dice) hist[d]++;
		const base = scoreOf(st, mods);
		vals.push(base);
		// 把 1 颗骰子改成 4 / 任意点,取最优的那一颗
		let b4 = base;
		let bAny = base;
		for (let i2 = 0; i2 < 6; i2++) {
			const saved = dice[i2];
			dice[i2] = 4;
			b4 = Math.max(b4, getRollLevel(judgeRoll(dice, mods).id).score);
			for (let v = 1; v <= 6; v++) {
				dice[i2] = v;
				bAny = Math.max(bAny, getRollLevel(judgeRoll(dice, mods).id).score);
			}
			dice[i2] = saved;
		}
		sumSet4 += b4;
		sumSetAny += bAny;
		void V;
	}
	const n = samples;
	const mean = vals.reduce((a, b) => a + b, 0) / n;
	return {
		hist: hist.map((h) => h / (n * 6)),
		meanScore: mean,
		set4: sumSet4 / n,
		setAny: sumSetAny / n
	};
}

// ---------- 报告 ----------

const fmt = (n: number, d = 2) => n.toFixed(d);
const pct = (p: number) => (p * 100 < 0.01 && p > 0 ? '<0.01%' : (p * 100).toFixed(2) + '%');

const only = process.argv[2] ?? '';

console.log('='.repeat(76));
console.log('中秋博饼 概率/数值报告');
console.log('='.repeat(76));

// ---- 1. 单次掷骰 ----
const single = new Map<string, number>();
for (const [e, p] of DIST6) {
	const id = judgeRoll(toDice(e)).id;
	single.set(id, (single.get(id) ?? 0) + p);
}
const exp1 = ROLL_LEVELS.reduce((s, l) => s + (single.get(l.id) ?? 0) * l.score, 0);

console.log('\n【1】单次掷骰各等级概率\n');
console.log(
	'  ' + '等级'.padEnd(18) + '概率'.padStart(9) + '分'.padStart(7) + '  期望贡献'.padStart(11)
);
for (const lvl of ROLL_LEVELS) {
	const p = single.get(lvl.id) ?? 0;
	console.log(
		`  ${lvl.emoji} ${lvl.name}`.padEnd(20) +
			pct(p).padStart(9) +
			String(lvl.score).padStart(7) +
			'  ' +
			fmt(p * lvl.score, 2).padStart(9)
	);
}
console.log(`  ${'单次期望分'.padEnd(18)}${fmt(exp1, 1).padStart(9)}`);

// ---- 2. 投掷次数 ----
console.log('\n【2】投掷次数 vs 期望分(每次之间可自选保留哪些骰子,最优打法)\n');
const expByRolls: number[] = [];
const maxRolls = only === 'rolls' ? 3 : 4;
for (let r = 1; r <= maxRolls; r++) {
	const t = Date.now();
	const e = expectedScore(r);
	expByRolls[r] = e;
	console.log(
		`  ${r} 次投掷: 期望分 ${fmt(e, 1).padStart(8)}   累计 ×${fmt(e / exp1).padStart(6)}` +
			(r > 1 ? `   边际 ×${fmt(e / expByRolls[r - 1])}` : '') +
			`   [${Date.now() - t}ms]`
	);
}
console.log('\n  → 边际倍数就是「多给 1 次投掷」的定价依据');

if (only === 'rolls') process.exit(0);

// ---- 3. 条件概率 ----
console.log('\n【3】等级门槛触发概率(条件卡定价用)\n');
const SAMPLES = Number(process.env.SAMPLES ?? 60000);
const dists: Record<number, Map<string, number>> = {};
for (const r of [1, 2, 3]) dists[r] = levelDistribution(r, SAMPLES);

const ORDER = ROLL_LEVELS.map((l) => l.id);
const idxOf = (id: string) => ORDER.indexOf(id);
const thresh: [string, string][] = [
	['状元插金花', 'zhuang_yuan_chajinhua'],
	['六博红', 'liu_bo_hong'],
	['六博黑', 'liu_bo_hei'],
	['五王', 'wu_wang'],
	['五子登科', 'wu_zi'],
	['状元及以上', 'zhuang_yuan'],
	['对堂及以上', 'dui_tang'],
	['三红及以上', 'san_hong'],
	['四进及以上', 'si_jin'],
	['二举及以上', 'er_ju'],
	['一秀及以上', 'yi_xiu'],
	['再接再厉', 'none']
];
console.log(
	'  ' + '门槛'.padEnd(14) + '1 次'.padStart(9) + '2 次'.padStart(9) + '3 次'.padStart(9)
);
for (const [label, id] of thresh) {
	const row = [1, 2, 3].map((r) => {
		const cut = idxOf(id);
		let p = 0;
		for (const [lid, pr] of dists[r]) {
			if (id === 'none' ? lid === 'none' : idxOf(lid) <= cut) p += pr;
		}
		return pct(p);
	});
	console.log('  ' + label.padEnd(14) + row.map((s) => s.padStart(9)).join(''));
}

// ---- 4. 等级分布 ----
for (const r of [2, 3]) {
	console.log(`\n【4.${r}】${r} 次投掷的最终等级分布\n`);
	console.log('  ' + '等级'.padEnd(18) + '概率'.padStart(9));
	for (const lvl of ROLL_LEVELS) {
		console.log(
			`  ${lvl.emoji} ${lvl.name}`.padEnd(20) + pct(dists[r].get(lvl.id) ?? 0).padStart(9)
		);
	}
}

// ---- 5. chips vs mult ----
console.log('\n【5】chips 与 mult 的收益对比(等级分越高,+固定值越亏)\n');
const LV = [10, 20, 40, 80, 160, 320, 480, 640, 960, 1280, 2560];
console.log(
	'  ' +
		'等级分'.padStart(7) +
		'+30'.padStart(9) +
		'+60'.padStart(9) +
		'+100'.padStart(9) +
		'+200'.padStart(9) +
		'  ×1.5'.padStart(9) +
		'  ×2'.padStart(9) +
		'  ×3'.padStart(9)
);
for (const base of LV) {
	const row = [30, 60, 100, 200].map((c) => `×${fmt((base + c) / base)}`);
	const mults = [1.5, 2, 3].map((m) => `×${fmt(m)}`);
	console.log(
		'  ' +
			String(base).padStart(7) +
			row.map((s) => s.padStart(9)).join('') +
			mults.map((s) => s.padStart(9)).join('')
	);
}
console.log('\n  结论:单次期望 21.5 分时 +60 ≈ ×3.8,但等级分到 320 时 +60 只剩 ×1.19;');
console.log('        ×mult 的收益与等级分无关,是后期唯一不衰减的乘区。\n');

// ---- 6. 骰子构成与改点卡价值 ----
if (only === 'mods' || only === '') {
	console.log('\n【6】最优打法下最终骰子的点数分布(2 次投掷)\n');
	const st2 = finalDiceStats(2, 30000);
	console.log('  ' + [1, 2, 3, 4, 5, 6].map((v) => `${v}点`.padStart(8)).join(''));
	console.log(
		'  ' +
			st2.hist
				.slice(1)
				.map((h) => pct(h).padStart(8))
				.join('')
	);
	console.log(`\n  最终手牌平均等级分: ${fmt(st2.meanScore, 1)}`);
	console.log(
		`  改 1 颗为 4 点后:   ${fmt(st2.set4, 1)}  (×${fmt(st2.set4 / st2.meanScore)}, 即嫦娥的价值)`
	);
	console.log(
		`  改 1 颗为任意点后:  ${fmt(st2.setAny, 1)}  (×${fmt(st2.setAny / st2.meanScore)}, 即吴刚的价值)`
	);
	console.log(
		'\n  注:这两个数是「先按无改点策略打,再改点」的下界;实际玩家会为改点调整保留策略,真实价值更高。'
	);
}

// ---- 7. 组合:多掷 + 改点 ----
if (only === '') {
	console.log('\n【7】不同投掷次数下,改 1 颗为 4 点的价值\n');
	for (const r of [1, 2, 3]) {
		const st = finalDiceStats(r, 20000);
		console.log(
			`  ${r} 次投掷: 基准 ${fmt(st.meanScore, 1).padStart(8)} → 改 4 点 ${fmt(st.set4, 1).padStart(8)}` +
				`  净增 ×${fmt(st.set4 / st.meanScore)}`
		);
	}
}

// ---------- 8. 卡牌估值(用等级分布直接算每张卡的等效倍率) ----------
if (only === 'cards' || only === '') {
	const { CARDS, condHit, LEVEL_LADDER } = await import('../../src/lib/teecards');
	const { BUFF_CARDS } = await import('../../src/lib/items');
	const dist = dists[2] ?? levelDistribution(2, 40000);
	const LV = expByRolls[2] ?? expectedScore(2);
	const ROLL = (expByRolls[3] ?? expectedScore(3)) / LV;

	const pOf = (cond: string) => {
		let p = 0;
		for (const [lid, pr] of dist) {
			const lvl = getRollLevel(lid);
			if (condHit(cond as never, lid, lvl.score)) p += pr;
		}
		return p;
	};

	const evMult = (chips: number, mult: number, times = 1) => (((LV + chips) / LV) * mult) ** times;

	/** 一张卡的等效倍率(按 2 次投掷的等级分布算,teamSize 固定 6) */
	const evOf = (eff: any, teamSize = 6): number | null => {
		switch (eff.type) {
			case 'chips':
				return (LV + eff.value) / LV;
			case 'mult':
				return eff.value;
			case 'chips_mult':
				return ((LV + eff.chips) / LV) * eff.mult;
			case 'team_mult':
				return eff.value;
			case 'team_chips':
				return (LV + eff.value) / LV;
			case 'per_team_chips':
				return (LV + eff.value * teamSize) / LV;
			case 'extra_roll':
				return ROLL ** eff.count;
			case 'set_point':
				return eff.point === 4 ? 2.9 ** eff.count : 1.35 ** eff.count;
			case 'set_any':
				return 4.48 ** eff.count;
			case 'level_up': {
				let m = 0;
				for (const [lid, pr] of dist) {
					const i = LEVEL_LADDER.indexOf(lid as never);
					const up = LEVEL_LADDER[Math.min(LEVEL_LADDER.length - 1, i + eff.count)];
					m += pr * (getRollLevel(up).score / Math.max(1, getRollLevel(lid).score));
				}
				return m;
			}
			case 'cond': {
				const p = pOf(eff.cond);
				const add = eff.chips ? eff.chips / LV : 0;
				const mul = eff.mult ?? 1;
				return 1 + p * ((1 + add) * mul - 1);
			}
			case 'copy_right':
				return 1.6; // 复制右侧一张平均水平的卡
			case 'sum_chips':
				return (LV + eff.per * 22) / LV; // 约用最优打法下的平均和值 22
			case 'neighbor':
				// 单个目标的 EV;both 的「两个目标」由 teamEV 那边放大
				return evMult(eff.chips ?? 0, eff.mult ?? 1);
			case 'per_buff':
				return eff.as === 'chips' ? (LV + eff.per * 2) / LV : Math.pow(eff.per, 2);
			case 'per_tag':
				return eff.as === 'chips' ? (LV + eff.per * 3) / LV : Math.pow(eff.per, 3);
			case 'on_player': {
				const p = pOf(eff.cond);
				const add = eff.chips ? eff.chips / LV : 0;
				return 1 + p * ((1 + add) * (eff.mult ?? 1) - 1);
			}
			case 'player_die': {
				const n = eff.face === 4 ? 1.5 : 0.85;
				return 1 + ((eff.chips ?? 0) * n) / LV;
			}
			case 'bundle':
				return eff.parts.reduce((a: number, p: any) => a * (evOf(p, teamSize) ?? 1), 1);
			default:
				return null; // 经济类 / self_mods / copy_right / reroll_all: 不在分数 EV 里
		}
	};

	/** 队伍总影响: 单 Tee 效果只占 1/队伍人数,全队效果直接生效 */
	const TEAM = 6;
	const TEAM_WIDE = new Set(['team_mult', 'team_chips']);
	const isTeamWide = (eff: any): boolean =>
		eff.type === 'bundle' ? eff.parts.some(isTeamWide) : TEAM_WIDE.has(eff.type);
	/**
	 * 队伍总影响 = 1 + Σ(受影响的 Tee 数 × (该部分 EV - 1)) / 队伍人数
	 *   自身效果 → 影响 1 个 Tee
	 *   相邻支援 → 影响 1 个(单侧)或 2 个(左右两侧)
	 *   全队效果 → 影响全部 6 个
	 * 复合卡(bundle)按部分分别累计 —— 之前把它当成「一个自身效果」会算错。
	 */
	/**
	 * 队伍总影响 = 1 + Σ(受影响 Tee 数 × (该组倍率 - 1)) / 队伍人数
	 *
	 * 关键:按「作用于谁」分组 —— 落在同一批目标上的多个乘区要**连乘**
	 * (嫦娥奔月 = 改两颗为4 再 ×0.5,是两个乘区叠在同一个 Tee 上),
	 * 而作用在不同目标上才是相加(并蒂莲给两边 + 自己留一点)。
	 */
	const teamEV = (eff: any): number | null => {
		const groups = new Map<string, { targets: number; mult: number }>();
		const add = (key: string, targets: number, ev: number) => {
			const g = groups.get(key) ?? { targets, mult: 1 };
			g.mult *= ev;
			groups.set(key, g);
		};
		let any = false;
		const walk = (e: any) => {
			if (e.type === 'bundle') {
				e.parts.forEach(walk);
				return;
			}
			const ev = evOf(e);
			if (ev === null) return;
			any = true;
			if (TEAM_WIDE.has(e.type) || (e.type === 'on_player' && e.teamWide)) add('team', TEAM, ev);
			else if (e.type === 'neighbor') add('nb', e.side === 'both' ? 2 : 1, ev);
			else add('self', 1, ev);
		};
		walk(eff);
		if (!any) return null;
		let units = 0;
		for (const g of groups.values()) units += g.targets * (g.mult - 1);
		return 1 + units / TEAM;
	};

	const rows = CARDS.map((c) => ({
		id: c.id,
		name: c.name,
		rarity: c.rarity,
		ev: evOf(c.effect),
		tev: teamEV(c.effect)
	}));
	const BANDS: Record<string, [number, number]> = {
		common: [1.05, 1.13],
		rare: [1.15, 1.25],
		legendary: [1.28, 1.45]
	};
	const byR: Record<string, number[]> = { common: [], rare: [], legendary: [] };
	for (const r of rows) if (r.tev !== null) byR[r.rarity].push(r.tev as number);

	console.log('\n【8】卡牌估值(队伍总影响 = 单 Tee 效果按 1/6 折算到全队总分)\n');
	console.log('  目标区间: 普通 1.05~1.13 / 稀有 1.15~1.25 / 传说 1.28~1.45\n');
	for (const [r, list] of Object.entries(byR)) {
		const avg = list.reduce((a, b) => a + b, 0) / Math.max(1, list.length);
		const out = list.filter((v) => v < BANDS[r][0] || v > BANDS[r][1]).length;
		console.log(
			`  ${r.padEnd(10)} n=${String(list.length).padStart(2)}  平均 ${fmt(avg)}  ` +
				`区间 ${fmt(Math.min(...list))}~${fmt(Math.max(...list))}  越界 ${out}`
		);
	}
	console.log('\n  越界明细:');
	for (const r of rows) {
		if (r.tev === null) {
			console.log(`    ${r.name.padEnd(10)} ${r.rarity.padEnd(10)} —(经济/成长/技术类,不计分 EV)`);
			continue;
		}
		const [lo, hi] = BANDS[r.rarity];
		if (r.tev < lo || r.tev > hi) {
			console.log(
				`    ${r.name.padEnd(10)} ${r.rarity.padEnd(10)} 队伍影响 ${fmt(r.tev)}  ` +
					`${r.tev > hi ? '偏强 +' + fmt(((r.tev - hi) / hi) * 100, 0) + '%' : '偏弱 ' + fmt(((r.tev - lo) / lo) * 100, 0) + '%'}`
			);
		}
	}
	console.log('\n  偏离同稀有度均值最多的卡:');
	const allAvg =
		rows.reduce((a, b) => a + (b.ev ?? 0), 0) / rows.filter((r) => r.ev !== null).length;
	void allAvg;

	// 加成卡
	const bRows = BUFF_CARDS.map((c) => ({ name: c.name, rarity: c.rarity, ev: evOf(c.effect) }));
	const bByR: Record<string, number[]> = { common: [], rare: [], legendary: [] };
	for (const r of bRows) if (r.ev !== null) bByR[r.rarity].push(r.ev);
	console.log('\n  加成卡(可叠加,故按单 Tee EV 看;含持续回合的价值未折算):');
	const BB: Record<string, [number, number]> = {
		common: [1.25, 1.65],
		rare: [1.65, 2.5],
		legendary: [2.4, 4.6]
	};
	for (const [r, list] of Object.entries(bByR)) {
		if (!list.length) continue;
		const avg = list.reduce((a, b) => a + b, 0) / list.length;
		const out = list.filter((v) => v < BB[r][0] || v > BB[r][1]).length;
		console.log(
			`  ${r.padEnd(10)} n=${String(list.length).padStart(2)}  平均 ${fmt(avg)}  区间 ${fmt(Math.min(...list))}~${fmt(Math.max(...list))}  越界 ${out}`
		);
	}
	console.log('\n  加成卡越界明细:');
	for (const r of bRows) {
		if (r.ev === null) {
			console.log(`    ${r.name.padEnd(10)} ${r.rarity.padEnd(10)} —(改点/点数变换/多投掷类)`);
			continue;
		}
		const [lo, hi] = BB[r.rarity];
		if (r.ev < lo || r.ev > hi) {
			console.log(
				`    ${r.name.padEnd(10)} ${r.rarity.padEnd(10)} EV=${fmt(r.ev)}  ${r.ev > hi ? '偏强 +' + fmt(((r.ev - hi) / hi) * 100, 0) + '%' : '偏弱 ' + fmt(((r.ev - lo) / lo) * 100, 0) + '%'}`
			);
		}
	}
}

// ---------- 9. 强度曲线 vs 目标曲线 ----------
if (only === 'power' || only === '') {
	const { CARDS, condHit } = await import('../../src/lib/teecards');
	const { BUFF_CARDS } = await import('../../src/lib/items');
	const { roundTarget, roundReward, TEAM_LIMIT } = await import('../../src/lib/game');
	if (!dists[2]) dists[2] = levelDistribution(2, 20000);

	const LV = expByRolls[2] ?? expectedScore(2); // 2 次投掷的平均等级分
	const LV3 = expByRolls[3] ?? expectedScore(3);

	// 单卡自身 EV(不含队伍折算)
	const selfEV = (eff: any): number => {
		switch (eff.type) {
			case 'chips':
				return (LV + eff.value) / LV;
			case 'mult':
				return eff.value;
			case 'chips_mult':
				return ((LV + eff.chips) / LV) * eff.mult;
			case 'team_mult':
				return 1; // 全队卡单独算
			case 'team_chips':
				return (LV + eff.value) / LV;
			case 'per_team_chips':
				return (LV + eff.value * TEAM_LIMIT) / LV;
			case 'extra_roll':
				return (LV3 / LV) ** eff.count;
			case 'set_point':
				return eff.point === 4 ? 2.9 ** eff.count : 1.35 ** eff.count;
			case 'set_any':
				return 4.48 ** eff.count;
			case 'copy_right':
				return 1.6;
			case 'bump_point':
				return 1.3 ** eff.count;
			case 'straight_ladder':
				return 1.04;
			case 'straight_chips':
				return (LV + eff.per * 3.4) / LV;
			case 'sum_chips':
				return (LV + eff.per * 22) / LV;
			case 'neighbor':
				return ((LV + (eff.chips ?? 0)) / LV) * (eff.mult ?? 1);
			case 'per_buff':
				return eff.as === 'chips' ? (LV + eff.per * 2) / LV : Math.pow(eff.per, 2);
			case 'per_tag':
				return eff.as === 'chips' ? (LV + eff.per * 3) / LV : Math.pow(eff.per, 3);
			case 'on_player': {
				const pc = pOf2(eff.cond);
				return 1 + pc * ((1 + (eff.chips ? eff.chips / LV : 0)) * (eff.mult ?? 1) - 1);
			}
			case 'player_die':
				return 1 + ((eff.chips ?? 0) * (eff.face === 4 ? 1.5 : 0.85)) / LV;
			case 'cond': {
				const p = pOf2(eff.cond);
				const add = eff.chips ? eff.chips / LV : 0;
				return 1 + p * ((1 + add) * (eff.mult ?? 1) - 1);
			}
			case 'bundle':
				return eff.parts.reduce((a: number, q: any) => a * Math.max(1, selfEV(q)), 1);
			default:
				return 1;
		}
	};
	function pOf2(cond: string) {
		let p = 0;
		for (const [lid, pr] of dists[2] ?? []) {
			if (condHit(cond as never, lid, getRollLevel(lid).score)) p += pr;
		}
		return p;
	}

	// 按稀有度权重抽卡的真实分布(免费 3 选 1 = best of 3)
	const W: Record<string, number> = { common: 7, rare: 3, legendary: 1 };
	const pickOne = () => {
		const tot = CARDS.reduce((a, c) => a + W[c.rarity], 0);
		let r = Math.random() * tot;
		for (const c of CARDS) {
			r -= W[c.rarity];
			if (r <= 0) return selfEV(c.effect);
		}
		return 1;
	};
	const drawBest = (n = 30000) => {
		let s = 0;
		for (let i = 0; i < n; i++) s += Math.max(pickOne(), pickOne(), pickOne());
		return s / n;
	};
	const CARD_EV = drawBest();
	// 商店加成卡:同样按权重抽 3 张买最好的,再乘稀有度
	const buffPool = BUFF_CARDS.map((b) => ({ r: b.rarity, ev: Math.max(1, selfEV(b.effect)) }));
	const pickBuff = () => {
		const tot = buffPool.reduce((a, c) => a + W[c.r], 0);
		let r = Math.random() * tot;
		for (const c of buffPool) {
			r -= W[c.r];
			if (r <= 0) return c.ev;
		}
		return 1;
	};
	let buffEV = 0;
	for (let i = 0; i < 20000; i++) buffEV += Math.max(pickBuff(), pickBuff(), pickBuff());
	buffEV /= 20000;
	const teamCards = CARDS.filter((c) => c.effect.type === 'team_mult').map((c) => ({
		n: c.name,
		ev: (c.effect as any).value as number
	}));

	console.log('\n【9】强度曲线 vs 目标曲线(按真实抽卡分布估算)\n');
	console.log(
		`  参考:免费 3 选 1 的期望单卡自EV = ${fmt(CARD_EV)};商店 best-of-3 加成卡 EV = ${fmt(buffEV)}\n`
	);
	console.log(
		'  关卡'.padEnd(8) +
			'人数'.padStart(5) +
			'队伍倍率'.padStart(10) +
			'活跃加成'.padStart(9) +
			'可达分数'.padStart(11) +
			'目标'.padStart(10) +
			'余量'.padStart(10)
	);

	let coins = 0;
	for (let n = 1; n <= 16; n++) {
		const size = Math.min(TEAM_LIMIT, n + 2);
		coins += roundReward(n) + 2;
		// 每关买约 coins/6 张(均价 6),每张存活约 1.6 关,平摊到 size 个 Tee
		const buffsPerTee = Math.min(3, ((coins / 6) * 1.6) / Math.max(1, size));
		const bm = Math.pow(buffEV, buffsPerTee);
		const tm = n >= 3 ? 1.25 : 1; // 全队倍率卡
		const score = (size - 1) * LV * CARD_EV * bm * tm + LV * bm * tm * 0.6;
		const tgt = roundTarget(n);
		const margin = score / tgt - 1;
		console.log(
			`  R${String(n).padEnd(6)}${String(size).padStart(5)}${fmt(tm).padStart(10)}` +
				`${fmt(buffsPerTee).padStart(9)}${Math.round(score).toString().padStart(11)}${tgt.toString().padStart(10)}` +
				`${((margin >= 0 ? '+' : '') + fmt(margin * 100, 0) + '%').padStart(10)}`
		);
	}
	console.log('\n  余量为正 = 该关可以过。曲线在 R6~R9 之间收窄,就是本作的「墙」。\n');
}

// ---------- 10. 计分公式变体对比:骰子点数和要不要计进去 ----------
if (only === 'variants') {
	const sumOf = (e: number) => {
		let s = 0;
		for (let v = 1; v <= 6; v++) s += v * NIB(e, v);
		return s;
	};
	const scoreNoMods = (e: number) => scoreOf(e);
	const hasMods = (e: number) => {
		void e;
		return false;
	};
	void hasMods;

	// 变体 V2 用的牌型倍率
	const MULT: Record<string, number> = {
		none: 1,
		yi_xiu: 2,
		er_ju: 3,
		si_jin: 4,
		san_hong: 6,
		dui_tang: 8,
		zhuang_yuan: 12,
		wu_zi: 16,
		wu_wang: 20,
		liu_bo_hei: 25,
		liu_bo_hong: 30,
		zhuang_yuan_chajinhua: 40
	};
	const levelMultOf = (e: number) => MULT[judgeRoll(toDice(e)).id] ?? 1;

	type Variant = { name: string; note: string; fn: (e: number) => number };
	const variants: Variant[] = [
		{ name: 'V0 现行', note: 'score = 牌型固定分', fn: scoreNoMods },
		{
			name: 'V1a 和值×1',
			note: 'score = 牌型固定分 + 点数和',
			fn: (e) => scoreNoMods(e) + sumOf(e)
		},
		{
			name: 'V1b 和值×3',
			note: 'score = 牌型固定分 + 点数和×3',
			fn: (e) => scoreNoMods(e) + 3 * sumOf(e)
		},
		{
			name: 'V1c 和值×8',
			note: 'score = 牌型固定分 + 点数和×8',
			fn: (e) => scoreNoMods(e) + 8 * sumOf(e)
		},
		{
			name: 'V2  和值×牌型倍率',
			note: 'score = 点数和 × 牌型倍率(1~40)',
			fn: (e) => sumOf(e) * levelMultOf(e)
		}
	];

	/** 直觉打法:能留 4 就留 4,若已有 3 个以上 4 再留 1(追插金花) */
	const naiveKeep = (st: number): number => {
		const c = unpack(st);
		const fours = c[4];
		const out = [0, 0, 0, 0, 0, 0, 0];
		out[4] = fours;
		if (fours >= 3) out[1] = c[1];
		return pack(out);
	};
	/** 另一组直觉:留 4 也留 1(不判断数量) */
	const keep41 = (st: number): number => {
		const c = unpack(st);
		return pack([0, c[1], 0, 0, c[4], 0, 0]);
	};
	/** 留 4 + 最大的两颗 */
	const keep4high = (st: number): number => {
		const c = unpack(st);
		const out = [0, 0, 0, 0, 0, 0, 0];
		out[4] = c[4];
		let need = 2 - (c[5] ? 1 : 0);
		if (c[5]) out[5] = c[5];
		if (need > 0 && c[6]) out[6] = c[6];
		return pack(out);
	};
	/** 只留 6(纯和值玩法) */
	const keep6 = (st: number): number => {
		const c = unpack(st);
		return pack([0, 0, 0, 0, 0, 0, c[6]]);
	};
	const HEUR: [string, (st: number) => number][] = [
		['留4(条件留1)', naiveKeep],
		['留4+1', keep41],
		['留4+大牌', keep4high],
		['只留6', keep6]
	];
	const policyEV = (fn: (e: number) => number, keepFn: (st: number) => number) => {
		let ev = 0;
		for (const [e, p] of DIST6) {
			const keep = keepFn(e);
			const list = FILLS[6 - countOf(keep)];
			let sum = 0;
			for (const f of list) sum += fn(keep + f);
			ev += (sum / list.length) * p;
		}
		return ev;
	};

	/** 抽样一批首掷局面,比较最优保留与直觉保留 */
	const sampleStates: number[] = [];
	{
		const seen = new Set<number>();
		for (let i = 0; i < 6000; i++) {
			const c = new Array(7).fill(0);
			for (let k = 0; k < 6; k++) c[rnd()]++;
			const e = pack(c);
			if (!seen.has(e)) {
				seen.add(e);
				sampleStates.push(e);
			}
		}
	}

	console.log('\n【10】计分公式变体对比(2 次投掷,无 Boss 无卡)\n');
	console.log(
		'  变体'.padEnd(22) +
			'最优期望'.padStart(10) +
			'直觉打法'.padStart(10) +
			'技术差'.padStart(8) +
			'决策分歧'.padStart(10) +
			'中位数'.padStart(9) +
			'p90/p10'.padStart(10)
	);
	for (const v of variants) {
		const { V, bestKeep } = makeOptimal(undefined, v.fn);
		// 最优期望(全 462 状态加权)
		let opt = 0;
		for (const [e, p] of DIST6) opt += V(e, 2) * p;
		// 直觉打法:取「最好的一档直觉」作为基准,避免拿专门为某个变体设计的策略去比
		let nv = 0;
		let nvName = '';
		for (const [hn, hf] of HEUR) {
			const e2 = policyEV(v.fn, hf);
			if (e2 > nv) {
				nv = e2;
				nvName = hn;
			}
		}
		// 决策分歧率
		let diff = 0;
		for (const e of sampleStates) {
			const o = bestKeep(e, 2);
			const n2 = naiveKeep(e);
			const same =
				countOf(o) === countOf(n2) &&
				NIB(o, 1) === NIB(n2, 1) &&
				NIB(o, 2) === NIB(n2, 2) &&
				NIB(o, 3) === NIB(n2, 3) &&
				NIB(o, 4) === NIB(n2, 4) &&
				NIB(o, 5) === NIB(n2, 5) &&
				NIB(o, 6) === NIB(n2, 6);
			if (!same) diff++;
		}
		// 分布(蒙特卡洛,别去展开 462×46656)
		const samples: number[] = [];
		for (let i = 0; i < 20000; i++) {
			const c = new Array(7).fill(0);
			for (let k = 0; k < 6; k++) c[rnd()]++;
			const st = pack(c);
			const keep = bestKeep(st, 2);
			const cc = unpack(keep);
			for (let k = countOf(keep); k < 6; k++) cc[rnd()]++;
			samples.push(v.fn(pack(cc)));
		}
		samples.sort((a, b) => a - b);
		const q = (x: number) => samples[Math.min(samples.length - 1, Math.floor(samples.length * x))];
		console.log(
			`  ${v.name.padEnd(20)}${fmt(opt, 1).padStart(10)}${fmt(nv, 1).padStart(10)}` +
				`${('×' + fmt(opt / nv)).padStart(8)}${pct(diff / sampleStates.length).padStart(10)}` +
				'  ' +
				nvName.padEnd(12) +
				`${fmt(q(0.5), 0).padStart(9)}${('×' + fmt(q(0.9) / Math.max(1, q(0.1)))).padStart(10)}`
		);
	}
	console.log(
		'\n  「技术差」= 最优期望 / 直觉打法期望。越接近 1 说明怎么留都差不多,没有操作空间。'
	);
	console.log('  「决策分歧」= 最优保留和直觉保留不一样的局面占比。越高说明越需要动脑。\n');
}

// ---------- 11. 「和值卡」定价:点数和加进得分值多少(含打法变化) ----------
if (only === 'sumk') {
	const sumOf = (e: number) => {
		let s = 0;
		for (let v = 1; v <= 6; v++) s += v * NIB(e, v);
		return s;
	};
	const base = (e: number) => scoreOf(e);
	console.log('\n【11】「骰子点数和 ×k 计入得分」的价值(动态规划,含最优打法随之改变)\n');
	console.log(
		'  k'.padStart(4) +
			'最优期望'.padStart(11) +
			'相对无卡'.padStart(11) +
			'自身EV'.padStart(9) +
			'队伍影响(6人)'.padStart(14) +
			'  建议档位'
	);
	const baseV = makeOptimal(undefined, base);
	let baseEV = 0;
	for (const [e, p] of DIST6) baseEV += baseV.V(e, 2) * p;
	for (const k of [2, 3, 4, 5, 6, 8, 10, 12]) {
		const V = makeOptimal(undefined, (e) => base(e) + k * sumOf(e));
		let ev = 0;
		for (const [e, p] of DIST6) ev += V.V(e, 2) * p;
		const selfEV = ev / baseEV;
		const team = 1 + (selfEV - 1) / 6;
		const tier = team < 1.13 ? '普通' : team < 1.28 ? '稀有' : team < 1.58 ? '传说' : '超模!';
		console.log(
			`  k=${String(k).padEnd(2)}${fmt(ev, 1).padStart(11)}${('×' + fmt(selfEV)).padStart(11)}` +
				`${fmt(selfEV).padStart(9)}${fmt(team).padStart(14)}  ${tier}`
		);
	}
	console.log('\n  基准(无卡)期望:', fmt(baseEV, 1));
	console.log(
		'  注:这里已经包含「玩家为吃和值改留大牌」带来的额外收益,所以比静态估算略高,定价别按静态算。'
	);
}

// ---------- 12. 内容体检:数值重复 / 文案与效果不一致 ----------
if (only === 'dup') {
	const { CARDS } = await import('../../src/lib/teecards');
	const { BUFF_CARDS } = await import('../../src/lib/items');
	const { BASE_ROLLS } = await import('../../src/lib/game');

	/** 抽取对象里所有数字(含数字键,如 {map:{6:4}} 的 6 和 4) */
	const num = (o: unknown): number[] => {
		const out: number[] = [];
		const walk = (v: unknown) => {
			if (typeof v === 'number') out.push(v);
			else if (typeof v === 'string') out.push(...(v.match(/\d+(?:\.\d+)?/g) ?? []).map(Number));
			else if (Array.isArray(v)) v.forEach(walk);
			else if (v && typeof v === 'object')
				for (const [k, val] of Object.entries(v)) {
					if (/^\d+$/.test(k)) out.push(Number(k));
					walk(val);
				}
		};
		walk(o);
		return out;
	};

	/** 文案里允许出现的数字:效果本身 + 回合 + 价格 + 「总投掷次数」换算 */
	const allowedNums = (c: { effect: unknown; turns?: number; price?: number }): number[] => {
		const out = num(c.effect);
		if (c.turns) out.push(c.turns);
		if (c.price) out.push(c.price);
		const addRolls = (e: { type?: string; count?: number; parts?: unknown[] }) => {
			if (e?.type === 'extra_roll') out.push(BASE_ROLLS + (e.count ?? 0));
			if (e?.type === 'bundle')
				for (const p of e.parts ?? []) addRolls(p as { type?: string; count?: number });
		};
		addRolls(c.effect as { type?: string });
		return out;
	};

	type Row = {
		name: string;
		desc: string;
		rarity: string;
		price?: number;
		turns?: number;
		effect: unknown;
	};

	const check = (label: string, list: Row[]) => {
		console.log(`  ${label}: ${list.length} 张`);

		// a) 效果(+回合)完全重复
		const sig = new Map<string, string[]>();
		for (const c of list) {
			const k = JSON.stringify(c.effect) + '|' + (c.turns ?? '');
			sig.set(k, [
				...(sig.get(k) ?? []),
				`${c.name}(${c.rarity}${c.turns ? ',' + c.turns + '回合' : ''})`
			]);
		}
		const dup = [...sig.entries()].filter(([, v]) => v.length > 1);
		console.log(`    效果+回合完全重复: ${dup.length} 组`);
		for (const [k, v] of dup) console.log(`      ${v.join(' = ')}  → ${k}`);

		// b) 同效果 + 同价或更高价,但回合更短 = 严格劣
		const byEff = new Map<string, Row[]>();
		for (const c of list) {
			const k = JSON.stringify(c.effect);
			byEff.set(k, [...(byEff.get(k) ?? []), c]);
		}
		const worse: string[] = [];
		for (const [, v] of byEff) {
			for (const a of v)
				for (const b of v) {
					if (a.name === b.name) continue;
					if (a.turns === undefined || b.turns === undefined) continue;
					if (a.turns < b.turns && (a.price ?? 0) >= (b.price ?? 0))
						worse.push(
							`${a.name}(${a.turns}回合/${a.price}币) 被 ${b.name}(${b.turns}回合/${b.price}币) 完全压制`
						);
				}
		}
		console.log(`    严格被压制(同效果、同价或更贵但回合更短): ${worse.length} 条`);
		for (const w of worse) console.log(`      ${w}`);

		// c) 文案里出现的数字,效果里必须能对上
		const mismatch: string[] = [];
		for (const c of list) {
			const ok = allowedNums(c);
			const missing = num(c.desc).filter((n) => n > 1 && !ok.includes(n));
			if (missing.length)
				mismatch.push(
					`${c.name}: 文案有 ${[...new Set(missing)].join(',')} 但效果/回合/价格里都没有`
				);
		}
		console.log(`    文案↔效果 数字对不上: ${mismatch.length} 条`);
		for (const m of mismatch) console.log(`      ${m}`);
		console.log('');
	};

	check('角色', CARDS as unknown as Row[]);
	check(
		'加成卡',
		BUFF_CARDS.map((b) => ({
			name: b.name,
			desc: b.desc,
			rarity: b.rarity,
			price: b.price,
			turns: b.turns,
			effect: b.effect
		}))
	);
}

// ---------- 13. 过关概率 + 目标曲线反推 ----------
// 过关看的是「总分 ≥ 目标」,所以要看**分位数**而不是均值(均值被状元/插金花拉高)。
// 构筑用确定性模型:每个带卡 Tee 的分数 = 等级分 × 平均卡倍率,团队 × 加成卡倍率,
// 这样分布只来自掷骰本身,曲线才平滑可信。
if (only === 'run') {
	const { CARDS, condHit } = await import('../../src/lib/teecards');
	const { BUFF_CARDS } = await import('../../src/lib/items');
	const { roundTarget, roundReward, TEAM_LIMIT } = await import('../../src/lib/game');
	if (!dists[2]) dists[2] = levelDistribution(2, 20000);

	const LV_LIST = ROLL_LEVELS;
	const LV_MEAN = LV_LIST.reduce((a, l) => a + (dists[2].get(l.id) ?? 0) * l.score, 0);
	const sampleLevel = () => {
		const r = Math.random();
		let acc = 0;
		for (const l of LV_LIST) {
			acc += dists[2].get(l.id) ?? 0;
			if (r <= acc) return l;
		}
		return LV_LIST[LV_LIST.length - 1];
	};
	const scoreWith = (card: any, level: { id: string; score: number }): number => {
		let chips = 0;
		let mult = 1;
		const walk = (e: any) => {
			if (!e) return;
			switch (e.type) {
				case 'chips':
					chips += e.value;
					break;
				case 'mult':
					mult *= e.value;
					break;
				case 'chips_mult':
					chips += e.chips;
					mult *= e.mult;
					break;
				case 'cond':
					if (condHit(e.cond, level.id, level.score)) {
						if (e.chips) chips += e.chips;
						if (e.mult) mult *= e.mult;
					}
					break;
				case 'team_chips':
					chips += e.value;
					break;
				case 'per_team_chips':
					chips += e.value * 6;
					break;
				case 'bundle':
					e.parts.forEach(walk);
					break;
				case 'sum_chips':
					chips += e.per * 22;
					break;
				default:
					break; // 改点/多投掷/支援/联动不模拟(保守)
			}
		};
		walk(card.effect);
		return Math.max(0, (level.score + chips) * mult);
	};
	const avgScoreOf = (c: any) => {
		let s = 0;
		for (const l of LV_LIST) s += (dists[2].get(l.id) ?? 0) * scoreWith(c, l);
		return s;
	};
	const W: Record<string, number> = { common: 7, rare: 3, legendary: 1 };
	// 加成卡 best-of-3 的平均倍率
	const BUFF_POOL = BUFF_CARDS.filter((b) =>
		['mult', 'chips_mult', 'chips'].includes(b.effect.type)
	);
	const buffEV = (b: any) => {
		const e = b.effect;
		if (e.type === 'chips') return (LV_MEAN + e.value) / LV_MEAN;
		if (e.type === 'mult') return e.value;
		return ((LV_MEAN + e.chips) / LV_MEAN) * e.mult;
	};
	// 商店货架 = 5 张普通 + 1 张稀有/传说(见 items.ts drawShopItems),玩家挑最好的一张
	const BUFF_AVG = (() => {
		const commons = BUFF_POOL.filter((b) => b.rarity === 'common');
		const highs = BUFF_POOL.filter((b) => b.rarity !== 'common');
		let acc = 0;
		const S = 4000;
		const pick = (list: typeof BUFF_POOL) => {
			const tot = list.reduce((a, b) => a + W[b.rarity], 0);
			let r = Math.random() * tot;
			for (const b of list) {
				r -= W[b.rarity];
				if (r <= 0) return b;
			}
			return list[0];
		};
		for (let i = 0; i < S; i++) {
			let best = 1;
			const shelf = [...Array.from({ length: 5 }, () => pick(commons)), pick(highs)];
			for (const b of shelf) if (b) best = Math.max(best, buffEV(b));
			acc += best;
		}
		return acc / S;
	})();

	const drawCard = () => {
		const tot = CARDS.reduce((a, c) => a + W[c.rarity], 0);
		let r = Math.random() * tot;
		for (const c of CARDS) {
			r -= W[c.rarity];
			if (r <= 0) return c;
		}
		return CARDS[0];
	};
	/** 一局:队伍卡在一次开局里固定(和实战一致),每关免费 3 选 1 补人 */
	const playthrough = (): number[] => {
		const cards: any[] = [];
		const used = new Set<string>();
		const totals: number[] = [];
		let coins = 0;
		for (let n = 1; n <= 16; n++) {
			const size = Math.min(TEAM_LIMIT, n + 2);
			while (cards.length < size - 1) {
				let best: any = null;
				let bestV = -1;
				for (let k = 0; k < 3; k++) {
					const c = drawCard();
					if (used.has(c.id)) continue;
					const v = avgScoreOf(c);
					if (v > bestV) {
						bestV = v;
						best = c;
					}
				}
				if (!best) best = drawCard();
				used.add(best.id);
				cards.push(best);
			}
			// 金币是「过关后才拿到」的 → 本关用的是之前攒下的钱买的加成卡
			let bm = 1;
			if (USE_BUFF) {
				const perTee = Math.min(3, ((coins / 6) * 1.6) / size);
				bm = Math.pow(BUFF_AVG, perTee);
			}
			let sum = 0;
			sum += sampleLevel().score;
			for (const c of cards) sum += scoreWith(c, sampleLevel());
			totals.push(sum * bm);
			coins += roundReward(n) + 2;
		}
		return totals;
	};

	const USE_BUFF = process.env.BUFFS !== '0';
	const PLC = Number(process.env.PLAYS ?? 400); // 独立开局数
	const PER = Number(process.env.PERRUN ?? 400); // 每局的样本数

	console.log('\n【13】过关概率 + 目标曲线反推\n');
	console.log(
		`  模型: 平均等级分 ${fmt(LV_MEAN, 1)} · 加成卡 best-of-3 ×${fmt(BUFF_AVG)} · ${PLC} 个独立开局 × 每局 ${PER} 次抽样${USE_BUFF ? '' : ' (关加成卡)'}\n`
	);
	console.log(
		'  关卡'.padEnd(7) +
			'人数'.padStart(5) +
			'p10'.padStart(8) +
			'p25'.padStart(8) +
			'p50'.padStart(8) +
			'p75'.padStart(8) +
			'p90'.padStart(8) +
			'  建议目标(目标过关率)'
	);

	// 每个开局算一条分位曲线,再对局数取中位数 → 消掉「卡运」噪声但仍然反映真实分布
	const qs = [0.1, 0.25, 0.5, 0.75, 0.9];
	const curves: number[][][] = [];
	for (let p = 0; p < PLC; p++) {
		const perRound: number[][] = Array.from({ length: 16 }, () => []);
		for (let i = 0; i < PER; i++) {
			const t = playthrough();
			t.forEach((v, k) => perRound[k].push(v));
		}
		curves.push(
			perRound.map((arr) => {
				arr.sort((a, b) => a - b);
				return qs.map((x) => arr[Math.min(arr.length - 1, Math.floor(arr.length * x))]);
			})
		);
	}
	const medOfRuns = (round: number, qi: number) => {
		const v = curves.map((c) => c[round][qi]).sort((a, b) => a - b);
		return Math.round(v[Math.floor(v.length / 2)]);
	};
	const rec: number[] = [];
	for (let n = 1; n <= 16; n++) {
		const size = Math.min(TEAM_LIMIT, n + 2);
		const q = qs.map((_, qi) => medOfRuns(n - 1, qi));
		const wantPass =
			n <= 2
				? 0.95
				: n <= 4
					? 0.9
					: n <= 6
						? 0.82
						: n <= 8
							? 0.72
							: n <= 10
								? 0.62
								: n <= 12
									? 0.55
									: 0.5;
		// 目标 = 第 (1-wantPass) 分位
		const idx = (1 - wantPass) * (PER - 1);
		const lo = Math.floor(idx);
		const arr = curves.map((c) => c[n - 1][0]); // 占位,下面用插值近似
		void arr;
		// 用已算好的分位点线性插值
		const pick = (() => {
			const xs = qs;
			const ys = q;
			if (1 - wantPass <= xs[0]) return ys[0];
			for (let k = 1; k < xs.length; k++) {
				if (1 - wantPass <= xs[k]) {
					const t = (1 - wantPass - xs[k - 1]) / (xs[k] - xs[k - 1]);
					return ys[k - 1] + t * (ys[k] - ys[k - 1]);
				}
			}
			return ys[ys.length - 1];
		})();
		const suggest = Math.max(10, Math.round(pick / 10) * 10);
		rec.push(suggest);
		console.log(
			`  R${String(n).padEnd(5)}${String(size).padStart(5)}` +
				q.map((v) => String(v).padStart(8)).join('') +
				`   ${suggest} (${pct(wantPass)})`
		);
	}
	console.log('\n  建议目标序列:\n   ' + rec.join(', '));
	console.log(
		'  相邻比率: ' +
			rec
				.map((v, i) => (i ? +(v / rec[i - 1]).toFixed(2) : null))
				.slice(1)
				.join(', ')
	);
	console.log('\n  现行曲线对比:');
	const cur = Array.from({ length: 16 }, (_, i) => roundTarget(i + 1));
	console.log('   ' + cur.join(', '));
	console.log('');
}

// ---------- 14. 新机制估值(直接用游戏本体的计分) ----------
// own_face / per_reroll / reverse / active 这几类效果不是「换个数字的 +X」,
// 期望分取决于玩家怎么改策略(例如逆向卡要刻意掷烂),所以这里用
// makeOptimal + calcTeeScore 走一遍真实判定,而不是上面那张确定性表。
if (only === 'new') {
	const { calcTeeScore } = await import('../../src/lib/game');
	const { CARDS: ALL } = await import('../../src/lib/teecards');

	const scoreOnce = (dice: number[], effs: TeeEffect[], rerolled: number): number => {
		const input = {
			levelId: judgeRoll(dice).id,
			self: effs.map((eff, i) => ({ eff, srcId: `s${i}` })),
			allSelf: [],
			index: 0,
			teamCards: [null],
			growth: {},
			buffs: [],
			teamSize: 1,
			diceSum: dice.reduce((a, b) => a + b, 0),
			ownDice: [...dice],
			rerolled,
			playerLevelId: judgeRoll(dice).id,
			playerDice: dice
		};
		return calcTeeScore(input).total;
	};

	/** 给定效果时的最优 2 次投掷期望分 */
	const expectWith = (effs: TeeEffect[], rerolled = 0) => {
		const { V } = makeOptimal(undefined, (e) => scoreOnce(toDice(e), effs, rerolled) as number);
		let sum = 0;
		for (const [e, p] of DIST6) sum += V(e, 2) * p;
		return sum;
	};

	const BASE2 = expectWith([]);
	console.log('\n【14】新机制估值(真实判定,2 次投掷)\n');
	console.log(`  基线: ${fmt(BASE2, 1)} 分`);

	const rows: [string, TeeEffect[], number][] = [
		['亏月 100−掷骰分', [{ type: 'reverse', base: 100 }], 0],
		['残月 260−掷骰分', [{ type: 'reverse', base: 260 }], 0],
		['点将 6 每颗+30', [{ type: 'own_face', face: 6, chips: 30 }], 0],
		['拾月 1 每颗+28', [{ type: 'own_face', face: 1, chips: 28 }], 0],
		['三生 3 每颗+60', [{ type: 'own_face', face: 3, chips: 60 }], 0],
		['四喜 4 每颗×1.25', [{ type: 'own_face', face: 4, mult: 1.25 }], 0],
		[
			'摘星 6+65 / 1−10',
			[
				{ type: 'own_face', face: 6, chips: 65 },
				{ type: 'own_face', face: 1, chips: -10 }
			],
			0
		],
		['快雨 每重掷 1 颗+25', [{ type: 'per_reroll', chips: 25 }], 3],
		['金蟾 ⚡+650(冷却3)', [{ type: 'active', skill: 'chips', value: 650, cooldown: 3 }], 0],
		[
			'吴刚 ⚡给左侧+700(冷却3)',
			[{ type: 'active', skill: 'left_chips', value: 700, cooldown: 3 }],
			0
		],
		['时轮 ⚡本关重掷(冷却7)', [{ type: 'active', skill: 'retry', cooldown: 7 }], 0]
	];
	console.log(
		'\n  效果                          自 EV     队伍影响   档位(普通1.05-1.13/稀有1.15-1.28/传说1.28-1.58)'
	);
	for (const [name, effs, rerolled] of rows) {
		const ev = expectWith(effs, rerolled) / BASE2;
		// 主动技能平时不加分,按「一有就发动」的摊销值折算:value/(冷却+1)
		const act = effs.find((e) => e.type === 'active');
		if (act && act.type === 'active' && act.skill !== 'retry') {
			const per = (act.value ?? 0) / (act.cooldown + 1);
			const amort = 1 + per / BASE2;
			const teamA = 1 + (amort - 1) / 6;
			console.log(
				`  ${name.padEnd(26)} ×${fmt(amort)}(摊销 ${fmt(per, 0)} 分/关)  ×${fmt(teamA)}  ${teamA < 1.14 ? '普通' : teamA < 1.29 ? '稀有' : '传说'}`
			);
			continue;
		}
		if (act) {
			console.log(`  ${name.padEnd(26)} 视局面而定(重试整关,不参与期望分)`);
			continue;
		}
		const team = 1 + (ev - 1) / 6;
		console.log(
			`  ${name.padEnd(26)} ×${fmt(ev)}   ×${fmt(team)}   ${team < 1.14 ? '普通' : team < 1.29 ? '稀有' : '传说'}`
		);
	}
	console.log('\n  注:主动技能按「一有就发动」摊销(value/(冷却+1));「时轮」是重试整关,');
	console.log('     价值在方差而不是期望,单独看;快雨按平均重掷 3 颗计。');
	console.log('     逆向卡(亏月/残月)的 EV 是「刻意掷烂」策略下的值,倍率会让负分更负。\n');

	// 新机制卡在卡池里的稀有度分布
	const mine = ALL.filter((c) => {
		const walk = (e: TeeEffect): boolean =>
			['own_face', 'per_reroll', 'reverse', 'active'].includes(e.type) ||
			(e.type === 'bundle' && e.parts.some(walk));
		return walk(c.effect);
	});
	console.log(`  新机制卡 ${mine.length} 张:`);
	const actOf = (e: any): any =>
		e?.type === 'active' ? e : e?.type === 'bundle' ? e.parts.map(actOf).find(Boolean) : undefined;
	for (const c of mine) {
		const act = actOf(c.effect);
		const ev = act
			? act.skill === 'retry'
				? 0
				: 1 + (act.value ?? 0) / (act.cooldown + 1) / BASE2
			: expectWith([c.effect], 3) / BASE2;
		const label = act ? (act.skill === 'retry' ? '看局面' : `×${fmt(ev)}(摊销)`) : `×${fmt(ev)}`;
		console.log(
			`    ${c.rarity.padEnd(9)} ${c.name.padEnd(4)} 自 EV ${label.padEnd(12)} ${c.desc.slice(0, 34)}`
		);
	}
	console.log('');
}

// ---------- 15. 卡池体检:每张卡的队伍影响是否落在稀有度区间 ----------
// 用「基线最优策略打出来的一手牌」当样本,直接跑 calcTeeScore —— 便宜且口径统一。
// 会主动改打法的卡(逆向/每颗点数/条件卡)在这里是**保守下界**,后面单独标出来。
if (only === 'band') {
	const { calcTeeScore } = await import('../../src/lib/game');
	const { CARDS: ALL, RARITY_INFO } = await import('../../src/lib/teecards');
	const BANDS: Record<string, [number, number]> = {
		common: [1.05, 1.13],
		rare: [1.15, 1.28],
		legendary: [1.28, 1.58]
	};

	/** 基线最优策略下,最终手牌的分布(5000 手) */
	const hands: number[][] = (() => {
		const { bestKeep } = makeOptimal(undefined);
		const out: number[][] = [];
		for (let i = 0; i < 5000; i++) {
			const c = new Array(7).fill(0);
			for (let k = 0; k < 6; k++) c[rnd()]++;
			let st = pack(c);
			for (let left = 2; left > 1; left--) {
				const keep = bestKeep(st, left);
				const cc = unpack(keep);
				for (let k = countOf(keep); k < 6; k++) cc[rnd()]++;
				st = pack(cc);
			}
			out.push(toDice(st));
		}
		return out;
	})();

	const scoreWith = (card: { effect: unknown } | null, dice: number[]): number =>
		calcTeeScore({
			levelId: judgeRoll(dice).id,
			self: card ? [{ eff: card.effect as never, srcId: 'x' }] : [],
			allSelf: [],
			index: 0,
			teamCards: [null],
			growth: {},
			buffs: [],
			teamSize: 1,
			diceSum: dice.reduce((a, b) => a + b, 0),
			ownDice: dice,
			rerolled: 3,
			playerLevelId: judgeRoll(dice).id,
			playerDice: dice
		}).total;

	const baseEV = hands.reduce((a, d) => a + scoreWith(null, d), 0) / hands.length;
	const CHANGES_POLICY = new Set(['reverse', 'own_face', 'per_reroll', 'sum_chips', 'cond']);
	/** 只有这些效果能在 calcTeeScore 里体现;改点/多掷/复制/成长类要走别的表 */
	const MODELED = new Set([
		'chips',
		'mult',
		'chips_mult',
		'cond',
		'own_face',
		'per_reroll',
		'reverse',
		'sum_chips'
	]);
	const flat = (e: TeeEffect): TeeEffect[] => (e.type === 'bundle' ? e.parts.flatMap(flat) : [e]);
	const types = (e: TeeEffect) => new Set(flat(e).map((p) => p.type));
	const modeled = (e: TeeEffect) => [...types(e)].every((t) => MODELED.has(t));
	const touches = (e: TeeEffect | undefined): boolean => {
		if (!e) return false;
		if (e.type === 'bundle') return e.parts.some((p) => touches(p));
		return CHANGES_POLICY.has(e.type);
	};

	console.log('\n【15】卡池体检:每张卡的队伍影响 vs 稀有度区间\n');
	/** 会改打法的卡(条件/逆向/每颗点数/重掷/和值)必须按最优解算,否则会被低估 */
	const optimalEV = (c: { effect: unknown }): number => {
		const { V } = makeOptimal(undefined, (e) => scoreWith(c, toDice(e)));
		let s = 0;
		for (const [e, p] of DIST6) s += V(e, 2) * p;
		return s;
	};
	const rows = ALL.filter((c) => modeled(c.effect))
		.map((c) => {
			const shifts = touches(c.effect);
			const ev = shifts
				? optimalEV(c) / baseEV
				: hands.reduce((a, d) => a + scoreWith(c, d), 0) / hands.length / baseEV;
			return { c, team: 1 + (ev - 1) / 6, shifts };
		})
		.sort((a, b) => b.team - a.team);
	const skipped = ALL.length - rows.length;
	let outOfBand = 0;
	for (const { c, team, shifts } of rows.slice(0, 999)) {
		const [lo, hi] = BANDS[c.rarity];
		const bad = team > hi ? '偏高' : team < lo ? '偏低' : '';
		if (bad) outOfBand++;
		console.log(
			`  ${team > hi ? '▲' : team < lo ? '▼' : ' '} ${c.rarity.padEnd(9)} ${c.name.padEnd(6)} 队伍 ×${fmt(team)}  ` +
				`区间 ${lo}~${hi} ${bad}${shifts ? '  (最优打法)' : ''}`
		);
	}
	console.log(
		`\n  区间外 ${outOfBand} / ${rows.length} 张(另有 ${skipped} 张改点/多掷/复制/成长类不在这张表里,` +
			`看【5】【6】的估值;标「最优打法」的按玩家会为它改策略算)\n`
	);
}
