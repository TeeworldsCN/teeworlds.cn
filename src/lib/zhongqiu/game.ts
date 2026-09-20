// 月宫掷骰 · 游戏核心逻辑(关卡、Boss、计分、存档)
import {
	getRollLevel,
	hasClearVoid,
	judgeRoll,
	straightDiceCount,
	stripVoid,
	type DiceMods
} from './midautumn';
import { LEVEL_LADDER, CARD_BY_ID, CARDS, condHit, type TeeCard, type TeeEffect } from './teecards';
import { longestRun } from './midautumn';
import { BUFF_BY_ID, type AppliedBuff } from './items';

// ---- 关卡 ----
//

// R1~R8 不动(新手区),R9 起坡度从 ×1.18 提到 ×1.23,到 R16 = 6400;
// 超出 16 后按 ×1.25 递增(原来只有 ×1.15 —— 比数组本身的坡度还缓,后期反而变简单了)。
export const TARGETS = [
	60, 120, 240, 450, 750, 1050, 1250, 1500, 1750, 2100, 2500, 3000, 3600, 4500, 5700, 7200
];

export const roundTarget = (n: number): number => {
	if (n <= TARGETS.length) return TARGETS[n - 1];
	// 之后按 ×1.25 递增(和 R13→R16 的实测斜率一致:30855→60000 ≈ ×1.25/关)
	const last = TARGETS[TARGETS.length - 1];
	return Math.round((last * Math.pow(1.25, n - TARGETS.length)) / 10) * 10;
};

/** 每 3 关为一个 Ante */
export const anteOf = (n: number) => Math.ceil(n / 3);

/** 是否 Boss 关(每 Ante 的第 3 关) */
export const isBossRound = (n: number) => n % 3 === 0;

export const BASE_ROLLS = 2;

// ---- Boss ----

export interface Boss {
	id: string;
	name: string;
	emoji: string;
	desc: string;
	/** 目标分数倍率 */
	targetMult?: number;
	/** 骰子点数修饰 */
	mods?: DiceMods;
	rollsBonus?: number;
	mild?: boolean;
	weight?: number;
	/** 从第几关起才有机会抽到(无限模式后期专属,默认全程可抽) */
	minRound?: number;
}

export const BOSSES: Boss[] = [
	// ---- 温和池:第 1~6 关 ----
	{
		id: 'heiyue',
		name: '黑月',
		emoji: '🌑',
		desc: '本关不设额外规则',
		targetMult: 1,
		mild: true
	},
	{
		id: 'miyue',
		name: '迷月',
		emoji: '🌫️',
		desc: '本关掷出的 6 作废；目标 ×0.9',
		mods: { void: [6] },
		targetMult: 0.9,
		mild: true
	},
	{
		id: 'yingyue',
		name: '影月',
		emoji: '🌒',
		desc: '本关掷出的 3 作废；目标 ×0.95',
		mods: { void: [3] },
		targetMult: 0.95,
		mild: true
	},
	// ---- 第 7 关起 ----
	{
		id: 'wuyue',
		name: '雾月',
		emoji: '🌁',
		desc: '本关黑色同点不作数；目标 ×0.95',
		mods: { noSameFace: true },
		targetMult: 0.95
	},
	{
		id: 'xianyue',
		name: '弦月',
		emoji: '🌓',
		desc: '本关掷出的 1 作废',
		mods: { void: [1] },
		targetMult: 1.0
	},
	{
		id: 'shiyue',
		name: '蚀月',
		emoji: '🌘',
		desc: '本关掷出的 4 作废；目标 ×0.3',
		mods: { void: [4] },
		targetMult: 0.3,
		weight: 0.5
	},
	{
		id: 'xueyue',
		name: '血月',
		emoji: '🔴',
		desc: '等级封顶到状元',
		mods: { levelCap: 'zhuang_yuan' },
		targetMult: 1
	},
	{
		id: 'haoyue',
		name: '皓月',
		emoji: '🌕',
		// 专克逆向流:把最没用的 1、2 点变成 4 —— 逆向卡按「base − 净值」结算,
		// 净值里最大的一块就是等级分;1/2 变 4 之后随手一掷就是三红/四进,
		// 逆向玩家躲不掉(1、2 是留着当散牌用的),而正常流派白赚一堆 4。
		// 所以目标抬得比其他 Boss 高(和疾月的 ×2 同一档意思)。
		desc: '本关掷出的 1、2 视为 4；目标 ×1.5',
		mods: { map: { 1: 4, 2: 4 } },
		weight: 0.5,
		targetMult: 1.5
	},
	{
		id: 'jimoon',
		name: '疾月',
		emoji: '🌙',
		desc: '每个 Tee 多投掷 1 次；目标 ×2',
		rollsBonus: 1,
		targetMult: 2
	},
	// ---- 第 18 关起(无限模式后期;前 16 关是标定过的曲线,这批刻意不进池) ----
	{
		id: 'huiyue',
		name: '晦月',
		emoji: '🌚',
		desc: '本关每个 Tee 少投掷 1 次；目标 ×0.75',
		mods: {},
		rollsBonus: -1,
		targetMult: 0.75,
		minRound: 18
	},
	{
		id: 'yinyue',
		name: '隐月',
		emoji: '🌗',
		desc: '本关掷出的 6 视为 5；目标 ×0.95',
		mods: { map: { 6: 5 } },
		targetMult: 0.95,
		minRound: 18
	},
	{
		id: 'yuanyue',
		name: '圆月',
		emoji: '🌝',
		desc: '本关非 4 点的一色牌也按红牌计；目标 ×1.25',
		mods: { faceFloor: true },
		targetMult: 1.25,
		weight: 0.5,
		minRound: 18
	},
	{
		id: 'poyue',
		name: '破月',
		emoji: '🌘',
		desc: '本关掷出的 4 作废、6 视为 4；目标 ×0.9',
		mods: { chain: [{ void: [4] }, { map: { 6: 4 } }] },
		targetMult: 0.9,
		weight: 0.5,
		minRound: 18
	},
	{
		id: 'shuangyue',
		name: '霜月',
		emoji: '🌫',
		desc: '本关掷出的 1、6 作废；目标 ×0.8',
		mods: { void: [1, 6] },
		targetMult: 0.8,
		minRound: 18
	},
	{
		id: 'yunyue',
		name: '晕月',
		emoji: '🌪',
		desc: '本关等级封顶到对堂；目标 ×0.55',
		mods: { levelCap: 'dui_tang' },
		targetMult: 0.55,
		minRound: 18
	},
	{
		id: 'hanyue',
		name: '寒月',
		emoji: '❄️',
		desc: '本关加成卡的加值只算一半；目标 ×0.7',
		mods: { buffChipsScale: 0.5 },
		targetMult: 0.7,
		weight: 0.5,
		minRound: 18
	},
	{
		id: 'linyue',
		name: '凛月',
		emoji: '🥶',
		desc: '本关加成卡的乘值只算一半；目标 ×0.7',
		mods: { buffMultScale: 0.5 },
		targetMult: 0.7,
		weight: 0.5,
		minRound: 18
	}
];

/** 温和池 id(第 1~6 关) */
export const MILD_BOSS_IDS = BOSSES.filter((b) => b.mild).map((b) => b.id);

/** 第 n 关能抽到的 Boss 池(抽卡规则只此一份,getBoss 和「卡池一览」页共用) */
export const bossPool = (n: number): Boss[] =>
	BOSSES.filter((b) =>
		n <= 6 ? b.mild : b.minRound ? n >= b.minRound : b.id !== 'shiyue' || n > 16
	);

export const getBoss = (n: number): Boss => {
	const pool = bossPool(n);
	const weight = (b: Boss) => b.weight ?? 1;
	const total = pool.reduce((a, b) => a + weight(b), 0);
	let r = Math.random() * total;
	for (const b of pool) {
		r -= weight(b);
		if (r <= 0) return b;
	}
	return pool[pool.length - 1];
};

export const getBossById = (id: string): Boss => BOSSES.find((b) => b.id === id) ?? BOSSES[0];

// ---- 队伍 ----

