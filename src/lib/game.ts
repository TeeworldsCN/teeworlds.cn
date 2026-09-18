// 月宫掷骰 · 游戏核心逻辑(关卡、Boss、计分、存档)
import { getRollLevel, hasClearVoid, judgeRoll, stripVoid, type DiceMods } from './midautumn';
import { LEVEL_LADDER, CARD_BY_ID, CARDS, condHit, type TeeCard, type TeeEffect } from './teecards';
import { longestRun } from './midautumn';
import { BUFF_BY_ID, type AppliedBuff } from './items';

// ---- 关卡 ----
//
// 每个 Tee 默认可投掷 2 次(之间可自选保留哪些骰子重投),玩家侧基线期望分 ≈ 82。
// 目标曲线在「2 次投掷基线」上重新标定:第 1 关 80 分,之后每关 ×2。
// (旧版是 1 次投掷、基线 21.5 分,目标从 20 起 —— 新基线是它的 3.8 倍)

/**
 * 每关目标分数。
 *
 * 由通过率模拟标定(`bun run tools/zhongqiu/balance.ts run`),不是拍脑袋的指数曲线。
 * 关键教训:过关看的是**分位数**不是均值 —— 均值被状元/插花那几把大奖拉得很高,
 * 但玩家实际是靠中位数附近的成绩过关的。旧曲线(R1=150)落在 p28 上,
 * 意味着第 1 关就有 28% 概率暴死。
 *
 * 当前曲线对应的目标过关率:R1 93% → R5 82% → R10 58% → R13 36% → R16 17%
 * (第 1 关故意压到「随便掷都能过」,当作教学关;真正的墙在 R13 之后)
 */
export const TARGETS = [
	70, 140, 220, 405, 500, 590, 640, 680, 705, 705, 1005, 1090, 1150, 1440, 1480, 1630
];

export const roundTarget = (n: number): number => {
	if (n <= TARGETS.length) return TARGETS[n - 1];
	// 之后按 ×1.15 递增:此时只有集中叠加成 + 成长卡才撑得住
	const last = TARGETS[TARGETS.length - 1];
	return Math.round((last * Math.pow(1.15, n - TARGETS.length)) / 10) * 10;
};

/** 每 3 关为一个 Ante */
export const anteOf = (n: number) => Math.ceil(n / 3);

/** 是否 Boss 关(每 Ante 的第 3 关) */
export const isBossRound = (n: number) => n % 3 === 0;

/** 每个 Tee 的基础投掷次数(掷一次 + 自选保留后重掷一次) */
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
	/** 本关每个 Tee 的投掷次数加成(负数 = 少掷) */
	rollsBonus?: number;
	/** 温和池:第 1~6 关(前两个 Ante)只会遇到这些 */
	mild?: boolean;
}

/**
 * Boss 设计口径(重要):
 *
 * **骰子特效本身只会是中性或增益** —— 平移是所有面的置换,同点分布不变(恒 ×1.00);
 * 「视为」把两个面合并,同点组合概率暴涨。所以每个 Boss 的难度一律靠 `targetMult`
 * 校准到同一条线上(见 tools/zhongqiu/boss.ts 的「等难度目标」列),
 * 骰子特效只负责「换个玩法」。
 *
 * 伪点规则(见 midautumn.ts): 由「视为」改写来的点数不能凑同点组合,
 * 所以「6 视为 3」是真的减益(×0.93),而不是 ×1.78 的礼包。
 */
