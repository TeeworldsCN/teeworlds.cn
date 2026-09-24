// 月宫掷骰 · 游戏核心逻辑(关卡、Boss、计分、存档)
import {
	faceHits,
	getRollLevel,
	hasClearVoid,
	judgeRoll,
	stripVoid,
	type DiceMods
} from './midautumn';
import { LEVEL_LADDER, CARD_BY_ID, CARDS, condHit, type TeeCard, type TeeEffect } from './teecards';
import { longestRun } from './midautumn';
import { BUFF_BY_ID, type AppliedBuff } from './items';

// ---- 关卡 ----
//

// R1~R8 不动(新手区),R9 起坡度从 ×1.18 提到 ×1.23,到 R16 = 7200;
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

/** 是否 Boss 关(每 Ante 的第 3 关) */
export const isBossRound = (n: number) => n % 3 === 0;

export const BASE_ROLLS = 2;

// ---- Boss ----
//
// id 一律带 `boss_` 前缀:不带前缀时和 Tee 卡是**两套 namespace** 却有撞名
// (雾月 wuyue ↔ 五岳桂香、蚀月 shiyue ↔ 拾遗),任何按裸字符串查池子的新代码都会踩。
// 前缀是后加的,所以 getBossById 仍然认**不带前缀的老 id**(局内存档里存过)。

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
	/**
	 * 随机规则:每关抽一组参数(rollBossVariant),抽完写进 mods、把 desc 里的 {0}/{1} 换成数字。
	 * `void` = 抽 count(默认 1)个**互不相同**的点作废(迷月 1 个 / 霜月 2 个);
	 * `map` = 抽 2 个**不同**的点做「X 点视为 Y 点」(影月/破月);
	 * `idx` = 抽 1 个**骰子位置**(池子是 [0..5],desc 里的 {0} 写成人类数法 1~6),
	 *        写进 mods.rerollVoidIdx —— 滞月:这颗只要被重掷过就整颗作废。
	 * 候选点一律不含 4(4 是博饼的硬通货,作废它就成蚀月那种重锤)。抽到的数写在 `rolled` 上、
	 * 存进存档 bossArgs —— 刷新不重抽;横幅上写明是哪几点,玩家照着留骰子。
	 */
	randomRule?: { kind: 'void' | 'map' | 'idx'; pool: number[]; count?: number };
	/** 本关抽到的随机参数(randomRule 的产出,读档时回填) */
	rolled?: number[];
	/**
	 * 权重重排(2025-09):这只 Boss 的权重从 `from` 关的 weight **线性涨到** `to` 关的 1
	 * (和其他 Boss 一样)。
	 *
	 * 蚀月(纯「4 作废」)原来是 R16 之后的彩蛋 —— 权重 0.5、且 R16 前不进池;
	 * 18~30 关逐渐放开,让后期真的会撞上它(4 点线不能只靠一张丹火兜底)。
	 * 写成曲线而不是每关写死:改区间就是改两个数。
	 */
	weightRamp?: { from: number; to: number };
}

export const BOSSES: Boss[] = [
	// ---- 温和池:第 1~6 关 ----
	{
		id: 'boss_heiyue',
		name: '黑月',
		emoji: '🌑',
		desc: '风平浪静，无事发生',
		targetMult: 1,
		mild: true
	},
	{
		id: 'boss_miyue',
		name: '迷月',
		emoji: '🌫',
		// 作废哪个点数每关随机抽(只抽非 4 点)—— 横幅上写明是哪一点,玩家可以照着留骰子
		desc: '本关掷出的 {0} 点作废；目标 ×0.9',
		randomRule: { kind: 'void', pool: [1, 2, 3, 5, 6] },
		targetMult: 0.9,
		mild: true
	},
	{
		id: 'boss_yingyue',
		name: '影月',
		emoji: '🌒',
		// 「X 点视为 Y 点」的两个数每关随机抽:**互不相同**、都不是 4(rollBossVariant 保证)。
		// 横幅写明是哪两点 → 玩家照着留骰子:被抽到的那面被吃掉,目标那面会变“重”
		desc: '本关掷出的 {0} 点视为 {1} 点；目标 ×0.95',
		randomRule: { kind: 'map', pool: [1, 2, 3, 5, 6] },
		targetMult: 0.95,
		mild: true
	},
	// ---- 第 7 关起 ----
	{
		id: 'boss_wuyue',
		name: '雾月',
		emoji: '🌁',
		desc: '本关黑色同点不作数；目标 ×0.95',
		mods: { noSameFace: true },
		targetMult: 0.95
	},
	{
		id: 'boss_xianyue',
		name: '弦月',
		emoji: '🌓',
		desc: '本关掷出的 1 作废',
		mods: { void: [1] },
		targetMult: 1.0
	},
	{
		id: 'boss_shiyue',
		name: '蚀月',
		emoji: '🌘',
		desc: '本关掷出的 4 作废；目标 ×0.3',
		mods: { void: [4] },
		targetMult: 0.3,
		// 彩蛋期:权重 0.5。R18 起按 weightRamp 逐关恢复到和其他 Boss 一样(= 1)
		weight: 0.5,
		weightRamp: { from: 18, to: 30 }
	},
	{
		id: 'boss_xueyue',
		name: '血月',
		emoji: '🔴',
		desc: '等级封顶到状元',
		mods: { levelCap: 'zhuang_yuan' },
		targetMult: 1
	},
	{
		id: 'boss_haoyue',
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
		id: 'boss_jimoon',
		name: '疾月',
		emoji: '🌙',
		desc: '每个 Tee 多投掷 1 次；目标 ×2',
		rollsBonus: 1,
		targetMult: 2
	},
	// ---- 第 18 关起(无限模式后期;前 16 关是标定过的曲线,这批刻意不进池) ----
	{
		id: 'boss_huiyue',
		name: '晦月',
		emoji: '🌚',
		desc: '本关每个 Tee 少投掷 1 次；目标 ×0.75',
		mods: {},
		rollsBonus: -1,
		targetMult: 0.75,
		minRound: 18
	},
	{
		id: 'boss_yuanyue',
		name: '圆月',
		emoji: '🌝',
		desc: '本关非 4 点的一色牌也按红牌计；目标 ×1.25',
		mods: { faceFloor: true },
		targetMult: 1.25,
		weight: 0.5,
		minRound: 18
	},
	{
		id: 'boss_poyue',
		name: '破月',
		emoji: '🌘',
		// 4 作废是固定的重锤,「视为」那半每关随机抽(和影月同款:X、Y 互不相同、不含 4),
		// 横幅上写明是哪两点,玩家照着留骰子
		desc: '本关掷出的 4 作废、{0} 视为 {1}；目标 ×0.9',
		mods: { void: [4] },
		randomRule: { kind: 'map', pool: [1, 2, 3, 5, 6] },
		targetMult: 0.9,
		weight: 0.5,
		minRound: 18
	},
	{
		id: 'boss_shuangyue',
		name: '霜月',
		emoji: '🌫',
		// 作废哪两个点每关随机抽(互不相同、不含 4)。随机比固定的「1、6」轻重不一,
		// 目标在 ×0.8 上再降一档
		desc: '本关掷出的 {0}、{1} 作废；目标 ×0.75',
		randomRule: { kind: 'void', pool: [1, 2, 3, 5, 6], count: 2 },
		targetMult: 0.75,
		minRound: 18
	},
	{
		id: 'boss_yunyue',
		name: '晕月',
		emoji: '🌪',
		desc: '本关等级封顶到对堂；目标 ×0.55',
		mods: { levelCap: 'dui_tang' },
		targetMult: 0.55,
		minRound: 18
	},
	{
		id: 'boss_hanyue',
		name: '寒月',
		emoji: '❄',
		desc: '本关加成卡的加值只算一半；目标 ×0.7',
		mods: { buffChipsScale: 0.5 },
		targetMult: 0.7,
		weight: 0.5,
		minRound: 18
	},
	{
		id: 'boss_linyue',
		name: '凛月',
		emoji: '🥶',
		desc: '本关加成卡的乘值只算一半；目标 ×0.7',
		mods: { buffMultScale: 0.5 },
		targetMult: 0.7,
		weight: 0.5,
		minRound: 18
	},
	{
		id: 'boss_zhiyue',
		name: '滞月',
		emoji: '🌗',
		// 位置每关抽一颗(池子是下标 [0..5],横幅写人类数法 1~6)。
		// 不重掷它就没事 —— 惩罚的是「无脑全择」:那颗的初次点数就定在场上,要么留着用,
		// 要么拿一颗骰子换掉重掷机会。
		//
		// 目标倍率按「体感 + 抽样」定的:boss.ts 跑一轮就几分钟,先按体感定 ×0.9
		// (RUNS=600 那轮给的等难度目标是 ×0.89,同量级)。要精调:
		// ROUND=18 RUNS=3000 bun tools/zhongqiu/boss.ts
		desc: '左数第 {0} 颗骰子若重掷，本关作废；目标 ×0.9',
		mods: {},
		randomRule: { kind: 'idx', pool: [0, 1, 2, 3, 4, 5] },
		targetMult: 0.9,
		minRound: 18
	}
];