export interface TeamTee {
	/** 卡牌 id。没有卡的那种 Tee 是「我」 */
	cardId: string | null;
	/**
	 * 这张是不是「我」。
	 *
	 * 以前靠「下标 0 = 我」这个不成文约定,但那是位置不是身份:归家卖「我」、读档、
	 * 作弊注入队伍都可能让队首变成别人,于是所有「依赖我」的效果(望月怀远/明月共照/
	 * 星河/点数映射…)都会认错人 —— 而「我」本来就可能不在队伍里。
	 * 现在显式记在数据上,下标怎么排都不会认错。
	 *
	 * 不变量(由 normalizeSelf 维持):isSelf 的那个 Tee 永远排在队首。
	 */
	isSelf?: boolean;
	/**「我」的皮肤(纯外观;身份判定一律看 isSelf) */
	selfSkin?: string;
	/** 本关该 Tee 的得分(掷完后) */
	lastScore: number;
	lastLevelId: string;
	lastDice: number[];
	/** 这一手哪些骰子被判作废(高照抄牌面时要连作废状态一起抄) */
	lastVoid?: number[];
	buffs: AppliedBuff[];
	charge?: number;
	/**
	 * 田螺:这只 Tee 身上的加成卡不生效 —— 挂载时就**直接不入库**,只在这里记下
	 * 「哪张卡、原价多少月饼币」,掷完之后按原价返还(结算动画逐张弹)。
	 */
	refundPending?: { cardId: string; coins: number }[];
	/** 田螺:发动过主动技 → 返还减半 */
	refundHalved?: boolean;
	/** 发动过的主动技加值/乘算:算进该 Tee 的**基础分**(乘算之前),跟着存盘走 */
	skillChips?: { srcId: string; chips: number; from?: string }[];
	skillMult?: { srcId: string; mult: number; from?: string };
	/** 发动过的主动技加值/乘算:算进该 Tee 的**基础分**(乘算之前),跟着存盘走 */
}

export const TEAM_LIMIT = 6;

/**
 * 把「我」归位到队首,并保证全队**有且只有一个** isSelf。
 *
 * 这是「我」的身份不变量:
 *   1. 已经标了 isSelf 的 Tee 搬到下标 0;
 *   2. 一个都没标(旧存档 / 作弊注入)→ 认 `cardId === null` 那个;
 *   3. 还是没有(存档里「我」丢了)→ 认下标 0(降级,至少不会全队乱套);
 *   4. 多标了 → 只留第一个。
 *
 * 任何改队伍的地方(读档 / 卖 Tee / 归家卖「我」/ 作弊 setTeam)都要过它。
 */
export const normalizeSelf = (team: TeamTee[]): TeamTee[] => {
	if (team.length === 0) return team;
	let idx = team.findIndex((t) => t.isSelf);
	if (idx < 0) idx = team.findIndex((t) => t.cardId === null);
	if (idx < 0) idx = 0;
	const out = team.map((t, i) => (i === idx ? { ...t, isSelf: true } : { ...t, isSelf: false }));
	if (idx !== 0) {
		const [me] = out.splice(idx, 1);
		out.unshift(me);
	}
	return out;
};

export type GrowthMap = Record<string, number>;

/** 过关后成长卡叠层 */
export const applyGrowth = (cards: TeeCard[], growth: GrowthMap): GrowthMap => {
	const next = { ...growth };
	const walk = (eff: TeeEffect, id: string) => {
		if (eff.type === 'scaling_mult') next[id] = (next[id] ?? 0) + eff.per;
		// growth_mult 是复利,记的是**关数**,计分时 mult *= (1+per)^growth
		else if (eff.type === 'growth_mult') next[id] = (next[id] ?? 0) + 1;
		else if (eff.type === 'bundle') eff.parts.forEach((p) => walk(p, id));
	};
	for (const card of cards) walk(card.effect, card.id);
	return next;
};

// ---- 效果解析(copy_right / bundle) ----

export interface EffectiveEffect {
	eff: TeeEffect;
	srcId: string;
}

export const effectiveEffects = (
	cards: (TeeCard | null)[],
	i: number,
	depth = 0
): EffectiveEffect[] => {
	const card = cards[i];
	if (!card) return [];
	const out: EffectiveEffect[] = [];
	const walk = (eff: TeeEffect, srcId: string, d: number) => {
		if (eff.type === 'copy_right') {
			if (d > 1) return;
			const right = cards[i + 1];
			if (right) out.push(...effectiveEffects(cards, i + 1, d + 1));
			// 「复制并超车」:复制到的效果之外再乘一层
			if (eff.mult) out.push({ eff: { type: 'mult', value: eff.mult }, srcId: card.id });
			return;
		}
		if (eff.type === 'bundle') {
			eff.parts.forEach((p) => walk(p, srcId, d));
			return;
		}
		out.push({ eff, srcId });
	};
	walk(card.effect, card.id, depth);
	return out;
};

// ---- 投掷次数 / 等级操作 ----

/** 该 Tee 本回合可投掷几次 */
export const rollsAllowed = (
	self: EffectiveEffect[],
	buffs: AppliedBuff[] = [],
	bonus = 0
): number => {
	let extra = 0;
	for (const { eff } of self) if (eff.type === 'extra_roll') extra += eff.count;
	for (const b of buffs) {
		const e = BUFF_BY_ID.get(b.cardId)?.effect;
		if (e?.type === 'roll') extra += e.count ?? 0;
	}
	return Math.max(1, BASE_ROLLS + extra + bonus);
};

export const upgradeLevel = (levelId: string, count: number): string => {
	if (count <= 0) return levelId;
	const i = LEVEL_LADDER.indexOf(levelId as (typeof LEVEL_LADDER)[number]);
	if (i < 0) return levelId;
	return LEVEL_LADDER[Math.min(LEVEL_LADDER.length - 1, i + count)];
};

export const applyBuffLevelFloor = (levelId: string, buffs: AppliedBuff[] = []): string => {
	let best = LEVEL_LADDER.indexOf(levelId as (typeof LEVEL_LADDER)[number]);
	for (const b of buffs) {
		const e = BUFF_BY_ID.get(b.cardId)?.effect;
		if (e?.type !== 'level_floor' || !e.levelId) continue;
		const j = LEVEL_LADDER.indexOf(e.levelId as (typeof LEVEL_LADDER)[number]);
		if (j > best) best = j;
	}
	return LEVEL_LADDER[Math.max(0, best)];
};

export interface SetOp {
	kind: 'point' | 'any' | 'bump' | 'voidpick';
	count: number;
	point?: number;
	/** bump: 位移方向(+1 月牙尺 / −1 缺月尺) */
	step?: number;
	/** set_point/set_any: 只能挑这个点数的骰子(拆 4 系列:4) */
	from?: number;
	/** set_any: 可选的改后点数(不填 = 1~6 任选) */
	options?: number[];
	srcId?: string;
}

export const collectSetOps = (self: EffectiveEffect[], buffs: AppliedBuff[] = []): SetOp[] => {
	const ops: SetOp[] = [];
	type AnyEff = {
		type: string;
		parts?: AnyEff[];
		count?: number;
		point?: number;
		value?: number;
		from?: number;
		options?: number[];
		pick?: boolean;
	};
	const walk = (e: AnyEff, srcId: string) => {
		if (e.type === 'bundle') {
			(e.parts ?? []).forEach((p) => walk(p, srcId));
			return;
		}
		if (e.type === 'set_point')
			ops.push({ kind: 'point', count: e.count ?? 1, point: e.point ?? 4, from: e.from, srcId });
		else if (e.type === 'set_any')
			ops.push({ kind: 'any', count: e.count ?? 1, from: e.from, options: e.options, srcId });
		// 半影卡:由玩家挑一个点数取消作废(整关解除的月食卡没有 pick,不进队列)
		else if (e.type === 'clear_void' && e.pick) ops.push({ kind: 'voidpick', count: 1, srcId });
		else if (e.type === 'bump_point')
			ops.push({ kind: 'bump', count: e.count ?? 1, step: e.value ?? 1, srcId });
	};
	for (const { eff, srcId } of self) walk(eff as unknown as AnyEff, srcId);
	for (const b of buffs) {
		const e = BUFF_BY_ID.get(b.cardId)?.effect;
		if (e) walk(e as unknown as AnyEff, b.cardId);
	}
	return ops;
};