export const BOSSES: Boss[] = [
	// ---- 温和池:第 1~6 关 ----
	{
		id: 'heiyue',
		name: '黑月',
		emoji: '🌑',
		desc: '目标 ×1.05',
		targetMult: 1.05,
		mild: true
	},
	{
		id: 'miyue',
		name: '迷月',
		emoji: '🌫️',
		desc: '本关掷出的 6 作废；目标 ×0.93',
		mods: { void: [6] },
		targetMult: 0.93,
		mild: true
	},
	{
		id: 'yingyue',
		name: '影月',
		emoji: '🌒',
		desc: '本关掷出的 3 作废；目标 ×0.97',
		mods: { void: [3] },
		targetMult: 0.97,
		mild: true
	},
	// ---- 第 7 关起 ----
	{
		id: 'wuyue',
		name: '雾月',
		emoji: '🌁',
		desc: '本关同点组合不作数；目标 ×0.97',
		mods: { noSameFace: true },
		targetMult: 0.97
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
		desc: '本关掷出的 4 作废；目标 ×0.42',
		mods: { void: [4] },
		targetMult: 0.42
	},
	{
		id: 'xueyue',
		name: '血月',
		emoji: '🔴',
		desc: '等级封顶到状元；目标 ×1.05',
		mods: { levelCap: 'zhuang_yuan' },
		targetMult: 1.05
	},
	{
		id: 'jimoon',
		name: '疾月',
		emoji: '🌙',
		desc: '每个 Tee 多投掷 1 次；目标 ×2',
		rollsBonus: 1,
		targetMult: 2
	}
];

/** 温和池 id(第 1~6 关) */
export const MILD_BOSS_IDS = BOSSES.filter((b) => b.mild).map((b) => b.id);

/** 第 n 关的 Boss: 前 2 个 Ante 用温和池,之后全池 */
export const getBoss = (n: number): Boss => {
	const pool = BOSSES.filter((b) => (n <= 6 ? b.mild : true));
	return pool[Math.floor(Math.random() * pool.length)];
};

export const getBossById = (id: string): Boss => BOSSES.find((b) => b.id === id) ?? BOSSES[0];

// ---- 队伍 ----

export interface TeamTee {
	/** 卡牌 id,主 Tee(玩家皮肤)为 null */
	cardId: string | null;
	/** 玩家皮肤(仅主 Tee) */
	playerSkin?: string;
	/** 本关该 Tee 的得分(掷完后) */
	lastScore: number;
	lastLevelId: string;
	lastDice: number[];
	/** 身上挂载的加成卡(未消耗的回合) */
	buffs: AppliedBuff[];
	/** 主动技能剩余冷却回合(0/未定义 = 可用) */
	charge?: number;
}

export const TEAM_LIMIT = 6;

/** 成长卡(广寒宫/桂树)的成长值: cardId -> 已叠加层数 */
export type GrowthMap = Record<string, number>;

/** 过关后成长卡叠层 */
export const applyGrowth = (cards: TeeCard[], growth: GrowthMap): GrowthMap => {
	const next = { ...growth };
	const walk = (eff: TeeEffect, id: string) => {
		// scaling_mult 记的是「每关 +per」的累加值(线性),计分时 mult *= 1 + growth
		if (eff.type === 'scaling_mult') next[id] = (next[id] ?? 0) + eff.per;
		// growth_mult 是复利,记的是**关数**,计分时 mult *= (1+per)^growth
		// —— 两者语义不同,混用会让复利卡永远停在 ×1(踩过:桂树/广寒宫不生效)
		else if (eff.type === 'growth_mult') next[id] = (next[id] ?? 0) + 1;
		else if (eff.type === 'bundle') eff.parts.forEach((p) => walk(p, id));
	};
	for (const card of cards) walk(card.effect, card.id);
	return next;
};

// ---- 效果解析(copy_right / bundle) ----

/** 一条生效中的效果,附带它来自哪张卡(成长卡的层数按来源卡 id 查) */
export interface EffectiveEffect {
	eff: TeeEffect;
	srcId: string;
}

/**
 * 解析第 i 个 Tee 实际生效的效果列表:
 * - bundle 展开
 * - copy_right 就地替换成右侧 Tee 的卡牌效果(只复制一层,避免互相复制无限递归)
 * - 最右侧的 copy_right 复制不到东西,等于空
 */
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
	/** 关卡级加成(Boss 的 rollsBonus,负数=少掷),至少保留 1 次 */
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