/** 温和池 id(第 1~6 关) */
export const MILD_BOSS_IDS = BOSSES.filter((b) => b.mild).map((b) => b.id);

/** 第 n 关能抽到的 Boss 池(抽卡规则只此一份,getBoss 和「卡池一览」页共用) */
export const bossPool = (n: number): Boss[] =>
	BOSSES.filter((b) =>
		n <= 6 ? b.mild : b.minRound ? n >= b.minRound : b.id !== 'boss_shiyue' || n > 16
	);

/** 第 n 关这只 Boss 的**实际权重**:带 weightRamp 的按关卡从 weight 渐变到 1 */
export const bossWeight = (b: Boss, n: number): number => {
	const base = b.weight ?? 1;
	if (!b.weightRamp) return base;
	const { from, to } = b.weightRamp;
	const t = Math.min(1, Math.max(0, (n - from) / Math.max(1, to - from)));
	return base + (1 - base) * t;
};

export const getBoss = (n: number): Boss => {
	const pool = bossPool(n);
	const total = pool.reduce((a, b) => a + bossWeight(b, n), 0);
	let r = Math.random() * total;
	for (const b of pool) {
		r -= bossWeight(b, n);
		if (r <= 0) return b;
	}
	return pool[pool.length - 1];
};

export const getBossById = (id: string): Boss =>
	BOSSES.find((b) => b.id === id) ??
	// 老存档里的 bossId 是加前缀之前的裸 id —— 认一下,别让读档掉回 BOSSES[0]
	BOSSES.find((b) => b.id === `boss_${id}`) ??
	BOSSES[0];

/**
 * 「随机规则」Boss 的**本关实例**(迷月:随机作废 1 个点;霜月:随机作废 2 个不同的点;
 * 影月/破月:X 点视为 Y 点,X≠Y)。
 * 抽到的数写进 mods、把 desc 里的 {0}/{1} 换成数字,并记在 `rolled` 上(存档照它回填)。
 * `args` 传上次抽到的(读档时不重抽);不合法(不在池里 / 两个数相同)就重抽。候选点永远不含 4。
 */
export const rollBossVariant = (boss: Boss, args?: number[]): Boss => {
	const rr = boss.randomRule;
	if (!rr) return boss;
	const draw = (taken: number[], i: number): number => {
		const cands = rr.pool.filter((f) => !taken.includes(f));
		const saved = args?.[i];
		return saved !== undefined && cands.includes(saved)
			? saved
			: cands[Math.floor(Math.random() * cands.length)];
	};
	const mods: DiceMods = { ...(boss.mods ?? {}) };
	if (rr.kind === 'idx') {
		// 滞月:抽一颗**骰子位置**(池子是下标 0~5,desc 里换成人类数法 1~6)
		const idx = draw([], 0);
		mods.rerollVoidIdx = [idx];
		return { ...boss, mods, desc: boss.desc.replace('{0}', String(idx + 1)), rolled: [idx] };
	}
	let rolled: number[];
	if (rr.kind === 'void') {
		// 抽 count(默认 1)个**互不相同**的点 —— draw 的 taken 参数就是干这个的
		rolled = [];
		for (let i = 0; i < (rr.count ?? 1); i++) rolled.push(draw([...rolled], i));
		mods.void = [...(mods.void ?? []), ...rolled];
	} else {
		// 「视为」:两个数必须不同 —— X 视为 X 是白写,占着一个 Boss 位
		const from = draw([], 0);
		const to = draw([from], 1);
		rolled = [from, to];
		mods.map = { ...(mods.map ?? {}), [from]: to };
	}
	const desc = boss.desc.replace('{0}', String(rolled[0])).replace('{1}', String(rolled[1] ?? ''));
	return { ...boss, mods, desc, rolled };
};

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
	/** 本关该 Tee 的得分(掷完后) */
	lastScore: number;
	lastLevelId: string;
	lastDice: number[];
	/** 这一手哪些骰子被判作废(高照抄牌面时要连作废状态一起抄) */
	lastVoid?: number[];
	/**
	 * 这一手哪些骰子是**玩家亲手改出来的**(改点豁免:不吃「视为」)。
	 * 必须按 Tee 记 —— 同一只手会被回头读(队友数「我」的骰面 / 回合末桂树记账),
	 * 拿不到当时那份豁免名单,亲手改出来的点又会被「X 视为 Y」改写一遍(踩过)。
	 */
	lastOpted?: number[];
	/**
	 * 这一手**掷出**的骰面(改点之前的那六颗)。
	 * 骰子底面渲染用它,丹火的「每掷出」乘算也读它 —— 必须按 Tee 记:
	 * 队友回头数这只 Tee 的骰面、结算頁重算那一手,都要拿得到「当时掷出的是什么」。
	 */
	lastRolled?: number[];
	/** 这一手重掷过哪几颗(滞月:抽中的那颗一重掷就作废);老存档没有 → 按空算 */
	lastRerollIdx?: number[];
	buffs: AppliedBuff[];
	charge?: number;
	/**
	 * 田螺:这只 Tee 身上的加成卡不生效 —— 挂载时就**直接不入库**,只在这里记下
	 * 「哪张卡、原价多少月饼币」,掷完之后按原价返还(结算动画逐张弹)。
	 */
	refundPending?: { cardId: string; coins: number }[];
	/** 田螺:发动过主动技 → 返还减半 */
	refundHalved?: boolean;
	/**
	 * 田螺:本次掷骰**已经按原价付过**的那几行(结算动画逐张弹)。
	 * 留着它是为了读档回来能重画 —— 发动提示和结算动画都长在这上面。
	 */
	parkRows?: { name: string; coins: number }[];
	/**
	 * 这一关已经问过的主动技(键 = `${srcId}|${skill}`):每关清一次,问过就不在动画之后再弹。
	 * 主动技的加值计入基础分,提示现在掱在结算动画**之前** —— 必须自己记「问过了」,
	 * 否则冷却 0 的田螺会在动画之后又弹一次。
	 */
	askedSkills?: string[];
	/** 发动过的主动技加值/乘算:算进该 Tee 的**基础分**(乘算之前),跟着存盘走 */
	skillChips?: { srcId: string; chips: number; from?: string }[];
	skillMult?: { srcId: string; mult: number; from?: string };
	/**
	 * 这只 Tee **自己的**成长账(按 Tee 记,不按卡;同名的两只各算各的):桂树 own_face_grow
	 * 和 scaling/growth_mult 都记这里 —— 抄来的记到抄的人头上;被卖掉,它的数就跟着一起消失
	 * (新入队的那只从 0 开始)。键 = 卡 id(一只 Tee 上同一张卡只有一张,不会撞)。
	 */
	faceGrow?: GrowthMap;
	/** 饼铺掌柜那类「每累计卖出 1 个 Tee」:这只 Tee **入队之后**卖掉过几个 */
	sold?: number;
}