export interface ActiveSkill {
	srcId: string;
	skill:
		| 'chips'
		| 'left_chips'
		| 'retry'
		| 'sum'
		| 'to_four'
		| 'mult'
		| 'end_round'
		| 'sell_self'
		| 'parked';
	/** 固定加分(chips/left_chips 用);和值类(sum)在卡自己的效果里读参数,这里是 0 */
	value: number;
	cooldown: number;
	/** 发动要花的月饼币(猜谜) */
	cost?: number;
	/** 得分倍率(猜谜) */
	mult?: number;
	/** 结束本关时,每个尚未投掷的角色给多少月饼币(云海) */
	perTee?: number;
	/** 出售「我」换多少月饼币(归家) */
	coins?: number;
	/** 技能属于「我」而不是持有者(归家) */
	toPlayer?: boolean;
}

export const activeSkills = (self: EffectiveEffect[], buffs: AppliedBuff[] = []): ActiveSkill[] => {
	const out: ActiveSkill[] = [];
	// bundle 要拆开看:主动技可以直接挂在卡上,也可以和别的效果打包
	// (连珠灯 = 主动技 + 对堂奖励,踩过:不拆的话技能根本收不到)
	const walk = (eff: TeeEffect, srcId: string) => {
		if (eff.type === 'bundle') {
			eff.parts.forEach((p) => walk(p, srcId));
			return;
		}
		if (eff.type === 'active')
			out.push({
				srcId,
				skill: eff.skill,
				value: 'value' in eff ? (eff.value ?? 0) : 0,
				cooldown: eff.cooldown,
				cost: 'cost' in eff ? eff.cost : undefined,
				mult: 'mult' in eff ? eff.mult : undefined,
				perTee: 'perTee' in eff ? eff.perTee : undefined,
				coins: 'coins' in eff ? eff.coins : undefined,
				toPlayer: 'toPlayer' in eff ? eff.toPlayer : undefined
			});
	};
	for (const { eff, srcId } of self) walk(eff, srcId);
	void buffs; // 目前只有卡牌带主动技能(加成卡时效太短,冷却没意义)
	return out;
};

/**
 * 「我」能用的主动技:别人卡上标了 toPlayer 的那些(归家)。
 * 技能归属「我」——所以冷却记在 team[0].charge、按钮/角标也长在主 Tee 上。
 */
export const playerActiveSkills = (cards: (TeeCard | null)[]): ActiveSkill[] => {
	const out: ActiveSkill[] = [];
	for (let i = 0; i < cards.length; i++) {
		if (!cards[i]) continue;
		for (const sk of activeSkills(effectiveEffects(cards, i)))
			if (i === 0 || sk.toPlayer) out.push(sk);
	}
	return out;
};

/** 还能不能发动(冷却 0 即可) */
export const activeReady = (tee: TeamTee | undefined, skill: ActiveSkill): boolean =>
	(tee?.charge ?? 0) <= 0;

export const tickCharge = (team: TeamTee[]): void => {
	for (const t of team) t.charge = Math.max(0, (t.charge ?? 0) - 1);
};

export const selfDiceMods = (
	self: EffectiveEffect[],
	buffs: AppliedBuff[] = []
): DiceMods | undefined => {
	const mods: DiceMods[] = [];
	// bundle 要拆开看,否则「连珠灯」这种复合卡里的阶梯挂不上(踩过)
	const collect = (eff: TeeEffect) => {
		if (eff.type === 'self_mods') mods.push(eff.mods);
		else if (eff.type === 'straight_ladder') mods.push({ straightFloor: true });
		// 点数阶梯:非 4 点的同点也按 4 点线的档位结算
		else if (eff.type === 'face_ladder') mods.push({ faceFloor: true });
		else if (eff.type === 'bundle') eff.parts.forEach(collect);
	};
	for (const { eff } of self) collect(eff);
	for (const b of buffs) {
		const e = BUFF_BY_ID.get(b.cardId)?.effect;
		if (e?.type === 'dice_mods' && e.mods) mods.push(e.mods);
		// 月食卡:解除本关的「点数作废」(整关全解除)。
		// 半影卡(pick)是由玩家挑一个点数,走 modsFor 的 clearVoidFaces —— 不能也塞 clearVoid,
		// 否则它会把 Boss/自己卡的所有作废一起抹掉(踩过)。
		if (e?.type === 'clear_void' && !e.pick) mods.push({ clearVoid: true });
	}
	if (mods.length === 0) return undefined;
	return mods.length === 1 ? mods[0] : { chain: mods };
};

export const mergeMods = (a?: DiceMods, b?: DiceMods): DiceMods | undefined => {
	if (!a) return b;
	if (!b) return a;
	return { chain: [a, b] };
};

export const playerDiceMods = (cards: (TeeCard | null)[]): DiceMods | undefined => {
	const map: Record<number, number> = {};
	/** 星河:「我」掷出的这些点数作废 */
	const voidFaces = new Set<number>();
	const walk = (eff: TeeEffect) => {
		if (eff.type === 'map_player_die') map[eff.from] = eff.to;
		else if (eff.type === 'player_void_die') eff.faces.forEach((f) => voidFaces.add(f));
		else if (eff.type === 'bundle') eff.parts.forEach(walk);
	};
	for (const c of cards) if (c) walk(c.effect);
	if (!Object.keys(map).length && !voidFaces.size) return undefined;
	const out: DiceMods = {};
	if (Object.keys(map).length) out.map = map;
	if (voidFaces.size) out.void = [...voidFaces].sort((a, b) => a - b);
	return out;
};

const isEmptyMods = (m?: DiceMods): boolean =>
	!m ||
	(!m.map &&
		m.shift === undefined &&
		!m.void?.length &&
		!m.voidIdx?.length &&
		!m.noSameFace &&
		!m.levelCap &&
		!m.clearVoid &&
		!m.chain?.length);

export const withBossMods = (self?: DiceMods, boss?: DiceMods): DiceMods | undefined => {
	const clearedBoss = hasClearVoid(self) ? stripVoid(boss) : boss;
	// clearVoid 只是开关,不参与点数计算,合成时摘掉
	const cleanSelf =
		self && hasClearVoid(self) ? stripVoid({ ...self, clearVoid: undefined }) : self;
	if (isEmptyMods(cleanSelf)) return clearedBoss;
	if (isEmptyMods(clearedBoss)) return cleanSelf;
	return { chain: [cleanSelf!, clearedBoss!] };
};

export const hasRerollAllOnNone = (self: EffectiveEffect[]): boolean =>
	self.some(({ eff }) => eff.type === 'reroll_all_on_none');

// ---- 计分 ----

export interface ScoreSource {
	/** 来源 id: 卡牌 id 或加成卡 id */
	srcId: string;
	kind: 'card' | 'buff';
	chips: number;
	mult: number;
	from?: string;
	/** 逆向:这一条不是加算,而是把基础分「改写」掉 —— chips 存改写后的基础分,swap.from 是被替换掉的净值 */
	swap?: { from: number };
}

export interface ScoreBreakdown {
	base: number;
	chips: number;
	mult: number;
	teamMult: number;
	total: number;
	/** 逐条来源,按生效顺序 */
	sources: ScoreSource[];
}

export interface ScoreInput {
	/** 本次判定的等级 */
	levelId: string;
	/** 该 Tee 生效的效果 */
	self: EffectiveEffect[];
	allSelf: EffectiveEffect[][];
	/** 该 Tee 在队伍里的位置 */
	index: number;
	/**
	 * 该 Tee 是不是「我」。
	 *
	 * ⚠️ 不要再用 `index === 0` 判「我」——那是位置,不是身份。
	 * 队伍可能被重排(归家卖「我」)、读档、或「我」压根不在队里。
	 */
	isSelf: boolean;
	teamCards: (TeeCard | null)[];
	growth: GrowthMap;
	buffs: AppliedBuff[];
	teamSize: number;
	/** 判定用的骰子点数和 */
	diceSum: number;
	ownDice?: number[];
	rerolled?: number;
	/** 本回合多出来的投掷机会(per_extra_roll 用) */
	extraRolls?: number;
	/** 本回合「重掷之后点数没变」的次数(猜谜) */
	stuckRerolls?: number;
	/** 本回合开始前卖过 Tee(夜市饼摊:卖过就 ×2,卖几个都只算一次) */
	sellBoost?: boolean;
	playerLevelId: string;
	playerDice: number[];
	playerRawDice?: number[];
	/** 当前月饼币(coin_mult 用) */
	coins?: number;
	/** 本关加成卡的加值只算这个比例(寒月:0.5;缺省 1) */
	/** 主动技的「计入基础分」加值(和值技 / 田螺):必须和筹码一起进乘算,不能事后加 */
	skillChips?: { srcId: string; chips: number; from?: string }[];
	skillMult?: { srcId: string; mult: number; from?: string };
	buffChipsScale?: number;
	/** 本关加成卡的乘值只算这个比例的增量(凛月:0.5;缺省 1) */
	buffMultScale?: number;
	/** 主动技的「计入基础分」加值(和值技 / 田螺):必须和筹码一起进乘算,不能事后加 */
	/** 主动技附带的乘算(和值技「超过 N 后每点 ×p」) */
	/** 当前关卡数(reverse.perRound / growth_mult 用) */
	round?: number;
	leftScore?: number;
	soldCount?: number;
}