/** 判定等级提升 count 档(一秀 → 二举 → 四进 …) */
export const upgradeLevel = (levelId: string, count: number): string => {
	if (count <= 0) return levelId;
	const i = LEVEL_LADDER.indexOf(levelId as (typeof LEVEL_LADDER)[number]);
	if (i < 0) return levelId;
	return LEVEL_LADDER[Math.min(LEVEL_LADDER.length - 1, i + count)];
};

/** 加成卡等级保底: 取所有保底里最高的那个 */
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

/** 该 Tee 的全部改点操作(卡牌 + 加成卡),按顺序执行 */
export interface SetOp {
	kind: 'point' | 'any' | 'bump';
	count: number;
	point?: number;
	/** 来源(卡牌/加成卡 id)——「未使用就归还」的道具靠它记账 */
	srcId?: string;
}

export const collectSetOps = (self: EffectiveEffect[], buffs: AppliedBuff[] = []): SetOp[] => {
	// （连号流:骰子点数的「+1」改法见 BuffEffect.bump_point —— 结算完由玩家点一颗骰子）
	const ops: SetOp[] = [];
	/** 结构化的效果节点(卡牌效果与加成卡效果共用字段,bundle 递归用) */
	type AnyEff = { type: string; parts?: AnyEff[]; count?: number; point?: number };
	/** bundle 必须递归:藏在复合效果里的 set_point/set_any 也要收,
	 *  否则「缺月/残月」这类 card = bundle[reverse, set_point] 会在游戏里静默没有操作 */
	const walk = (e: AnyEff, srcId: string) => {
		if (e.type === 'bundle') {
			(e.parts ?? []).forEach((p) => walk(p, srcId));
			return;
		}
		if (e.type === 'set_point')
			ops.push({ kind: 'point', count: e.count ?? 1, point: e.point ?? 4, srcId });
		else if (e.type === 'set_any') ops.push({ kind: 'any', count: e.count ?? 1, srcId });
		else if (e.type === 'bump_point') ops.push({ kind: 'bump', count: e.count ?? 1, srcId });
	};
	for (const { eff, srcId } of self) walk(eff as unknown as AnyEff, srcId);
	for (const b of buffs) {
		const e = BUFF_BY_ID.get(b.cardId)?.effect;
		if (e) walk(e as unknown as AnyEff, b.cardId);
	}
	return ops;
};

/** 该 Tee 的充能主动技能(卡牌 + 加成卡) */
export interface ActiveSkill {
	srcId: string;
	skill: 'chips' | 'left_chips' | 'retry';
	value: number;
	cooldown: number;
}

export const activeSkills = (self: EffectiveEffect[], buffs: AppliedBuff[] = []): ActiveSkill[] => {
	const out: ActiveSkill[] = [];
	for (const { eff, srcId } of self) {
		if (eff.type === 'active')
			out.push({
				srcId,
				skill: eff.skill,
				value: eff.value ?? 0,
				cooldown: eff.cooldown
			});
	}
	void buffs; // 目前只有卡牌带主动技能(加成卡时效太短,冷却没意义)
	return out;
};

/** 还能不能发动(冷却 0 即可) */
export const activeReady = (tee: TeamTee | undefined, skill: ActiveSkill): boolean =>
	(tee?.charge ?? 0) <= 0;

/** 回合开始:冷却 -1(和加成卡一起结算) */
export const tickCharge = (team: TeamTee[]): void => {
	for (const t of team) t.charge = Math.max(0, (t.charge ?? 0) - 1);
};