export const TEAM_LIMIT = 6;

/**
 * 把「我」归位到队首,并保证**至多一个** isSelf。
 *
 * 这是「我」的身份不变量:
 *   1. 已经标了 isSelf 的 Tee 搬到下标 0;
 *   2. 一个都没标(旧存档 / 作弊注入)→ 认 `cardId === null` 那个;
 *   3. **都没有 → 就一个 isSelf 也不设**。
 *
 * 第 3 条是刻意的:「我」可能压根不在队伍里(作弊注入 / 异常存档)。
 * 这时**不编造一个「我」出来** —— 所有依赖「我」的效果(望月怀远 / 明月共照 /
 * 星河 / 点数映射 …)自然不触发,而不是把某个队友错当成「我」。
 * 老实现是「降级认下标 0」,那会让第一只 Tee 凭空获得「我」的身份。
 *
 * 任何改队伍的地方(读档 / 卖 Tee / 归家卖「我」/ 作弊 setTeam)都要过它。
 */
export const normalizeSelf = (team: TeamTee[]): TeamTee[] => {
	if (team.length === 0) return team;
	let idx = team.findIndex((t) => t.isSelf);
	if (idx < 0) idx = team.findIndex((t) => t.cardId === null);
	// 「我」不在队里:清掉所有 isSelf,别让别人顶替
	if (idx < 0) return team.map((t) => (t.isSelf ? { ...t, isSelf: false } : t));
	const out = team.map((t, i) => (i === idx ? { ...t, isSelf: true } : { ...t, isSelf: false }));
	if (idx !== 0) {
		const [me] = out.splice(idx, 1);
		out.unshift(me);
	}
	return out;
};

export type GrowthMap = Record<string, number>;

/** 过关后成长卡叠层 —— 记在**这只 Tee 自己**的账上(faceGrow,和桂树同一本,键 = 卡 id):
 * 「各记各的」(用户裁定):同名的两只互不干涉,抄来的记到**抄的人**头上,被卖掉就跟着走。
 * (原来是一张全局共享账:两只各 +1 进同一键、又都读同一总数,等于每关双重叠层。) */
export const applyGrowth = (
	cards: (TeeCard | null)[],
	team: TeamTee[],
	playedUpTo?: number
): void => {
	// 按位置展开(复制卡也算)
	team.forEach((t, i) => {
		if (!cards[i]) return;
		// 云海口径同 decayBuffs:没轮到的 Tee 这关等于不存在,成长不叠层
		if (playedUpTo !== undefined && i > playedUpTo) return;
		let next = t.faceGrow;
		for (const { eff, srcId } of effectiveEffects(cards, i)) {
			if (eff.type === 'scaling_mult')
				next = { ...(next ?? {}), [srcId]: (next?.[srcId] ?? 0) + eff.per };
			// growth_mult 是复利,记的是**关数**,计分时 mult *= (1+per)^n
			else if (eff.type === 'growth_mult')
				next = { ...(next ?? {}), [srcId]: (next?.[srcId] ?? 0) + 1 };
		}
		t.faceGrow = next;
	});
};

// ---- 效果解析(copy_right / bundle) ----

export interface EffectiveEffect {
	eff: TeeEffect;
	srcId: string;
}

/**
 * 该 Tee **实际生效的效果**(复制链按位置展开)。
 *
 * 「复制右侧 Tee 的卡牌」允许**一直复制**:抄写者向右走,每经过一张**复制卡**就把它
 * 自带的额外加成记到自己头上(姻缘簿的 ×1.5 / 镜花仙缘的全队 ×1.35),一直走到第一张
 * **非复制卡**为止 —— 整张复制它的能力,收工。中途遇到「我」/没卡的空位就停:
 * 相当于抄了一个没有能力的 Tee,沿途记下的额外加成照旧生效。
 *
 * 沿途的额外加成是**三角形叠加**的(N 张连排 = N(N+1)/2 份)—— 逐字语义就这么写的,
 * 玩家凑得出这条链,高数值是他应得的。
 *
 * 这样展开和「把抄来的卡面逐字再念一遍」的递归读法完全等价,但只是单层循环、天然终止。
 * ⚠️ 沿途的额外加成以**抄写者**为受益人落地(现有三张复制卡的额外都是位置无关的);
 * 哪天给复制卡配位置敏感的额外(接力/邻居/比值类),口径要另定。
 */