export const calcTeeScore = ({
	levelId,
	self,
	allSelf,
	index,
	isSelf,
	teamCards,
	growth,
	buffs,
	teamSize,
	diceSum,
	ownDice = [],
	rerolled = 0,
	extraRolls = 0,
	stuckRerolls = 0,
	sellBoost = false,
	playerLevelId,
	playerDice,
	playerRawDice,
	coins = 0,
	round = 1,
	leftScore = 0,
	soldCount = 0,
	skillChips = [],
	skillMult,
	buffChipsScale = 1,
	buffMultScale = 1
}: ScoreInput): ScoreBreakdown => {
	{
		const seenEngine = new Set<string>();
		self = self.filter(({ eff, srcId }) => {
			if (eff.type !== 'per_tag') return true;
			if (seenEngine.has(srcId)) return false;
			seenEngine.add(srcId);
			return true;
		});
	}

	const level = getRollLevel(levelId);
	let chips = 0;
	/** 逆向卡收集到的基础分:chips 全部结算完后统一替换(多张相加,只减一次) */
	let reverseBase = 0;
	let reverseSrc = '';
	let mult = 1;
	/** 加算到倍率的部分(桂树):最后统一乘进去 —— 先长再乘,和队伍/挂卡顺序无关 */
	let multAdd = 0;
	let allowNegative = false;

	const sources: ScoreSource[] = [];
	const note = (
		srcId: string,
		kind: 'card' | 'buff',
		chips: number,
		mult: number,
		from?: string
	) => {
		if (chips === 0 && mult === 1) return;
		sources.push({ srcId, kind, chips, mult, from });
	};

	// 加成卡: chips 累加, mult 连乘
	let buffChips = 0;
	let buffMult = 1;
	for (const b of buffs) {
		const eff = BUFF_BY_ID.get(b.cardId)?.effect;
		if (!eff) continue;
		const c0 = buffChips;
		const m0 = buffMult;
		/** 加成卡效果 → buffChips / buffMult(支持 bundle 递归) */
		const applyBuff = (be: typeof eff) => {
			if (be.type === 'chips') {
				// 取整:明细行本来就是整数,而 0.5 系数会把 25 变成 12.5 —— 界面按整数显示 13,
				// 就会和引擎差半个点。记账时就取整,两边完全对得上。
				buffChips += Math.round((be.value ?? 0) * buffChipsScale);
			} else if (be.type === 'mult') {
				buffMult *= 1 + ((be.value ?? 1) - 1) * buffMultScale;
			} else if (be.type === 'chips_mult') {
				buffChips += Math.round((be.chips ?? 0) * buffChipsScale);
				buffMult *= 1 + ((be.mult ?? 1) - 1) * buffMultScale;
			} else if (be.type === 'cond') {
				if (be.cond && condHit(be.cond, levelId, level.score)) {
					buffChips += be.chips ?? 0;
					buffMult *= be.mult ?? 1;
				}
			} else if (be.type === 'own_face') {
				// 罚分卡:每有 1 颗该点数就扣分(负分流的清面工具靠它才有意义)
				const n = ownDice.filter((v) => v === be.face).length;
				if (n > 0) {
					if (be.chips) buffChips += be.chips * n;
					if (be.mult) buffMult *= Math.pow(be.mult, n);
				}
			} else if (be.type === 'straight_mult') {
				// 连号长度倍率(合璧符):连号 n 颗 → ×per^(n-from)
				const run = longestRun(ownDice);
				const from = be.from ?? 2;
				if (run > from) buffMult *= Math.round(Math.pow(be.per ?? 1, run - from) * 10) / 10;
			} else if (be.type === 'reverse') {
				// 逆向加成卡:并入同一个替换步骤
				reverseBase += be.base ?? 0;
				if (!reverseSrc) reverseSrc = b.cardId;
			} else if (be.type === 'bundle') {
				be.parts?.forEach(applyBuff);
			}
		};
		applyBuff(eff);
		note(b.cardId, 'buff', buffChips - c0, m0 === 0 ? 1 : buffMult / m0);
	}

	let baseFloor = 0;
	let floorSrcId = '';
	/** 进士:点名等级的基础分倍数(在 base 结算前累乘) */
	let baseMult = 1;
	let baseMultSrc = '';
	/** 射日仙:本回合每重掷 1 颗骰子,基础分 ×N(等级底分和筹码一起放大,不动倍率链) */
	let rerollBaseMult = 1;
	let rerollBaseSrc = '';
	let floorN = 0;
	let floorFace = 0;
	const collectFloor = (eff: TeeEffect, srcId: string) => {
		if (eff.type === 'bundle') eff.parts.forEach((p) => collectFloor(p, srcId));
		else if (eff.type === 'face_floor') {
			const n = ownDice.filter((v) => v === eff.face).length;
			const v = n > 0 ? eff.base * Math.pow(eff.per, n - 1) : 0;
			if (v > baseFloor) {
				baseFloor = v;
				floorSrcId = srcId;
				floorN = n;
				floorFace = eff.face;
			}
		}
	};
	for (const { eff, srcId } of self) collectFloor(eff, srcId);
	if (baseFloor > level.score)
		note(floorSrcId, 'card', baseFloor - level.score, 1, `自己 ${floorN} 个${floorFace}`);

	/**
	 * @param skipTeamWide 正在算「这张卡自己那只 Tee」的轮 —— 全队型效果交给下面「全队那一轮」统一发
	 * @param onScoredTee  这张卡是不是长在「正在算分的这只 Tee」身上（全队那一轮里，队友的卡是 false）
	 */
	const apply = (eff: TeeEffect, srcId: string, skipTeamWide = false, onScoredTee = true) => {
		switch (eff.type) {
			case 'level_base_mult': {
				if (!eff.levelIds.includes(levelId)) break;
				baseMult *= eff.value;
				baseMultSrc = srcId;
				break;
			}
			case 'chips': {
				const before = { chips, mult };
				chips += eff.value;
				note(srcId, 'card', chips - before.chips, before.mult === 0 ? 1 : mult / before.mult);
				break;
			}
			case 'face_count_chips': {
				// 「我」掷出的点数统计 —— 认身份,不认下标
				if (skipTeamWide || !isSelf) break;
				{
					const raw = playerRawDice ?? playerDice ?? [];
					const hits = raw.filter((d) => d === eff.face).length;
					if (hits > 0) {
						const bc = chips;
						chips += eff.chips * hits;
						note(srcId, 'card', chips - bc, 1, `${hits} 颗 ${eff.face}`);
					}
				}
				break;
			}
			case 'live_die_chips': {
				// 空四:每颗「未作废」的骰子给 per 分。作废的骰子不算 ——
				// 所以掷出 4 点反而少拿,迷月/影月/弦月这些「作废」Boss 也就天然克它。
				const bc = chips;
				const n = ownDice.length;
				chips += eff.per * n;
				note(srcId, 'card', chips - bc, 1, `${n} 颗未作废`);
				break;
			}
			case 'next_round_sell_mult': {
				// 夜市饼摊:上回合卖出过 Tee → 本回合 ×mult(不累积:卖几个都只算一次)
				if (!sellBoost) break;
				const bm = mult;
				mult *= eff.mult;
				note(srcId, 'card', 0, bm === 0 ? 1 : mult / bm, '上回合卖出过 Tee');
				break;
			}
			case 'sold_chips': {
				// 饼铺掌柜(一):每累计卖出 1 个 Tee,基础分 +per
				if (soldCount <= 0) break;
				const bc = chips;
				chips += eff.per * soldCount;
				note(srcId, 'card', chips - bc, 1, `累计卖 ${soldCount} 个`);
				break;
			}
			case 'same_face_chips': {
				// 掷出 min 个同点数(任意点数)就 +chips,有几组算几组
				const counts = [0, 0, 0, 0, 0, 0, 0];
				for (const v of ownDice) if (v >= 1 && v <= 6) counts[v]++;
				let groups = 0;
				for (let v = 1; v <= 6; v++) if (counts[v] >= eff.min) groups++;
				if (groups <= 0) break;
				const bc = chips;
				chips += eff.chips * groups;
				note(srcId, 'card', chips - bc, 1, `${groups} 组 ${eff.min} 个同点`);
				break;
			}
			case 'stuck_reroll_chips': {
				// 猜谜:重掷后点数没变(白掷)就有安慰奖,按次数累加
				if (stuckRerolls <= 0) break;
				const bc = chips;
				chips += eff.per * stuckRerolls;
				note(srcId, 'card', chips - bc, 1, `白掷 ${stuckRerolls} 次`);
				break;
			}
			case 'live_sum_chips': {
				// 花生:基础分 += per × (未作废点数和) × (未作废颗数)
				const bc = chips;
				const n = ownDice.length;
				const sum = ownDice.reduce((a, b) => a + b, 0);
				chips += eff.per * sum * n;
				note(srcId, 'card', chips - bc, 1, `未作废 ${n} 颗 · 和 ${sum}`);
				break;
			}
			case 'mult': {
				const before = { chips, mult };
				mult *= eff.value;
				note(srcId, 'card', chips - before.chips, before.mult === 0 ? 1 : mult / before.mult);
				break;
			}
			case 'chips_mult': {
				const before = { chips, mult };
				chips += eff.chips;
				mult *= eff.mult;
				note(srcId, 'card', chips - before.chips, before.mult === 0 ? 1 : mult / before.mult);
				break;
			}
			case 'cond':
				if (condHit(eff.cond, levelId, level.score)) {
					const bc = chips;
					const bm = mult;
					if (eff.chips) chips += eff.chips;
					if (eff.mult) mult *= eff.mult;
					note(srcId, 'card', chips - bc, bm === 0 ? 1 : mult / bm);
				}
				break;
			case 'team_chips': {
				const before = { chips, mult };
				if (!skipTeamWide) chips += eff.value;
				note(srcId, 'card', chips - before.chips, before.mult === 0 ? 1 : mult / before.mult);
				break;
			}
			case 'per_team_chips': {
				const before = { chips, mult };
				chips += eff.value * teamSize;
				note(srcId, 'card', chips - before.chips, before.mult === 0 ? 1 : mult / before.mult);
				break;
			}
			case 'per_buff': {
				const n = buffs.length;
				if (n <= 0) break;
				const bc = chips;
				const bm = mult;
				if (eff.as === 'chips') chips += eff.per * n;
				else mult *= Math.pow(eff.per, n);
				note(srcId, 'card', chips - bc, bm === 0 ? 1 : mult / bm, `身上 ${n} 张加成`);
				break;
			}
			case 'per_tag': {
				// 全队版:由「全队那一轮」统一发(自己那轮跳过),否则源头自己吃两次
				if (eff.teamWide && skipTeamWide) break;
				// 全队版只落到**同流派**的 Tee 身上,别的流派不吃
				if (eff.teamWide && teamCards[index]?.tag !== eff.tag) break;
				const n = new Set(teamCards.filter((c) => c?.tag === eff.tag).map((c) => c!.id)).size;
				if (n <= 0) break;
				const bc = chips;
				const bm = mult;
				if (eff.as === 'chips') chips += eff.per * n;
				// 流派倍率 = 幂(×per^N):文案是「每拥有一个独特的「X」系角色:得分 ×N」,
				// 也就是每张同流派卡再乘一层。全套改成乘算之后,这里跟着回幂。
				else mult *= Math.pow(eff.per, n);
				// 底分 = 四点颗数(用最终骰子,「1、6 视为 4」已算进去)。
				// 只算给「长这张卡的那只 Tee」—— 卡面写的是「每有 1 颗 4 点,该 Tee 基础分 +300」。
				// 这个 case 在全队那一轮里会为**每只同流派 Tee** 跑一遍,不把门就变成
				// 「凡是同流派 Tee,自己的四点也换 +300」,和文案的「该 Tee」对不上。
				const fours = ownDice.filter((d) => d === 4).length;
				const fromFour = eff.chipsPerFour && onScoredTee ? fours * eff.chipsPerFour : 0;
				chips += fromFour;
				// 注解要配得上这个数:四点换来的底分不能只写「月系 3 张」(那说的是倍率那半)
				note(
					srcId,
					'card',
					chips - bc,
					bm === 0 ? 1 : mult / bm,
					`${eff.tag}系 ${n} 张${fromFour ? ` · 自己 ${fours} 个4` : ''}`
				);
				break;
			}
			case 'on_player': {
				// 「我」掷出某等级及以上 → 给**持卡者**加基础分/倍率(文案「该 Tee」)。
				// teamWide:全队都吃(交给全队那一轮统一发,这里跳过)。
				if (eff.teamWide && skipTeamWide) break;
				const pl = getRollLevel(playerLevelId);
				if (!condHit(eff.cond, playerLevelId, pl.score)) break;
				const bc = chips;
				const bm = mult;
				if (eff.chips) chips += eff.chips;
				if (eff.mult) mult *= eff.mult;
				note(srcId, 'card', chips - bc, bm === 0 ? 1 : mult / bm, `我掷出${pl.name}`);
				break;
			}

			case 'player_die': {
				// 「我」的骰子里有几个 eff.face → 给**这张卡的持有者**加基础分/倍率。
				// 文案写「该 Tee」:触发看「我」,得利看持卡者。
				// 所以【不加 isSelf 判定】—— 它在持卡者自己那一轮(self 那轮)结算,
				// 别的 Tee 算分时不会走到这里(全队那一轮也不转发它)。
				const n = playerDice.filter((v) => v === eff.face).length;
				if (n <= 0) break;
				const bc = chips;
				const bm = mult;
				if (eff.chips) chips += eff.chips * n;
				if (eff.mult) mult *= Math.pow(eff.mult, n);
				note(srcId, 'card', chips - bc, bm === 0 ? 1 : mult / bm, `我 ${n} 个${eff.face}`);
				break;
			}

			case 'self_mult': {
				// 「我」的得分 ×per(无条件)。归「我」——持卡者是谁不重要。
				// 只在「全队那一轮」被调(见下方 allSelf 循环),所以持卡者≠「我」时也生效。
				if (!isSelf) break;
				const before = { chips, mult };
				mult *= eff.per;
				note(srcId, 'card', chips - before.chips, before.mult === 0 ? 1 : mult / before.mult);
				break;
			}
			case 'player_die_mult': {
				// 星河:「我」每有 1 颗**作废**的骰子,给**这张卡的持有者**加基础分/倍率。
				// 文案写「该 Tee」—— 受益人是持卡者自己,不是「我」。
				// 所以【不加 isSelf 判定】:它在持卡者自己那一轮(self 那轮)结算。
				// 别的 Tee 算分时不会走到这里 —— 全队那一轮只挑 self_mult / bundle 转发。
				// 作废颗数按**「我」的**骰子算(文案是「我每有 1 颗作废骰子」),
				// 不是持卡者自己的 —— 持卡者的骰面与这条无关。playerDice 就是「我」那一手。
				const n = 6 - playerDice.length;
				if (n <= 0) break;
				const bc = chips;
				if (eff.chips) chips += eff.chips * n; // 每颗作废 +30
				const bm = mult;
				mult *= Math.pow(eff.per, n); // ×1.5^n
				note(srcId, 'card', chips - bc, bm === 0 ? 1 : mult / bm, `我作废 ${n} 颗`);
				break;
			}

			case 'sum_chips': {
				const before = { chips, mult };
				chips += eff.per * diceSum;
				note(srcId, 'card', chips - before.chips, before.mult === 0 ? 1 : mult / before.mult);
				break;
			}
			case 'own_face': {
				const n = ownDice.filter((v) => v === eff.face).length;
				if (n <= 0) break;
				const bc = chips;
				const bm = mult;
				if (eff.chips) chips += eff.chips * n;
				if (eff.mult) mult *= Math.pow(eff.mult, n);
				if (eff.multByCount) mult *= n;
				note(srcId, 'card', chips - bc, bm === 0 ? 1 : mult / bm, `自己 ${n} 个${eff.face}`);
				break;
			}
			case 'own_face_grow': {
				// 桂树(累计版):倍率 = base + per ×(**历史累计颗数** + 本关颗数)。
				// 排在后面的 Tee 会立刻吃到刚加的成长(时机与 scaling_mult 对齐)。
				const n = ownDice.filter((v) => v === eff.face).length;
				// 历史累计在 growth[srcId] 里(页面在**回合结束**才写进去,所以同一回合里
				// 排在后面的 Tee 吃不到刚加的成长)
				const banked = growth[srcId] ?? 0;
				const beforeAdd = multAdd;
				multAdd += eff.base - 1 + eff.per * (banked + n);
				note(
					srcId,
					'card',
					0,
					1 + beforeAdd === 0 ? 1 : (1 + multAdd) / (1 + beforeAdd),
					`本关 ${n} 个${eff.face} · 累计 ${banked + n} 个`
				);
				break;
			}
			case 'own_face_add': {
				// 该 Tee 自己的骰子里每颗 face 点:倍率 **+per**(桂树)。
				// 这是「乘值在增长」——同一层倍率上加,不是再乘一层。
				const n = ownDice.filter((v) => v === eff.face).length;
				const beforeAdd = multAdd;
				// 基值也在这个乘值里(1.15 + 0.05n)—— 所以整条链是「先长再乘」:这里只长,最后统一乘
				multAdd += eff.base - 1 + eff.per * n;
				note(
					srcId,
					'card',
					0,
					1 + beforeAdd === 0 ? 1 : (1 + multAdd) / (1 + beforeAdd),
					`自己 ${n} 个${eff.face}`
				);
				break;
			}
			case 'straight_chips': {
				// 「连号里每颗骰子 +per」按字面算:**落在任何一条连号里的骰子**都算,
				// 不只看最长那一条(1 6 5 5 2 1 有两连 → 6 颗全算;原来只算最长那条 = 2 颗)。
				// 注意:倍率那边(straight_mult)仍按**最长连号长度** —— 否则「两条 2 连」会白送 ×16。
				const n = straightDiceCount(ownDice);
				if (n < 2) break;
				const bc = chips;
				chips += eff.per * n;
				note(srcId, 'card', chips - bc, 1, `连号 ${n} 颗`);
				break;
			}
			case 'straight_mult': {
				// 连号越长越猛:连号 n 颗 → ×per^(n-from)。这是连号流的引擎 ——
				// 原来那套乘数全锁在「对堂(6 连)」上,而那是 ~1.5% 的事件,等于按不出来。
				const run = longestRun(ownDice);
				const from = eff.from ?? 2;
				if (run <= from) break;
				const bm = mult;
				// 倍率按一位小数取整:结算行写的是 ×2.3,实际乘的也得是 2.3
				mult *= Math.round(Math.pow(eff.per, run - from) * 10) / 10;
				note(srcId, 'card', 0, bm === 0 ? 1 : mult / bm, `连号 ${run} 颗`);
				break;
			}
			case 'per_extra_roll': {
				// 每多 1 次投掷机会(自身 +1 也算):倍率 ×per^n —— 配同名加成卡规则,上限可预期
				if (extraRolls <= 0) break;
				const bm = mult;
				mult *= Math.pow(eff.per, extraRolls);
				note(srcId, 'card', 0, bm === 0 ? 1 : mult / bm, `多掷 ${extraRolls} 次`);
				break;
			}
			case 'per_reroll': {
				if (rerolled <= 0) break;
				const bc = chips;
				const bm = mult;
				if (eff.chips) chips += eff.chips * rerolled;
				// 基础分侧:先记账,末尾和等级底分一起放大(免得受效果先后顺序影响)
				if (eff.chipsMult) {
					rerollBaseMult *= Math.pow(eff.chipsMult, rerolled);
					rerollBaseSrc = srcId;
				}
				if (eff.mult) mult *= Math.pow(eff.mult, rerolled);
				note(srcId, 'card', chips - bc, bm === 0 ? 1 : mult / bm, `重掷 ${rerolled} 颗`);
				break;
			}
			case 'reverse': {
				// 逆向:这里只登记基础分,不动 chips ——
				// chips 全部结算完之后、mult 之前再统一替换(见函数末尾)
				reverseBase += eff.base + (eff.perRound ?? 0) * ((round ?? 1) - 1);
				if (!reverseSrc) reverseSrc = srcId;
				break;
			}
			case 'face_ladder':
				break; // 判定层的事(judgeRoll 里按 faceFloor 抬档)
			case 'team_scale': {
				const bm = mult;
				mult *= Math.pow(eff.per, Math.max(0, teamSize - 1));
				if (eff.fullBonus && teamSize >= TEAM_LIMIT) mult *= eff.fullBonus;
				note(srcId, 'card', 0, bm === 0 ? 1 : mult / bm, `${teamSize} 人队伍`);
				break;
			}
			case 'coin_mult': {
				const bm = mult;
				const steps = Math.floor((coins ?? 0) / eff.perCoin);
				mult *= Math.pow(eff.per, steps);
				note(srcId, 'card', 0, bm === 0 ? 1 : mult / bm, `${coins ?? 0} 月饼币`);
				break;
			}
			case 'growth_mult': {
				const bm = mult;
				const rounds = growth[srcId] ?? 0;
				mult *= Math.pow(1 + eff.per, rounds);
				note(srcId, 'card', 0, bm === 0 ? 1 : mult / bm, `第 ${rounds + 1} 关`);
				break;
			}
			case 'sell_scale': {
				if (soldCount <= 0) break;
				const bm = mult;
				mult *= Math.pow(eff.per, soldCount);
				note(srcId, 'card', 0, bm === 0 ? 1 : mult / bm, `累计卖 ${soldCount} 个 Tee`);
				break;
			}
			case 'relay_left': {
				if (!leftScore) break;
				const bc = chips;
				chips += eff.share * leftScore;
				note(srcId, 'card', chips - bc, 1, `接力左边 ${leftScore}`);
				break;
			}
			case 'sum_mult': {
				const bm = mult;
				const over = Math.max(0, diceSum - eff.from);
				mult *= Math.pow(eff.per, over);
				note(srcId, 'card', 0, bm === 0 ? 1 : mult / bm, `和值 ${diceSum}`);
				break;
			}
			case 'scaling_mult': {
				const bm = mult;
				mult *= 1 + (growth[srcId] ?? 0);
				note(srcId, 'card', 0, bm === 0 ? 1 : mult / bm);
				break;
			}
			case 'bundle':
				eff.parts.forEach((p) => apply(p, srcId, skipTeamWide, onScoredTee));
				break;
			default:
				break; // team_mult / economy / interest / extra_roll / set_* / self_mods / level_up / copy_right 不在这里计分
		}
	};

	// 自己卡牌的效果(跳过全队效果,免得和下面那轮重复计算)
	for (const { eff, srcId } of self) apply(eff, srcId, true);
	for (let j = 0; j < allSelf.length; j++) {
		// 这一轮里跑的是「全队」的效果,但每张卡还是长在某一只 Tee 身上 ——
		// per_tag 的「四点换底分」只归它自己那只(见上面的 chipsPerFour)。
		const onScoredTee = j === index;
		for (const { eff, srcId } of allSelf[j]) {
			if (eff.type === 'team_chips') apply(eff, srcId, false, onScoredTee);
			else if (eff.type === 'on_player' && eff.teamWide) apply(eff, srcId, false, onScoredTee);
			// 流派流的传说档:一张卡把全队同流派都抬起来
			else if (eff.type === 'per_tag' && eff.teamWide) apply(eff, srcId, false, onScoredTee);
			// 重复牌倍率:卡在谁身上都生效,但只抬主 Tee(自己那一轮已跳过)
			// self_mult(「我」得分 ×N)与 player_die_mult(给持卡者)归属不同:
			//   · self_mult  → 落在「我」身上,持卡者是谁不重要 → 在这一轮(全队)转发;
			//   · player_die_mult → 落在持卡者身上 → 已经在上面 self 那一轮算过,不再转发。
			// bundle 里两种都可能包着,逐个挑出来。
			else if (eff.type === 'self_mult') apply(eff, srcId, false, onScoredTee);
			else if (eff.type === 'bundle') {
				for (const p of eff.parts) {
					if (p.type === 'self_mult') apply(p, srcId, false, onScoredTee);
				}
			}
		}
	}
	// 相邻 Tee 是指向别人的支援卡:站在我左边/右边的人给我加成
	for (let j = 0; j < allSelf.length; j++) {
		if (j === index) continue;
		const isLeft = j === index - 1;
		const isRight = j === index + 1;
		if (!isLeft && !isRight) continue;
		for (const { eff, srcId } of allSelf[j]) {
			if (eff.type !== 'neighbor') continue;
			const want = eff.side === 'both' ? true : eff.side === 'left' ? isRight : isLeft;
			if (!want) continue;
			const bc = chips;
			const bm = mult;
			if (eff.chips) chips += eff.chips;
			if (eff.mult) mult *= eff.mult;
			const from = cardById(srcId)?.name ?? srcId;
			note(
				srcId,
				'card',
				chips - bc,
				bm === 0 ? 1 : mult / bm,
				`来自${isLeft ? '左' : '右'}侧 ${from}`
			);
			void from;
		}
	}

	const baseRaw = Math.max(level.score, baseFloor);
	const baseScaled = baseRaw * baseMult;
	// 射日仙:每重掷一颗,整块基础分 ×N —— 等级底分、卡牌筹码、加成卡筹码一起放大
	// (所以它能和道具的倍率叠着爆;作用在基础分侧而不是得分侧)
	if (rerollBaseMult !== 1) {
		chips *= rerollBaseMult;
		buffChips *= rerollBaseMult;
	}
	const base = baseScaled * rerollBaseMult;
	// 逆向:chips 全部结算完、mult 之前,把「本回合已得的净值」整个替换掉 ——
	// chips = reverseBase − 净值。掷得越漂亮(净值越高)逆向分越低,反之吃惩罚。
	const net = base + chips + buffChips;
	const swapped = reverseBase > 0 ? reverseBase - net : null;
	if (swapped !== null) {
		chips = swapped - base - buffChips; // 代进下面的算式后正好等于 swapped
		// 不写进 chips 加算行:它语义上是「改写」,单独带 swap 给界面渲染
		sources.push({
			srcId: reverseSrc,
			kind: 'card',
			chips: swapped,
			mult: 1,
			swap: { from: net }
		});
	}
	// 一律取整。加减项本来就是整数(底分 10/20/40…、筹码 5/10/25…),小数只可能来自
	// 倍率相乘(×1.35×N、×1.4、×2.5 这类),而最小的一手也有 10 分、典型得分几百到上万 ——
	// 那半个点没有任何玩法意义,却让记分板一直挂着小数点、结算时又要突变成整数。
	// 取整放在**唯一的出口**上,所以回合内的乘算仍然精确,只是最终得分是整数。
	// 先长再乘:加算到倍率的部分在这里统一乘进最终倍率
	mult *= 1 + multAdd;
	// 这两条都是「把基础分侧那半截放大」,以前都把差值塞进 chips 槽,界面就渲染成「+N」——
	// 和卡面写的「×N」对不上(射日仙最明显:×1.5/颗 却显示成 +3900)。
	// 现在按各自真实语义出:能整块放大的(射日仙)出乘算行,只动等级底分的(进士系)留在加算行但带注解。
	if (baseMult !== 1)
		// 进士系只把等级底分翻倍,后面加进来的筹码不跟着走 ——
		// 出成 ×N 会让界面把筹码也乘上去,和引擎对不上,所以只能是「+差值」+「等级分 ×N」注解。
		note(baseMultSrc, 'card', baseScaled - baseRaw, 1, `等级分 ×${baseMult}`);
	if (rerollBaseMult !== 1)
		// 射日仙:底分和所有筹码一起放大 —— 这是对整个小计的乘,出乘算行才对得上卡面
		note(rerollBaseSrc, 'card', 0, rerollBaseMult, `重掷 ${rerolled} 颗`);
	for (const sc of skillChips) {
		chips += sc.chips;
		note(sc.srcId, 'card', sc.chips, 1, sc.from);
	}
	// 主动技的加值:和值技(点数和 ×N 计入基础分)与田螺都走这里 ——
	// **必须在乘算之前**进 chips、乘算也要并进 mult,不然这份分吃不到倍率链。
	if (skillMult) {
		const bm = mult;
		mult *= skillMult.mult;
		note(skillMult.srcId, 'card', 0, bm === 0 ? 1 : mult / bm, skillMult.from);
	}
	const raw = Math.round((base + chips + buffChips) * mult * buffMult);
	const netChips = chips + buffChips;
	const total = swapped !== null || allowNegative || netChips < 0 ? raw : Math.max(0, raw);
	return {
		base,
		chips: chips + buffChips,
		mult: mult * buffMult,
		teamMult: 1,
		total,
		// 明细行只给界面看(结算逐条) —— 这里逐个取整,免得出现「+617.28 分」这种行
		sources: sources.map((s) => ({
			...s,
			chips: Math.round(s.chips),
			swap: s.swap ? { from: Math.round(s.swap.from) } : s.swap
		}))
	};
};