/** 该 Tee 自己的骰子变换(卡牌 + 加成卡),与 Boss 修饰叠加 */
export const selfDiceMods = (
	self: EffectiveEffect[],
	buffs: AppliedBuff[] = []
): DiceMods | undefined => {
	const mods: DiceMods[] = [];
	// bundle 要拆开看,否则「连珠灯」这种复合卡里的阶梯挂不上(踩过)
	const collect = (eff: TeeEffect) => {
		if (eff.type === 'self_mods') mods.push(eff.mods);
		// 连号阶梯:判定层的规则,挂在 DiceMods 上一起传给 judgeRoll
		else if (eff.type === 'straight_ladder') mods.push({ straightFloor: true });
		// 点数阶梯:非 4 点的同点也按 4 点线的档位结算
		else if (eff.type === 'face_ladder') mods.push({ faceFloor: true });
		else if (eff.type === 'bundle') eff.parts.forEach(collect);
	};
	for (const { eff } of self) collect(eff);
	for (const b of buffs) {
		const e = BUFF_BY_ID.get(b.cardId)?.effect;
		if (e?.type === 'dice_mods' && e.mods) mods.push(e.mods);
		// 月食卡:解除本关的「点数作废」
		if (e?.type === 'clear_void') mods.push({ clearVoid: true });
	}
	if (mods.length === 0) return undefined;
	return mods.length === 1 ? mods[0] : { chain: mods };
};

/** 合并两段骰子修饰(任意一段为空就返回另一段) */
export const mergeMods = (a?: DiceMods, b?: DiceMods): DiceMods | undefined => {
	if (!a) return b;
	if (!b) return a;
	return { chain: [a, b] };
};

/**
 * 主 Tee(「我」)的**团队骰子规则**:队友手里的「我掷出的 X 视为 4」类卡。
 * 只对位置 0 生效 —— 5 张集齐就能把「我」的骰子全变成 4,是主 Tee 流的核。
 */
export const playerDiceMods = (cards: (TeeCard | null)[]): DiceMods | undefined => {
	const map: Record<number, number> = {};
	const walk = (eff: TeeEffect) => {
		if (eff.type === 'map_player_die') map[eff.from] = eff.to;
		else if (eff.type === 'bundle') eff.parts.forEach(walk);
	};
	for (const c of cards) if (c) walk(c.effect);
	return Object.keys(map).length ? { map } : undefined;
};

/**
 * 与 Boss 修饰合成(角色改造先结算,再吃 Boss 的)。
 * 带「解除作废」(月食卡)时,先把 Boss 的作废点数摘掉 —— 顺序反过来的话
 * 作废就已经生效了,卡就没意义了。
 */