export const effectiveEffects = (cards: (TeeCard | null)[], i: number): EffectiveEffect[] => {
	const out: EffectiveEffect[] = [];
	const own = cards[i];
	if (!own) return [];
	/** 这张卡里有没有「复制」(bundle 里也算) */
	const isCopy = (eff: TeeEffect): boolean =>
		eff.type === 'copy_right' || (eff.type === 'bundle' && eff.parts.some(isCopy));
	/**
	 * 收一张卡的效果:`keepCopy` = 连「复制」那条也收(只有最终目标整张照抄);
	 * 否则只收额外加成 —— 复制卡自带的那层倍率是**长在 copy_right 上的**(姻缘簿 ×1.5),
	 * 复制本身丢掉、倍率留下。bundle 一律摊平(明细行/技能栏按单条效果认)。
	 */
	const collect = (eff: TeeEffect, srcId: string, keepCopy: boolean) => {
		if (eff.type === 'bundle') eff.parts.forEach((p) => collect(p, srcId, keepCopy));
		else if (eff.type === 'copy_right') {
			if (keepCopy) out.push({ eff, srcId });
			if (eff.mult) out.push({ eff: { type: 'mult', value: eff.mult }, srcId });
		} else out.push({ eff, srcId });
	};
	// 自己这张卡:额外照收;是复制卡就接着往右找目标
	const ownIsCopy = isCopy(own.effect);
	collect(own.effect, own.id, !ownIsCopy);
	if (!ownIsCopy) return out;
	for (let p = i + 1; p < cards.length; p++) {
		const c = cards[p];
		if (!c) break; // 「我」/空位:停 —— 相当于抄了一个没有能力的 Tee
		if (!isCopy(c.effect)) {
			collect(c.effect, c.id, true); // 第一张非复制卡:整张复制,收工
			break;
		}
		collect(c.effect, c.id, false); // 中间复制卡:只记它的额外加成,接着往右
	}
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

export interface SetOp {
	kind: 'point' | 'any' | 'bump' | 'voidclear' | 'voidfix';
	count: number;
	point?: number;
	/** bump: 位移方向(+1 月牙尺 / −1 缺月尺) */
	step?: number;
	/** set_point/set_any: 只能挑这个点数的骰子(拆 4 系列:4) */
	from?: number;
	/** set_any: 可选的改后点数(不填 = 1~6 任选) */
	options?: number[];
	/**
	 * 只能挑**未作废**的骰子 —— Tee 卡自带的改点全都带这条(加成卡不带)。
	 *
	 * 为什么:Tee 卡是永久的,不限制的话「改点」就成了绕过 Boss 机制的口子 ——
	 * 蚀月「摘出的 4 作废」时,残月把一颗作废的 4 改成 3 = 白救一颗;
	 * 加成卡那条口子留着(花一张存货救一颗,是一次性生意,不构成绕过)。
	 */
	noVoid?: boolean;
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
	const walk = (e: AnyEff, srcId: string, noVoid: boolean) => {
		if (e.type === 'bundle') {
			(e.parts ?? []).forEach((p) => walk(p, srcId, noVoid));
			return;
		}
		if (e.type === 'set_point')
			ops.push({
				kind: 'point',
				count: e.count ?? 1,
				point: e.point ?? 4,
				from: e.from,
				srcId,
				noVoid
			});
		else if (e.type === 'set_any')
			ops.push({
				kind: 'any',
				count: e.count ?? 1,
				from: e.from,
				options: e.options,
				srcId,
				noVoid
			});
		// 半影卡:点一颗**作废的**骰子,读它的点数,本关该点数不作废(不弹选点器;
		// 整关解除的月食卡没有 pick,不进队列)
		else if (e.type === 'clear_void' && e.pick) ops.push({ kind: 'voidclear', count: 1, srcId });
		else if (e.type === 'bump_point')
			ops.push({ kind: 'bump', count: e.count ?? 1, step: e.value ?? 1, srcId, noVoid });
		else if (e.type === 'void_fix')
			// 月相符:作废骰子救援 —— 「任意数量」,上限就是全场骰子数,玩家点几颗算几颗
			// (它是**救**作废骰子的,不带 noVoid)
			ops.push({ kind: 'voidfix', count: 6, point: e.point ?? 1, srcId });
	};
	// Tee 卡(永久)的改点不能选作废骰子;加成卡的照旧,全部骰子都能改
	for (const { eff, srcId } of self) walk(eff as unknown as AnyEff, srcId, true);
	for (const b of buffs) {
		const e = BUFF_BY_ID.get(b.cardId)?.effect;
		if (e) walk(e as unknown as AnyEff, b.cardId, false);
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
	/** 结束本关时,每个尚未投掷的 Tee 给多少月饼币(云海) */
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
 * 持有者**自己**能用的主动技 —— 也就是 `activeSkills` 里剔掉 `toPlayer` 的那些。
 *
 * `toPlayer` 是**授予「我」**的技能(归家:卖掉「我」自己),按定义不留在卡上:
 * 持卡者不该因此多一个按钮,而「我」被卖掉之后更不该落到新队首头上
 * (踩过:技能跟着卡走 → 每回合白卖一次「我」拿 8 月饼币)。
 *
 * 所以队伍里的技能要分两边取:
 *   - 「我」→ `playerActiveSkills`(自己的 + 别人授予的)
 *   - 其他人 → 这个函数
 */
export const holderActiveSkills = (
	self: EffectiveEffect[],
	buffs: AppliedBuff[] = []
): ActiveSkill[] => activeSkills(self, buffs).filter((sk) => !sk.toPlayer);

/**
 * 「我」能用的主动技:别人卡上标了 toPlayer 的那些(归家)。
 * 技能归属「我」——所以冷却记在 team[0].charge、按钮/角标也长在主 Tee 上。
 *
 * 调用点必须先确认「我」**真的在队里**(归家会把「我」卖掉):这里只看卡,
 * 看不出队里有没有「我」,拿这里的返回值去发币会凭空造钱。
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

export const tickCharge = (team: TeamTee[], playedUpTo?: number): void => {
	// 云海口径和 decayBuffs 一致:提前收关时排在后面的 Tee 等于没轮到,冷却不走
	team.forEach((t, i) => {
		if (playedUpTo !== undefined && i > playedUpTo) return;
		t.charge = Math.max(0, (t.charge ?? 0) - 1);
	});
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

export const withBossMods = (self?: DiceMods, boss?: DiceMods): DiceMods | undefined => {
	const clearedBoss = hasClearVoid(self) ? stripVoid(boss) : boss;
	// clearVoid 只是开关,不参与点数计算,合成时摘掉
	const cleanSelf =
		self && hasClearVoid(self) ? stripVoid({ ...self, clearVoid: undefined }) : self;
	// 不做「看起来是空的就短路」:isEmptyMods 漏字段会把只带 {fixed}/{faceFloor}/… 的一整层
	// 吞掉(踩过:玩家 fixed 豁免被 Boss map 吃掉、圆月 faceFloor 整条失效、抄来的 voidOverride 被丢)。
	// 空层在 applyMods 里天然无害,所以只在整侧**缺席**时才返回另一侧。
	if (!cleanSelf) return clearedBoss;
	if (!clearedBoss) return cleanSelf;
	return { chain: [cleanSelf, clearedBoss] };
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
	/**
	 * 这一局「我」是否在队伍里。
	 *
	 * 为 false 时,所有依赖「我的骰面/我的掷骰等级/我的作废颗数」的效果
	 * 一律不触发 —— 「我」不在,就没有「我的」骰子。
	 * (不这么判的话,playerDice 是空的,`6 - 0 = 6` 会凭空爆出 ×1.5⁶ 这种数字。)
	 */
	hasSelf: boolean;
	teamCards: (TeeCard | null)[];
	growth: GrowthMap;
	buffs: AppliedBuff[];
	teamSize: number;
	/** 判定用的骰子点数和 */
	diceSum: number;
	/** 该 Tee 的最终骰面(映射后、剔作废)—— 「每有」那族数的是它 */
	ownDice?: number[];
	/**
	 * 该 Tee **掷出**的骰面(改点之前,剔作废)—— 只给 `own_face.asRolled` 用(丹火)。
	 * 不传就退回 ownDice(与「每有」同口径):工具/QA 直接调引擎时不用刻意造一只手。
	 */
	ownRolledDice?: number[];
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
	/** 主动技的「计入基础分」加值(和值技 / 田螺):必须和筹码一起进乘算,不能事后加 */
	skillChips?: { srcId: string; chips: number; from?: string }[];
	/** 主动技附带的乘算(和值技「超过 N 后每点 ×p」) */
	skillMult?: { srcId: string; mult: number; from?: string };
	/** 本关加成卡的加值只算这个比例(寒月:0.5;缺省 1) */
	buffChipsScale?: number;
	/** 本关加成卡的乘值只算这个比例的增量(凛月:0.5;缺省 1) */
	buffMultScale?: number;
	/** 当前关卡数(reverse.perRound / growth_mult 用) */
	round?: number;
	/** 左侧相邻 Tee 的已结算得分(relay_left 用;队首没有左邻 = 0) */
	leftScore?: number;
	/** 这只 Tee 入队之后卖掉过几个 Tee(sold_chips / sell_scale 用) */
	soldCount?: number;
}

export const calcTeeScore = ({
	levelId,
	self,
	allSelf,
	index,
	isSelf,
	hasSelf,
	teamCards,
	growth,
	buffs,
	teamSize,
	diceSum,
	ownDice = [],
	ownRolledDice,
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
	/** 加成卡里的「基础分翻倍」(桂花糖浆):作用在基础分侧,乘算链在它后面 */
	let buffBaseMult = 1;
	let buffBaseSrc = '';
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
			} else if (be.type === 'sum_chips') {
				// 潮信符:点数和 ×per 计入基础分(和卡牌侧 sum_chips 同一口径;寒月缩放它的加值)。
				// 踩过:以前加成卡这边**根本没这个分支**(那个 case 在卡牌那条路上,
				// 而没有任何 Tee 卡用这个类型),买了这张卡等于没有。
				buffChips += Math.round((be.per ?? 0) * diceSum * buffChipsScale);
			} else if (be.type === 'base_mult') {
				// 和 mult 同一套口径:凛月的「加成卡乘值只算一半」也管它
				buffBaseMult *= 1 + ((be.value ?? 1) - 1) * buffMultScale;
				buffBaseSrc = b.cardId;
			} else if (be.type === 'mult') {
				buffMult *= 1 + ((be.value ?? 1) - 1) * buffMultScale;
			} else if (be.type === 'chips_mult') {
				buffChips += Math.round((be.chips ?? 0) * buffChipsScale);
				buffMult *= 1 + ((be.mult ?? 1) - 1) * buffMultScale;
			} else if (be.type === 'cond') {
				// 寒月/凛月的缩放口径必须盖住**所有**加值/乘值,不然 Boss 文案就是谎话:
				// cond(再接再厉 ×N)、own_face(罚分卡 ±筹码)、straight_mult(合璧符) 以前漏在外面,
				// 寒/凛月下它们照常全额生效(实测:凛月 + 满月祝福还是 ×1.8,桂花蜜却折成了 ×1.15)。
				// 逆向(reverse)不缩放:它是「整块替换基础分」,既不是加值也不是乘值。
				if (be.cond && condHit(be.cond, levelId, level.score)) {
					buffChips += Math.round((be.chips ?? 0) * buffChipsScale);
					buffMult *= 1 + ((be.mult ?? 1) - 1) * buffMultScale;
				}
			} else if (be.type === 'own_face') {
				// 罚分卡:每有 1 颗该点数就扣分(负分流的清面工具靠它才有意义)
				const n = ownDice.filter((v) => v === be.face).length;
				if (n > 0) {
					if (be.chips) buffChips += Math.round(be.chips * n * buffChipsScale);
					if (be.mult) buffMult *= Math.pow(1 + ((be.mult ?? 1) - 1) * buffMultScale, n);
				}
			} else if (be.type === 'straight_mult') {
				// 连号长度倍率(合璧符):连号 n 颗 → ×per^(n-from);
				// 凛月的「乘值只算一半」把 per 折成 1+(per−1)×scale。乘精确值 ——
				// 取整曾让卡面 ×1.35/×1.85 变成实乘 ×1.4/×1.9(结算行也已能列两位小数)
				const run = longestRun(ownDice);
				const from = be.from ?? 2;
				if (run > from) {
					const per = 1 + ((be.per ?? 1) - 1) * buffMultScale;
					buffMult *= Math.pow(per, run - from);
				}
			} else if (be.type === 'streak_mult') {
				// 孤星赌(朔月符):本命点 from 颗起每多 1 颗 ×per(3 颗 ×1.8、4 颗 ×3.24…),
				// 不足 from−1 颗反而 ×value —— 下注的两头:梭哈成功连乘,失手倒扣。
				// 凛月「乘值只算一半」按 straight_mult 同一口径折 per/value。
				const n = ownDice.filter((v) => v === be.face).length;
				const from = be.from ?? 3;
				if (n >= from) {
					const per = 1 + ((be.per ?? 1) - 1) * buffMultScale;
					buffMult *= Math.pow(per, n - from + 1);
				} else if (n <= from - 2) {
					buffMult *= 1 + ((be.value ?? 1) - 1) * buffMultScale;
				}
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
				if (!hasSelf) break;
				// 「我」掷出的点数统计 —— 触发看「我」的骰面,**得利方是持卡者**(文案「该 Tee」)。
				// 所以【不加 isSelf 判定】:「我」自己是无卡的那只,卡永远挂在队友身上,
				// 加了这道门这张卡就是废卡(用户报过「三星照发挥不出来」)。
				// ⚠️ 别再拿 skipTeamWide 当门:self 那一轮(持卡者自己)就是带 skipTeamWide=true 跑的,
				// 而全队那一轮又不转发它 —— 那样这张卡永远不触发(三星照的 +250 从来没生效过)。
				// 它属于「持卡者自己那一轮结算」,和 player_die / on_player 同一套路。
				{
					// 原投掷的和改点后的都算(同一颗只算一次)—— 三星照自己就把 3 改成了 4
					const hits = faceHits(eff.face, playerDice ?? [], playerRawDice);
					if (hits > 0) {
						const bc = chips;
						chips += eff.chips * hits;
						note(srcId, 'card', chips - bc, 1, `我 ${hits} 颗 ${eff.face}`);
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
				// 玉兔捣药:×0.8 和抬档是**同一个条件**(卡面「未掷出再接再厉时…但得分 ×0.8」),
				// 掷空时抬档那边被页面的 level_up 门挡住了,这条不跟着挡就会白扣 20%
				if (eff.unlessNone && levelId === 'none') break;
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
				// 「每拥有一个同系 Tee」那半句:全队版只落到**同流派**的 Tee 身上,别的流派不吃
				const sameTag = !eff.teamWide || teamCards[index]?.tag === eff.tag;
				const n = new Set(teamCards.filter((c) => c?.tag === eff.tag).map((c) => c!.id)).size;
				const bc = chips;
				const bm = mult;
				let counted = 0;
				if (sameTag && n > 0) {
					counted = n;
					if (eff.as === 'chips') chips += eff.per * n;
					// 流派倍率 = 幂(×per^N):文案是「每拥有一个独特的「X」系 Tee:得分 ×N」,
					// 也就是每张同流派卡再乘一层。全套改成乘算之后,这里跟着回幂。
					else mult *= Math.pow(eff.per, n);
				}
				// 「每有 1 颗 4 点,该 Tee 基础分 +N」那半句:受益人是**持卡者**,卡面**没有**
				// 同系条件 —— 被非同系 Tee 抄走时照样要给(踩过:同系门把两半句一起砍了,
				// 红绳抄玉兔临凡连自己四点的 +375 都拿不到)。
				// 只算给「长这张卡的那只 Tee」(onScoredTee):全队那一轮会为每格各跑一遍,
				// 不把门就变成「人人都拿自己的四点换底分」。
				const fours = ownDice.filter((d) => d === 4).length;
				const fromFour = eff.chipsPerFour && onScoredTee ? fours * eff.chipsPerFour : 0;
				chips += fromFour;
				// 注解只写真生效的那几段:只有四点底分时不能标着「月系 3 张」(那说的是倍率那半)
				const why = [
					counted > 0 ? `${eff.tag}系 ${counted} 张` : '',
					fromFour ? `自己 ${fours} 个4` : ''
				]
					.filter(Boolean)
					.join(' · ');
				note(srcId, 'card', chips - bc, bm === 0 ? 1 : mult / bm, why || undefined);
				break;
			}
			case 'on_player': {
				if (!hasSelf) break;
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
				if (!hasSelf) break;
				// 「我」的骰子里有几个 eff.face → 给**这张卡的持有者**加基础分/倍率。
				// 文案写「该 Tee」:触发看「我」,得利看持卡者。
				// 所以【不加 isSelf 判定】—— 它在持卡者自己那一轮(self 那轮)结算,
				// 别的 Tee 算分时不会走到这里(全队那一轮也不转发它)。
				// ⚠️ 只数**最终骰面**(文案「「我」最终骰子里每个 4」)—— 这是「每有」口径;
				// 三星照那族写「每掷出」,才要连原投掷一起数(faceHits)。两套别混。
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
				// **只在「全队那一轮」发**(skipTeamWide 门,和 team_chips 同款):自己那轮再发
				// 就双记 —— 「我」有卡时(QA card(0,…) 给「我」挂星河)×2 会变 ×4。
				if (skipTeamWide) break;
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
				//
				// ⚠️ 「我」不在队里时 playerDice 是空的 —— 那会让 6-0=6 颗「作废」,凭空爆出
				// ×1.5⁶。没有「我」就没有「我的作废骰子」,直接不触发。
				if (!hasSelf) break;
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
				// asRolled(丹火):只数**掷出**的面 —— 改点来的点数只顶等级,不进乘算。
				// 「每有」那族照旧数最终骰面(ownDice),两套口径别混。
				const hand = eff.asRolled && ownRolledDice?.length ? ownRolledDice : ownDice;
				const n = hand.filter((v) => v === eff.face).length;
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
				// 口径(用户裁定):和倍率行(straight_mult)**同一个连号** —— 取**最长连号**的颗数,
				// 重复点数只算 1 颗、断开的多条只取最长。以前是「落在任意连号里的骰子按颗数」:
				// 5 4 1 3 3 1 会数出 4 颗、同一个浮层里倍率行却写 3 颗,自相矛盾(用户报过);
				// TODO.md §10 那张对照表(1,6,5,5,2,1 → 140/30)记的本来就是这一版。
				const n = longestRun(ownDice);
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
				// 乘精确值:取整曾让卡面 ×1.35/×1.85 变成实乘 ×1.4/×1.9;结算行按两位小数列印
				mult *= Math.pow(eff.per, run - from);
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

	/**
	 * 主动技的「计入基础分」加值(和值技 / 田螺):在**两次基础分缩放之前**并进 chips。
	 * 射日仙(rerollBaseMult)与桂花糖浆(buffBaseMult)都是「整块基础分一起放大」,
	 * 后加的话这份分就落在缩放外面(踩过:桂花糖浆 + 潮汐主动技 +120 → 实算 140,卡面应 260);
	 * 逆向的 net 快照也按卡面「计入基础分」把它算进净值里。
	 */
	// 主动技加值:并进 chips 的**同一位置**推明细行 —— 必须在下面两次基础分缩放的乘算行
	// 之前,结算动画按行序读才对得上实算 (…+加值)×缩放(口径:明细必须与引擎一致)。
	for (const sc of skillChips) {
		chips += sc.chips;
		note(sc.srcId, 'card', sc.chips, 1, sc.from);
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
	// 加成卡的「基础分翻倍」:整块放大(等级底分 + 卡牌筹码 + 加成卡筹码)。
	// 放在 reverse/swap **之后**:逆向是「把净值整个改写掉」,改写完的那份基础分再翻倍。
	const baseDoubled = base * buffBaseMult;
	if (buffBaseMult !== 1) {
		chips *= buffBaseMult;
		buffChips *= buffBaseMult;
		// 出成乘算行:卡面写的就是「基础分翻倍」,渲染成「+N」对不上
		note(buffBaseSrc, 'buff', 0, buffBaseMult, '基础分翻倍');
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
	// 主动技的乘算:和值技「超过 N 后每点 ×p」也必须在乘算链里
	if (skillMult) {
		const bm = mult;
		mult *= skillMult.mult;
		note(skillMult.srcId, 'card', 0, bm === 0 ? 1 : mult / bm, skillMult.from);
	}
	const raw = Math.round((baseDoubled + chips + buffChips) * mult * buffMult);
	const netChips = chips + buffChips;
	const total = swapped !== null || netChips < 0 ? raw : Math.max(0, raw);
	return {
		base: baseDoubled,
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

/**
 * 加成卡的持续关数 −1(到 0 就没了)。
 * `playedUpTo`:本关**真投过骰**的最后一格下标(= countedTee)。云海提前收关时排在后面的
 * Tee 根本没轮到 —— 按口径「这一关对它等于不存在」:不减回合、也不产生「没用掉就归还」
 * (踩过:归还卡都是 turns=1,被这里一减直接蒸发,既没用上也没退)。
 */
export const decayBuffs = (team: TeamTee[], playedUpTo?: number): void => {
	team.forEach((t, i) => {
		if (playedUpTo !== undefined && i > playedUpTo) return;
		t.buffs = t.buffs
			.map((b) => ({ ...b, turnsLeft: b.turnsLeft - 1 }))
			.filter((b) => b.turnsLeft > 0);
	});
};

export const calcTeamTotal = (
	scores: number[],
	cards: (TeeCard | null)[],
	/**
	 * 「我」在不在队里 —— **身份**(isSelf),不是「有没有无卡的 Tee」。
	 * 依赖「我」的团队效果(月上广寒的 team_ratio / 饼铺掌柜的 no_me_team_mult)都看它。
	 * 不传就退回老口径(有无卡的那一位):工具侧的调用没身份信息。
	 */
	hasSelf?: boolean
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
		// 缺位的邻居按 **0 分** 代入公式,固定加值照给(用户裁定:桂影没有右邻 =
		// 0×30% + 60,照给 60)。线性队列(非环形)所以边界上会缺侧,缺侧贡献 0。
		const v = (eff.flat ?? 0) + from.reduce((s, j) => s + scores[j] * eff.pct, 0);
		if (v > 0) {
			relay += v;
			relayLines.push({ cardId, from, value: Math.round(v) });
		}
	};
	/** 队伍里还有没有「我」 */
	const hasMe = typeof hasSelf === 'boolean' ? hasSelf : cards.some((c) => c === null);
	const walk = (eff: TeeEffect, i: number, cardId: string) => {
		if (eff.type === 'team_mult') teamMult *= eff.value;
		// 饼铺掌柜(二):队伍里没有「我」(被归家卖掉)→ 队伍总分 ×mult
		else if (eff.type === 'no_me_team_mult') {
			// 卡面条件只有「队伍里没有『我』」—— 不能加「持卡者本关得分 > 0」这种卡面上
			// 没有的门槛(再接再厉 0 分 / 云海跳过的 Tee 都会让全队丢乘数)。
			if (!hasMe) teamMult *= eff.mult;
		} else if (eff.type === 'relay_pct') addRelay(eff, i, cardId);
		else if (eff.type === 'team_ratio') {
			// 「我」不在队里(被归家卖掉)→ 这条不触发:它按字面就是拿「我」的得分做乘数,
			// 没有「我」就没有「我的得分」。不拦的话 scores[0] 会落到新队首头上(踩过)。
			if (!hasMe) return;
			const ownScore = scores[i] ?? 0;
			// 卡面「若得分 < 100，不触发」(阈值写在效果的 min 上,卡面/引擎共用)。
			// 实现比的是这只 Tee **本关的得分** —— calcTeamTotal 只拿得到它。
			// 不拦的话 own → 0/负分会被下面的 Math.max(1, …) 钳成 1,
			// 比值变成「邻居分 ÷ 1」,bonus = 我 × 邻居(实测 900 万分,R16 目标才 7200):
			//   · own = 0  ← 云海提前收关,这只根本没投掷(确定性触发)
			//   · own < 0  ← 逆月符(逆向) / 翻天印·守拙那族罚分卡
			if (ownScore <= 0 || ownScore < (eff.min ?? 0)) return;
			// 只放大「我」这一份再加进总分,不再乘全队总分:
			// 「我」恒在队首(normalizeSelf 的不变量),所以 scores[0] 就是「我」的得分
			const own = Math.max(1, ownScore);
			// 邻居看哪边:right = 只认右邻;left = 只认左邻(0 号位没有左邻 = 不触发);
			// side = 右邻优先,他在 6 号位(没有右邻)时才用左邻 —— 不然这张卡得先卖个 Tee 才活
			const nb =
				eff.from === 'right'
					? (scores[i + 1] ?? 0)
					: eff.from === 'left'
						? (scores[i - 1] ?? 0)
						: (scores[i + 1] ?? scores[i - 1] ?? 0);
			if (nb > 0) {
				// 原先这里还有一道 `nb / own !== 1`,想跳过「比值 1 = 没放大」的那一行 ——
				// 但公式是 bonus = 我 × 比值,比值 1 时 bonus = **我整份的分**,根本不是 0:
				// 差 1 分给 3001、正好同分反而一分不给,把最常见的一种情况白扔了(踩过)。
				// 已删:同分照给,结算行写 `×1 +我的分`(「我」本关得 0 分时才会是 `×1 +0`)。
				const mult = nb / own;
				const bonus = (scores[0] ?? 0) * mult;
				ratioBonus += bonus;
				ratioLines.push({ cardId, own, neighbor: nb, mult, bonus });
			}
		} else if (eff.type === 'bundle') eff.parts.forEach((p) => walk(p, i, cardId));
	};
	// 复制卡(copy_right)同样要算团队级效果:把每格就地展开成「这一格实际生效的效果」再走一遍。
	// 不展开的话红绳/姻缘簿抄到牵丝戏(全队×1.15)/桂影(relay)/月上广寒(比值)/饼铺掌柜时会静默少一份 ——
	// 而走 calcTeeScore 的那批团队效果(team_chips/per_tag teamWide/self_mult)复制却是生效的,两边对不上。
	// 位置 i 保持不变:接力/比值/邻居全按位置算,展开只换「效果是谁的」(srcId = 被抄那张)。
	cards.forEach((_, i) => {
		if (!cards[i]) return;
		for (const { eff, srcId } of effectiveEffects(cards, i)) walk(eff, i, srcId);
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

/**
 * 过关的经商收益。
 * ⚠️ 必须传**按位置对齐**的卡表(含 null 的那一格)—— 复制卡(copy_right)是就地展开的,
 * 传过滤掉 null 的数组会让它抄到错的右邻(见 calcTeamTotal 同一条注释)。
 */
export const economyReward = (cards: (TeeCard | null)[], mooncakes = 0): number => {
	let sum = 0;
	cards.forEach((_, i) => {
		if (!cards[i]) return;
		for (const { eff } of effectiveEffects(cards, i)) {
			if (eff.type === 'economy') sum += eff.per;
			else if (eff.type === 'interest') sum += Math.floor(mooncakes / eff.perCoins) * eff.per;
		}
	});
	return sum;
};

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
	/** Boss 音效开关 —— 也入元存档(和 localStorage 双写,换设备/清站点数据不丢)。
	 * 老存档没有这个字段 → undefined = 默认开 */
	bossSfx?: boolean;
	/** 总音效开关 —— 同上双写,和 bossSfx 同一口径 */
	sfxOn?: boolean;
}

const SAVE_KEY = 'midautumn:save';

const DEFAULT_SAVE: SaveData = { bestScore: 0, bestRound: 0, plays: 0 };

/**
 * localStorage 里可能是**合法 JSON 但形状不对**(手改/别的脚本写过/写了一半):
 * `"null"`/`"123"`/`{}`/`{bestScore:"x"}` 都能 parse 成功。原样返回会让
 * `saveResult` 的 `plays += 1` 在模块严格模式下抛 TypeError(卡死结束流程),
 * 或把 NaN 写回存档永久污染 —— 读进来先洗一遍:类型不对的字段回默认值,
 * 未知字段原样保留(bossSfx 那些后来加的字段就是靠这个不丢)。
 */
const normalizeSave = (raw: unknown): SaveData => {
	const s: SaveData = {
		...DEFAULT_SAVE,
		...(raw && typeof raw === 'object' ? (raw as Partial<SaveData>) : {})
	};
	const num = (v: unknown) =>
		typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
	s.bestScore = num(s.bestScore);
	s.bestRound = num(s.bestRound);
	s.plays = num(s.plays);
	if (typeof s.bossSfx !== 'boolean') delete s.bossSfx;
	if (typeof s.sfxOn !== 'boolean') delete s.sfxOn;
	return s;
};

const readSave = (): SaveData => {
	try {
		const raw = localStorage.getItem(SAVE_KEY);
		if (raw) return normalizeSave(JSON.parse(raw));
	} catch {
		// ignore
	}
	return { ...DEFAULT_SAVE };
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

/** Boss 音效开关入元存档(bgM 的 setBossSfxEnabled 双写到这里) */
export const setSaveBossSfx = (on: boolean) => {
	const save = readSave();
	save.bossSfx = on;
	try {
		localStorage.setItem(SAVE_KEY, JSON.stringify(save));
	} catch {
		// ignore
	}
};

/** 总音效开关入元存档(sfx 的 setSfxEnabled 双写到这里)—— 和 bossSfx 同一口径 */
export const setSaveSfx = (on: boolean) => {
	const save = readSave();
	save.sfxOn = on;
	try {
		localStorage.setItem(SAVE_KEY, JSON.stringify(save));
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
	/** 田螺:已经按原价付过的那几行(结算动画逐张弹,读档后靠它重画) */
	parkRows?: { name: string; coins: number }[];
	/** 这一关已经问过的主动技(键 = `${srcId}|${skill}`) */
	askedSkills?: string[];
	/** 发动过的主动技加值/乘算:算进该 Tee 的**基础分**(乘算之前),跟着存盘走 */
	skillChips?: { srcId: string; chips: number; from?: string }[];
	skillMult?: { srcId: string; mult: number; from?: string };
	/** 这一手哪些骰子作废(高照抄作废状态用) */
	lastVoid?: number[];
	/** 这一手哪些骰子是玩家亲手改的(改点豁免,回头读骰面用) */
	lastOpted?: number[];
	/** 这一手**掷出**的骰面(改点前);老存档没有 → 退回 lastDice(口径同「每有」) */
	lastRolled?: number[];
	/** 这一手重掷过哪几颗(滞月:抽中的那颗一重掷就作废);老存档没有 → 按「一颗都没重掷」算 */
	lastRerollIdx?: number[];
	/** 桂树那类累计(按 Tee 记,不按卡);老存档没有 → 按空处理 */
	faceGrow?: GrowthMap;
	/** 饼铺掌柜那类:这只 Tee 入队后卖掉的 Tee 数;老存档没有 → 按 0 处理 */
	sold?: number;
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
	| { kind: 'voidclear'; count: number; srcId?: string }
	| { kind: 'voidfix'; count: number; point?: number; srcId?: string };

export type RunSave = {
	v: number;
	phase: string;
	round: number;
	bossId: string | null;
	/** 迷月/影月这类「随机规则」Boss 本关抽到的参数(读档不重抽);老存档没有 → 重抽 */
	bossArgs?: number[];
	target: number;
	mooncakes: number;
	runScore: number;
	team: RunTeamSlot[];
	soldTees: number;
	/** 旧的「本回合卖了几张」(每回合上限 2 个那套) —— 已废弃,读档忽略 */
	soldThisRound?: number;
	shopBuffs: string[];
	shopSold: string[];
	shopLocks: (string | null)[];
	/** 集市刷新价(每刷一次 +1;老存档没有 → 按 1 处理) */
	refreshPrice?: number;
	buffInventory: Record<string, number>;
	draftChoices: string[];
	draftPicked: number[];
	rewardChoices: string[];

	// ---- v2:回合内的细节状态 ----
	dice: number[];
	/**
	 * 正在进行的这一手**掷出**的骰面(改点之前)。
	 * 骰子底面画的是它,丹火的「每掷出」乘算也读它;老存档没有 → 退回 dice。
	 */
	rolledDice?: number[];
	/** 正在进行的这一手重掷过哪几颗(滞月);老存档没有 → 按空算 */
	rerolledIdx?: number[];
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
	/** 后羿自动重掷按 Tee 记谁用过(老档只有布尔 → 读档时摊给全队) */
	rerollAllUsedIdxs?: number[];
	/** 「跳过重掷」时还剩几次重掷(余烬的归还判据);老存档没有 → 按 0 处理 */
	leftoverRolls?: number;
	choosing: boolean;
	rerollSel: boolean[];
	rollMask: boolean[];
	usedOpSrc: string[];
	/** 本关每个道具 id 用掉的张数(退款按张算);老存档没有这个字段,读档时兜底成 {} */
	usedOpCount?: Record<string, number>;
	optedDice: number[];
	clearedVoid: number[];
	/** 月相符本关按颗解除作废的下标(按 Tee 记);老存档没有这个字段 → 读档兜底成 [] */
	voidFixed?: number[][];
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
	/** 这一手是否已**定格**(骰子已可见)。定格过的手恢复时绝不重掷 —— 免得刷新换一手(刷分) */
	frozen?: boolean;

	// ---- 结算页的收集统计 + MVP(老存档没有 → 读档兕底)。刷新回结算页要靠它 ——
	// 否则刷新一下,刚打完那局的统计/MVP 全没了,结算页只剩个空壳
	runStats?: {
		cardsBought: number;
		earnedMooncakes: number;
		rerolled: number;
		scoredFaces: number[];
		startedAt: number;
		/** 结束时刻(进结算屏那一下记);历时按 endedAt − startedAt 算,刷新也不会长 */
		endedAt?: number;
	};
	/** 结算页「购入最多」的按卡计数 */
	boughtCounts?: Record<string, number>;
	/** MVP:单次结算最高分 + 那一次结算的行文本(text + cls,和结算动画同色) */
	mvp?: {
		name: string;
		skin: string;
		score: number;
		levelName: string;
		round: number;
		teeIdx: number;
		rows: { text: string; cls: string }[];
	} | null;

	/** 回合开始时的统计快照(「本关重掷」回滚到这一刻)。入档 —— 刷新后没它就漏回滚,
	 *  重掷完这一关会把结算次数/点数分布算两遍;老存档没有 → 按 null 处理(不回滚) */
	roundStatSnap?: {
		faces: number[];
		rerolled: number;
		mvp: RunSave['mvp'];
	} | null;

	// ---- 后来补的本关状态(花生/蜜枣/归家/猜谜/夜市/高照);老存档没有 → 读档时兕底 ----
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

/**
 * 局内存档形状校验 —— **逐字段过,不符即抛**(loadRun 捕获后清档返回 null)。
 * 为什么这么严:合法 JSON 的形状错(实测 shopSold: 123)不会抛异常,带病通过
 * restoreRun 的 try/catch,却在渲染期炸 —— 白屏且刷新不恢复。宁可丢档,不带病。
 */
const validateRun = (d: RunSave): void => {
	const bad = (k: string): never => {
		throw new Error(`损坏存档: ${k}`);
	};
	const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
	const check = (k: string, kind: 'num' | 'str' | 'bool' | 'arr' | 'str|null') => {
		const v = (d as unknown as Record<string, unknown>)[k];
		const ok =
			kind === 'num'
				? isNum(v)
				: kind === 'str'
					? typeof v === 'string'
					: kind === 'bool'
						? typeof v === 'boolean'
						: kind === 'arr'
							? Array.isArray(v)
							: v === null || typeof v === 'string';
		if (!ok) bad(k);
	};
	for (const k of [
		'round',
		'target',
		'mooncakes',
		'runScore',
		'soldTees',
		'currentTee',
		'currentScore',
		'roundTotal',
		'countedTee',
		'settlePreview',
		'diceSum',
		'rollsLeft',
		'rerollCount',
		'speedIdx',
		'roundRewardGained',
		'overflowGained',
		'economyGained',
		'finalScore',
		'finalRunScore',
		'finalRound',
		'lastRewardIdx'
	])
		check(k, 'num');
	for (const k of ['phase', 'lastLevelId', 'rollKind']) check(k, 'str');
	for (const k of ['bossId', 'shopPickId', 'selectedBuffId', 'pendingActiveKey'])
		check(k, 'str|null');
	for (const k of ['choosing', 'rerollAllUsed', 'pointPicker', 'isNewBest', 'wasRolling'])
		check(k, 'bool');
	for (const k of [
		'team',
		'shopBuffs',
		'shopSold',
		'shopLocks',
		'draftChoices',
		'draftPicked',
		'rewardChoices',
		'dice',
		'rerollSel',
		'rollMask',
		'usedOpSrc',
		'optedDice',
		'clearedVoid',
		'setQueue'
	])
		check(k, 'arr');
	// 可选字段:在就必须是「数组的数组,元素是数字」(坏档宁可丢掉,别带病渲染)
	if (d.voidFixed !== undefined) {
		if (
			!Array.isArray(d.voidFixed) ||
			d.voidFixed.some((a) => !Array.isArray(a) || a.some((v) => !isNum(v)))
		)
			bad('voidFixed');
	}
	if (d.dice.some((v) => !isNum(v))) bad('dice');
};

export const loadRun = (): RunSave | null => {
	try {
		const raw = localStorage.getItem(RUN_KEY);
		if (!raw) return null;
		const data = JSON.parse(raw) as RunSave;
		// 只验版本号不够:合法 JSON 的坏档不抛,却会把状态机推进未知态/渲染期白屏。
		// 逐字段校验,不符即抛 → 这里的 catch 清档返回 null;phase 另在页面入口过白名单。
		if (data.v !== RUN_VERSION) {
			localStorage.removeItem(RUN_KEY);
			return null;
		}
		validateRun(data);
		return data;
	} catch {
		try {
			localStorage.removeItem(RUN_KEY);
		} catch {
			// ignore
		}
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