export const decayBuffs = (team: TeamTee[]): void => {
	for (const t of team) {
		t.buffs = t.buffs
			.map((b) => ({ ...b, turnsLeft: b.turnsLeft - 1 }))
			.filter((b) => b.turnsLeft > 0);
	}
};

export const calcTeamTotal = (
	scores: number[],
	cards: (TeeCard | null)[]
): {
	total: number;
	teamMult: number;
	relay: number;
	relayLines: { cardId: string; from: number[]; value: number }[];
	ratioBonus: number;
	ratioLines: { cardId: string; own: number; neighbor: number; mult: number; bonus: number }[];
} => {
	let teamMult = 1;
	let relay = 0;
	let ratioBonus = 0;
	const relayLines: { cardId: string; from: number[]; value: number }[] = [];
	const ratioLines: {
		cardId: string;
		own: number;
		neighbor: number;
		mult: number;
		bonus: number;
	}[] = [];
	const addRelay = (eff: TeeEffect & { type: 'relay_pct' }, i: number, cardId: string) => {
		const idx = eff.from === 'left' ? [i - 1] : eff.from === 'right' ? [i + 1] : [i - 1, i + 1];
		const from = idx.filter((j) => j >= 0 && j < scores.length && j !== i);
		const v = (eff.flat ?? 0) + from.reduce((s, j) => s + scores[j] * eff.pct, 0);
		if (v > 0) {
			relay += v;
			relayLines.push({ cardId, from, value: Math.round(v) });
		}
	};
	/** 队伍里还有没有「我」(没卡的那一位) */
	const hasMe = cards.some((c) => c === null);
	const walk = (eff: TeeEffect, i: number, cardId: string) => {
		if (eff.type === 'team_mult') teamMult *= eff.value;
		// 饼铺掌柜(二):队伍里没有「我」(被归家卖掉)→ 队伍总分 ×mult
		else if (eff.type === 'no_me_team_mult') {
			if (!hasMe && scores[i] > 0) teamMult *= eff.mult;
		} else if (eff.type === 'relay_pct') addRelay(eff, i, cardId);
		else if (eff.type === 'team_ratio') {
			// 只放大「我」这一份再加进总分,不再乘全队总分:
			const own = Math.max(1, scores[i] ?? 0);
			// 邻居看哪边:right = 只认右邻;left = 只认左邻(0 号位没有左邻 = 不触发);
			// side = 右邻优先,他在 6 号位(没有右邻)时才用左邻 —— 不然这张卡得先卖个 Tee 才活
			const nb =
				eff.from === 'right'
					? (scores[i + 1] ?? 0)
					: eff.from === 'left'
						? (scores[i - 1] ?? 0)
						: (scores[i + 1] ?? scores[i - 1] ?? 0);
			if (nb > 0 && nb / own !== 1) {
				const mult = nb / own;
				const bonus = (scores[0] ?? 0) * mult;
				ratioBonus += bonus;
				ratioLines.push({ cardId, own, neighbor: nb, mult, bonus });
			}
		} else if (eff.type === 'bundle') eff.parts.forEach((p) => walk(p, i, cardId));
	};
	cards.forEach((card, i) => {
		if (card) walk(card.effect, i, card.id);
	});
	const total = Math.round((scores.reduce((a, b) => a + b, 0) + relay + ratioBonus) * teamMult);
	return {
		total,
		teamMult,
		relay: Math.round(relay),
		ratioBonus: Math.round(ratioBonus),
		relayLines,
		ratioLines
	};
};