/** 空修饰(摘下作废后可能只剩空壳) */
const isEmptyMods = (m?: DiceMods): boolean =>
	!m ||
	(!m.map &&
		m.shift === undefined &&
		!m.void?.length &&
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

/** 掷出"再接再厉"时是否触发自动重掷全部(后羿) */
export const hasRerollAllOnNone = (self: EffectiveEffect[]): boolean =>
	self.some(({ eff }) => eff.type === 'reroll_all_on_none');

// ---- 计分 ----

/** 一条得分来源(结算逐条展示用) */
export interface ScoreSource {
	/** 来源 id: 卡牌 id 或加成卡 id */
	srcId: string;
	/** 来源类型,决定展示时的取名字方式 */
	kind: 'card' | 'buff';
	chips: number;
	mult: number;
	/** 加成来自别处(相邻 Tee / 主 Tee 联动)时标注一下 */
	from?: string;
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

/**
 * 计算单个 Tee 的得分
 * score = (等级分 + chips) × mult
 *
 * self:  该 Tee 生效的效果(已解析 copy_right / bundle)
 * team:  全队所有 Tee 的效果(只有 team_chips 这类全队效果会被采用)
 * buffs: 身上挂载的加成卡
 */
export interface ScoreInput {
	/** 本次判定的等级 */
	levelId: string;
	/** 该 Tee 生效的效果 */
	self: EffectiveEffect[];
	/** 全队每个 Tee 生效的效果(按位置),相邻/团队统计要用 */
	allSelf: EffectiveEffect[][];
	/** 该 Tee 在队伍里的位置 */
	index: number;
	/** 全队卡牌(按位置),流派标签统计要用 */
	teamCards: (TeeCard | null)[];
	growth: GrowthMap;
	buffs: AppliedBuff[];
	teamSize: number;
	/** 判定用的骰子点数和 */
	diceSum: number;
	/** 该 Tee 自己的最终骰子(own_face 类效果用) */
	ownDice?: number[];
	/** 本回合这个 Tee 重掷了几颗骰子(per_reroll 类效果用) */
	rerolled?: number;
	/** 主 Tee(「我」,位置 0)本关的等级与最终骰子 */
	playerLevelId: string;
	playerDice: number[];
	/** 当前月饼币(coin_mult 用) */
	coins?: number;
	/** 当前关卡数(reverse.perRound / growth_mult 用) */
	round?: number;
	/** 左侧相邻 Tee 本回合已结算的得分(relay_left 用) */
	leftScore?: number;
	/** 本局**累计计入**的卖出数:每回合最多往里加 2(卖爆被限住,但倍率仍可累积) */
	soldCount?: number;
}

export const calcTeeScore = ({
	levelId,
	self,
	allSelf,
	index,
	teamCards,
	growth,
	buffs,
	teamSize,
	diceSum,
	ownDice = [],
	rerolled = 0,
	playerLevelId,
	playerDice,
	coins = 0,
	round = 1,
	leftScore = 0,
	soldCount = 0
}: ScoreInput): ScoreBreakdown => {
	// 同 id 的 per_tag 引擎卡只生效一份:卡面写的是「每拥有一个独特的 X 系角色」,
	// 「独特」应当同时约束 n 和这张卡自己 —— 拿 3 份「饼坊」不该乘 3 次。
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
	let mult = 1;
	/** 出现逆向卡时允许负分(否则总分为负会被夹到 0,逆向流就没意义了) */
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
			if (be.type === 'chips') buffChips += be.value ?? 0;
			else if (be.type === 'mult') buffMult *= be.value ?? 1;
			else if (be.type === 'chips_mult') {
				buffChips += be.chips ?? 0;
				buffMult *= be.mult ?? 1;
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
			} else if (be.type === 'reverse') {
				// 逆向加成卡:和 Tee 卡同公式
				buffChips += (be.base ?? 0) - level.score * (be.per ?? 1);
			} else if (be.type === 'bundle') {
				be.parts?.forEach(applyBuff);
			}
		};
		applyBuff(eff);
		note(b.cardId, 'buff', buffChips - c0, m0 === 0 ? 1 : buffMult / m0);
	}

	/**
	 * 同点基础分下限(face_floor):自己的 face 点有 n 颗时,基础分至少 base×per^(n-1)。
	 * 不走判定层 —— 结算横幅继续显示真实牌型,这里只多一条卡牌贡献。
	 */
	let baseFloor = 0;
	let floorSrcId = '';
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

	/** skipTeamWide: 跳过 team_chips(它由全队那一轮统一加,避免重复) */
	const apply = (eff: TeeEffect, srcId: string, skipTeamWide = false) => {
		switch (eff.type) {
			case 'chips': {
				const before = { chips, mult };
				chips += eff.value;
				note(srcId, 'card', chips - before.chips, before.mult === 0 ? 1 : mult / before.mult);
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
				// 重复角色只算一个:3 张桂影不该给 3 份倍率(那会变成 ×2.3^3)
				const n = new Set(teamCards.filter((c) => c?.tag === eff.tag).map((c) => c!.id)).size;
				if (n <= 0) break;
				const bc = chips;
				const bm = mult;
				if (eff.as === 'chips') chips += eff.per * n;
				else mult *= Math.pow(eff.per, n);
				// 底分:没有它,5 张同流派时一秀正好 320 = 状元(等于不算大于)
				// 底分 = 四点颗数(用最终骰子,「1、6 视为 4」已算进去):
				// 原来的固定 +20 会把 0 分手牌也垫起来,等于绕开掷骰这个核心动作。
				if (eff.chipsPerFour) chips += ownDice.filter((d) => d === 4).length * eff.chipsPerFour;
				note(srcId, 'card', chips - bc, bm === 0 ? 1 : mult / bm, `${eff.tag}系 ${n} 张`);
				break;
			}
			case 'on_player': {
				// teamWide 的由「全队那一轮」统一发(自己那轮要跳过,否则源头自己吃两次);
				// 非 teamWide 的只有「我」以外的人吃,「我」自己那轮直接跳过
				if (eff.teamWide ? skipTeamWide : index === 0) break;
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
				if (index === 0) break;
				const n = playerDice.filter((v) => v === eff.face).length;
				if (n <= 0) break;
				const bc = chips;
				const bm = mult;
				if (eff.chips) chips += eff.chips * n;
				if (eff.mult) mult *= Math.pow(eff.mult, n);
				note(srcId, 'card', chips - bc, bm === 0 ? 1 : mult / bm, `我的 ${n} 个${eff.face}`);
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
				// 蓝卡:倍率 = 该点数颗数(让「点数数量」本身成为流派,而不是只当保底)
				if (eff.multByCount) mult *= n;
				note(srcId, 'card', chips - bc, bm === 0 ? 1 : mult / bm, `自己 ${n} 个${eff.face}`);
				break;
			}
			case 'straight_chips': {
				const run = longestRun(ownDice);
				if (run < 3) break;
				const bc = chips;
				chips += eff.per * run;
				note(srcId, 'card', chips - bc, 1, `连号 ${run} 颗`);
				break;
			}
			case 'per_reroll': {
				if (rerolled <= 0) break;
				const bc = chips;
				const bm = mult;
				if (eff.chips) chips += eff.chips * rerolled;
				if (eff.mult) mult *= Math.pow(eff.mult, rerolled);
				note(srcId, 'card', chips - bc, bm === 0 ? 1 : mult / bm, `重掷 ${rerolled} 颗`);
				break;
			}
			case 'reverse': {
				const before = { chips, mult };
				// 逆向基础分可以随关卡成长(让负分流后期不掉队)
				const base = eff.base + (eff.perRound ?? 0) * ((round ?? 1) - 1);
				chips += base - level.score * (eff.per ?? 1);
				allowNegative = true;
				note(
					srcId,
					'card',
					chips - before.chips,
					before.mult === 0 ? 1 : mult / before.mult,
					`${base} − ${level.name}`
				);
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
				// 累积倍率,但每回合最多只往里加 2 个(计数在页面累加,这里直接用总数)
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
				eff.parts.forEach((p) => apply(p, srcId, skipTeamWide));
				break;
			default:
				break; // team_mult / economy / interest / extra_roll / set_* / self_mods / level_up / copy_right 不在这里计分
		}
	};

	// 自己卡牌的效果(跳过全队效果,免得和下面那轮重复计算)
	for (const { eff, srcId } of self) apply(eff, srcId, true);
	// 全队效果: 只有 team_chips 会作用于每个 Tee(包括自己那一份)
	for (const list of allSelf) {
		for (const { eff, srcId } of list) {
			if (eff.type === 'team_chips') apply(eff, srcId, false);
			// 主 Tee 联动里标记了 teamWide 的:全队都吃(含主 Tee 自己)
			else if (eff.type === 'on_player' && eff.teamWide) apply(eff, srcId, false);
			// 流派流的传说档:一张卡把全队同流派都抬起来
			else if (eff.type === 'per_tag' && eff.teamWide) apply(eff, srcId, false);
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
			// 他给「他的左边/右边」加成:我在他右边 → 他要 side='left' 才轮到我
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

	const base = Math.max(level.score, baseFloor);
	const raw = Math.round((base + chips + buffChips) * mult * buffMult * 100) / 100;
	// 普通卡夹到 0(避免机制意外产生负分);逆向卡 / 罚分卡导致净负分时放开
	const netChips = chips + buffChips;
	const total = allowNegative || netChips < 0 ? raw : Math.max(0, raw);
	return { base, chips: chips + buffChips, mult: mult * buffMult, teamMult: 1, total, sources };
};

/** 过关后加成卡回合数 -1, 归零移除 */
export const decayBuffs = (team: TeamTee[]): void => {
	for (const t of team) {
		t.buffs = t.buffs
			.map((b) => ({ ...b, turnsLeft: b.turnsLeft - 1 }))
			.filter((b) => b.turnsLeft > 0);
	}
};

/** 计算全队总分(个人分之和 × 团队倍率) */
export const calcTeamTotal = (
	scores: number[],
	cards: (TeeCard | null)[]
): {
	total: number;
	teamMult: number;
	/** 接力回流加进来的总分(已含在 total 里,结算动画单独播一行) */
	relay: number;
	relayLines: { cardId: string; from: number[]; value: number }[];
	/** 压分辅助:全队倍率里来自「邻居分/自己分」的那部分(结算动画可单独播) */
	ratioLines: { cardId: string; own: number; neighbor: number; mult: number }[];
} => {
	let teamMult = 1;
	let relay = 0;
	const relayLines: { cardId: string; from: number[]; value: number }[] = [];
	const ratioLines: { cardId: string; own: number; neighbor: number; mult: number }[] = [];
	/** 接力回流:所有人都掷完才算,所以只看位置、不看出手顺序 */
	const addRelay = (eff: TeeEffect & { type: 'relay_pct' }, i: number, cardId: string) => {
		const idx = eff.from === 'left' ? [i - 1] : eff.from === 'right' ? [i + 1] : [i - 1, i + 1];
		const from = idx.filter((j) => j >= 0 && j < scores.length && j !== i);
		const v = (eff.flat ?? 0) + from.reduce((s, j) => s + scores[j] * eff.pct, 0);
		if (v > 0) {
			relay += v;
			relayLines.push({ cardId, from, value: Math.round(v) });
		}
	};
	const walk = (eff: TeeEffect, i: number, cardId: string) => {
		if (eff.type === 'team_mult') teamMult *= eff.value;
		else if (eff.type === 'relay_pct') addRelay(eff, i, cardId);
		else if (eff.type === 'team_ratio') {
			// 顺序:各人分 → 接力回流 → 这个比率 → 全队倍率(teamMult)
			const own = Math.max(1, scores[i] ?? 0);
			// 右邻优先;他在 6 号位(没有右邻)时用左邻 —— 不然这张卡得先卖个 Tee 才活
			const nb =
				eff.from === 'right' ? (scores[i + 1] ?? 0) : (scores[i + 1] ?? scores[i - 1] ?? 0);
			if (nb > 0 && nb / own !== 1) {
				teamMult *= nb / own;
				ratioLines.push({ cardId, own, neighbor: nb, mult: nb / own });
			}
		} else if (eff.type === 'bundle') eff.parts.forEach((p) => walk(p, i, cardId));
	};
	cards.forEach((card, i) => {
		if (card) walk(card.effect, i, card.id);
	});
	const total = Math.round((scores.reduce((a, b) => a + b, 0) + relay) * teamMult);
	return { total, teamMult, relay: Math.round(relay), relayLines, ratioLines };
};

// ---- 奖励 ----

/** 过关奖励: 基础 + 关数递增 */
export const roundReward = (n: number): number => 5 + Math.floor((n - 1) / 3) * 3;

/** 溢出奖励: 每超出目标 50% +1 币(上限 8) —— 与目标同步增长,不会越到后期越白给 */
export const overflowReward = (score: number, target: number): number =>
	Math.min(8, Math.floor((Math.max(0, score - target) / Math.max(1, target)) * 2));

/** 经济卡加成(含「每 N 月饼币 +M」的利息卡) */
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

/** 卡池(商店)洗牌 */
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