// ---- 奖励 ----

/** 过关奖励: 基础 + 关数递增 */
/**
 * 每关基础收入。放缓过一版:原来每 3 关 +3,爬到 R16 就是 20 🥮/关,
 * 而一关真正值得买的道具只要 8~12 🥮 —— 钱只进不出。现在每 4 关 +2,
 * R16 只有 13 🥮/关(约原来的 2/3),买两张卡就要掂量一下。
 * (溢出奖励 overflowReward 只在超目标时才给,曲线拉陡后基本拿不到了。)
 */
export const roundReward = (n: number): number => 5 + Math.floor((n - 1) / 4) * 2;

export const overflowReward = (score: number, target: number): number =>
	Math.min(8, Math.floor((Math.max(0, score - target) / Math.max(1, target)) * 2));

export const economyReward = (cards: TeeCard[], mooncakes = 0): number =>
	cards.reduce((s, c) => {
		const walk = (eff: TeeEffect): number => {
			if (eff.type === 'economy') return eff.per;
			if (eff.type === 'interest') return Math.floor(mooncakes / eff.perCoins) * eff.per;
			if (eff.type === 'bundle') return eff.parts.reduce((a, p) => a + walk(p), 0);
			return 0;
		};
		return s + walk(c.effect);
	}, 0);

// ---- 卡池工具 ----

/** 卡池(中秋集市)洗牌 */
export const shuffle = <T>(arr: T[]): T[] => {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
};

export const cardById = (id: string): TeeCard | null => CARD_BY_ID.get(id) ?? null;

export const CARD_POOL = CARDS;

// ---- 存档 ----

export interface SaveData {
	bestScore: number;
	bestRound: number;
	plays: number;
}

const SAVE_KEY = 'midautumn:save';

const readSave = (): SaveData => {
	try {
		const raw = localStorage.getItem(SAVE_KEY);
		if (raw) return JSON.parse(raw) as SaveData;
	} catch {
		// ignore
	}
	return { bestScore: 0, bestRound: 0, plays: 0 };
};

export const getSave = readSave;

export const saveResult = (score: number, round: number) => {
	const save = readSave();
	save.plays += 1;
	if (score > save.bestScore) {
		save.bestScore = score;
		save.bestRound = round;
	}
	try {
		localStorage.setItem(SAVE_KEY, JSON.stringify(save));
	} catch {
		// ignore
	}
	return save;
};

export const clearSave = () => {
	try {
		localStorage.removeItem(SAVE_KEY);
	} catch {
		// ignore
	}
};

// ---- 局内存档:退出页面重进还能接着打 ----
//
// 与上面的最高分/局数分开存(那个是跨局战绩,这个是当前这一局)。
// 避免把动画中途的半成品状态写进去(重新进就是重掷本关,单机游戏不亏)。
const RUN_KEY = 'midautumn:run';
const RUN_VERSION = 5;

export type RunTeamSlot = {
	cardId: string | null;
	/** 这张是不是「我」(存档里必须带上:身份不能靠下标推) */
	isSelf?: boolean;
	/**「我」的皮肤(纯外观) */
	selfSkin?: string;
	buffs: { cardId: string; turnsLeft: number }[];
	lastScore: number;
	lastLevelId: string;
	lastDice: number[];
	/** 主动技能冷却(几关后可用) */
	charge?: number;
	/** 田螺:待按原价返还的加成卡(掷完就付) */
	refundPending?: { cardId: string; coins: number }[];
	/** 田螺:发动过主动技 → 返还减半 */
	refundHalved?: boolean;
	/** 发动过的主动技加值/乘算:算进该 Tee 的**基础分**(乘算之前),跟着存盘走 */
	skillChips?: { srcId: string; chips: number; from?: string }[];
	skillMult?: { srcId: string; mult: number; from?: string };
	/** 这一手哪些骰子作废(高照抄作废状态用) */
	lastVoid?: number[];
};

export type RunOp =
	| { kind: 'set_point'; count: number; point: number; srcId?: string; from?: number }
	| {
			kind: 'set_any';
			count: number;
			pick?: number;
			srcId?: string;
			from?: number;
			options?: number[];
	  }
	| { kind: 'bump'; count: number; step?: number; srcId?: string }
	| { kind: 'voidpick'; count: number; srcId?: string };

export type RunSave = {
	v: number;
	phase: string;
	round: number;
	bossId: string | null;
	target: number;
	mooncakes: number;
	runScore: number;
	growth: GrowthMap;
	team: RunTeamSlot[];
	soldTees: number;
	/** 旧的「本回合卖了几张」(每回合上限 2 个那套) —— 已废弃,读档忽略 */
	soldThisRound?: number;
	shopBuffs: string[];
	shopSold: string[];
	shopLocks: (string | null)[];
	buffInventory: Record<string, number>;
	draftChoices: string[];
	draftPicked: number[];
	rewardChoices: string[];

	// ---- v2:回合内的细节状态 ----
	dice: number[];
	/** 正在掷的是第几个 Tee */
	currentTee: number;
	currentScore: number;
	roundTotal: number;
	countedTee: number;
	settlePreview: number;
	diceSum: number;
	lastLevelId: string;
	rollsLeft: number;
	rerollCount: number;
	rerollAllUsed: boolean;
	choosing: boolean;
	rerollSel: boolean[];
	rollMask: boolean[];
	usedOpSrc: string[];
	/** 本关每个道具 id 用掉的张数(退款按张算);老存档没有这个字段,读档时兜底成 {} */
	usedOpCount?: Record<string, number>;
	optedDice: number[];
	clearedVoid: number[];
	pendingAction: RunOp | null;
	pointPicker: boolean;
	setQueue: SetOp[];
	/** 待确认的主动技(srcId|skill) */
	pendingActiveKey: string | null;
	roundRewardGained: number;
	overflowGained: number;
	economyGained: number;
	finalScore: number;
	finalRunScore: number;
	finalRound: number;
	isNewBest: boolean;
	lastRewardIdx: number;
	shopPickId: string | null;
	selectedBuffId: string | null;
	speedIdx: number;
	wasRolling: boolean;
	rollKind: string;

	// ---- v6:几张重做卡的本关状态 ----
	/** 花生:本回合按下标作废的骰子(老存档没有 → 读档时兜底成 []) */
	hsVoid?: number[];
	/** 上面那份清单属于哪个 Tee */
	hsVoidTee?: number;
	/** 蜜枣:本回合已经抽过 1% 的 Tee */
	jackpotDone?: number[];
	/** 归家:已发动、等回合结算时出售「我」(数字 = 换多少月饼币) */
	homingSell?: number | null;
	/** 猜谜:本回合该 Tee 白掷了几次 */
	stuckRerolls?: number;
	/** 夜市饼摊:本回合开始前卖过 Tee */
	sellBoost?: boolean;
	/** 夜市饼摊:已经卖出、还没被下回合消费掉 */
	sellBoostPending?: boolean;
	/** 高照抄来的作废状态(位置列表)+ 属于哪个 Tee */
	sharedVoid?: number[] | null;
	sharedVoidTee?: number;
};

export const saveRun = (data: Omit<RunSave, 'v'>) => {
	try {
		localStorage.setItem(RUN_KEY, JSON.stringify({ v: RUN_VERSION, ...data }));
	} catch {
		// 隐私模式 / 配额满:存不了就算了,不能因此崩游戏
	}
};

export const loadRun = (): RunSave | null => {
	try {
		const raw = localStorage.getItem(RUN_KEY);
		if (!raw) return null;
		const data = JSON.parse(raw) as RunSave;
		if (data.v !== RUN_VERSION) {
			localStorage.removeItem(RUN_KEY);
			return null;
		}
		return data;
	} catch {
		return null;
	}
};

export const clearRun = () => {
	try {
		localStorage.removeItem(RUN_KEY);
	} catch {
		// ignore
	}
};
