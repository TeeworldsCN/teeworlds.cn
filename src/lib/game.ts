// 月宫掷骰 · 游戏核心逻辑(关卡、Boss、计分、存档)
import { getRollLevel, judgeRoll, type DiceMods } from './midautumn';
import { CARDS, CARD_BY_ID, condHit, type TeeCard, type TeeEffect } from './teecards';
import { BUFF_BY_ID, type AppliedBuff } from './items';

// ---- 关卡 ----

/** 第 n 关目标分数(从 1 开始),指数增长 */
export const roundTarget = (n: number): number => Math.round((20 * Math.pow(2, n - 1)) / 10) * 10;
// 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240, ...

/** 每 3 关为一个 Ante */
export const anteOf = (n: number) => Math.ceil(n / 3);

/** 是否 Boss 关(每 Ante 的第 3 关) */
export const isBossRound = (n: number) => n % 3 === 0;

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
}

const BOSSES: Boss[] = [
	{ id: 'heiyue', name: '黑月', emoji: '🌑', desc: '本关目标分数 ×1.5', targetMult: 1.5 },
	{ id: 'miyue', name: '迷月', emoji: '🌫️', desc: '本关骰子的 6 视为 3', mods: { map: { 6: 3 } } },
	{
		id: 'yingyue',
		name: '影月',
		emoji: '🌒',
		desc: '本关骰子的 4 视为 2;掷出 4 至少算一秀',
		mods: { fourAs: 2 }
	},
	{ id: 'shiyue', name: '蚀月', emoji: '🌘', desc: '本关所有骰子点数 -1', mods: { shift: -1 } },
	{ id: 'wuyue', name: '雾月', emoji: '🌁', desc: '本关骰子的 6 视为 1', mods: { map: { 6: 1 } } },
	{ id: 'jimoon', name: '疾月', emoji: '🌙', desc: '本关目标分数 ×2', targetMult: 2 }
];

/** 温和 Boss(前期使用) */
const MILD_BOSSES = ['heiyue', 'miyue', 'yingyue'];

/** 第 n 关的 Boss: 前 2 个 Ante 用温和池,之后全池 */
export const getBoss = (n: number): Boss => {
	const pool = BOSSES.filter((b) => (n <= 6 ? MILD_BOSSES.includes(b.id) : true));
	return pool[Math.floor(Math.random() * pool.length)];
};

export const getBossById = (id: string): Boss => BOSSES.find((b) => b.id === id) ?? BOSSES[0];

// ---- 队伍 ----

export interface TeamTee {
	/** 卡牌 id,主 Tee(玩家皮肤)为 null */
	cardId: string | null;
	/** 玩家皮肤(仅主 Tee) */
	playerSkin?: string;
	/** 本关个人得分(掷完后) */
	lastScore: number;
	lastLevelId: string;
	lastDice: number[];
	/** 身上挂载的加成卡(未消耗的回合) */
	buffs: AppliedBuff[];
}

export const TEAM_LIMIT = 6;

/** 成长卡(广寒宫)的成长值: cardId -> 已叠加层数 */
export type GrowthMap = Record<string, number>;

/** 过关后成长卡叠层 */
export const applyGrowth = (cards: TeeCard[], growth: GrowthMap): GrowthMap => {
	const next = { ...growth };
	for (const card of cards) {
		if (card.effect.type === 'scaling_mult') {
			next[card.id] = (next[card.id] ?? 0) + card.effect.per;
		}
	}
	return next;
};

// ---- 计分 ----

export interface ScoreBreakdown {
	base: number;
	chips: number;
	mult: number;
	teamMult: number;
	total: number;
}

/**
 * 计算单个 Tee 的个人得分
 * score = (levelScore + chips) × mult
 * ownCard: 该 Tee 自己的卡(个人效果生效)
 * teamCards: 全队所有卡(team_chips 全队生效)
 * buffs: 身上挂载的加成卡(掷骰前使用)
 */
export const calcTeeScore = (
	levelId: string,
	ownCard: TeeCard | null,
	teamCards: TeeCard[],
	growth: GrowthMap,
	buffs: AppliedBuff[] = []
): ScoreBreakdown => {
	const level = getRollLevel(levelId);
	let chips = 0;
	let mult = 1;

	// 加成卡: chips 累加, mult 连乘
	let buffChips = 0;
	let buffMult = 1;
	for (const b of buffs) {
		const eff = BUFF_BY_ID.get(b.cardId)?.effect;
		if (!eff) continue;
		if (eff.type === 'chips') buffChips += eff.value ?? 0;
		else if (eff.type === 'mult') buffMult *= eff.value ?? 1;
	}

	const applyCard = (card: TeeCard) => {
		const eff = card.effect;
		switch (eff.type) {
			case 'chips':
				chips += eff.value;
				break;
			case 'mult':
				mult *= eff.value;
				break;
			case 'cond':
				if (condHit(eff.cond, levelId)) {
					if (eff.chips) chips += eff.chips;
					if (eff.mult) mult *= eff.mult;
				}
				break;
			case 'team_chips':
				chips += eff.value;
				break;
			case 'scaling_mult':
				mult *= 1 + (growth[card.id] ?? 0);
				break;
		}
	};

	if (ownCard) applyCard(ownCard);
	// 全队卡: 只取 team_chips 效果(避免重复计算个人卡)
	for (const card of teamCards) {
		if (card.id !== ownCard?.id && card.effect.type === 'team_chips') {
			applyCard(card);
		}
	}

	const base = level.score;
	const total = Math.max(0, Math.round((base + chips + buffChips) * mult * buffMult * 100) / 100);
	return { base, chips: chips + buffChips, mult: mult * buffMult, teamMult: 1, total };
};

/** 加成卡保底: 掷出"再接再厉"但有保底效果(满月祝福)时, 按一秀计 */
export const applyBuffGuarantee = (levelId: string, buffs: AppliedBuff[]): string => {
	if (
		levelId === 'none' &&
		buffs.some((b) => BUFF_BY_ID.get(b.cardId)?.effect.type === 'guarantee')
	) {
		return 'yi_xiu';
	}
	return levelId;
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
	cards: TeeCard[]
): { total: number; teamMult: number } => {
	let teamMult = 1;
	for (const card of cards) {
		const eff = card.effect;
		if (eff.type === 'team_mult') teamMult *= eff.value;
	}
	return { total: Math.round(scores.reduce((a, b) => a + b, 0) * teamMult), teamMult };
};

/** 该 Tee 是否在掷后触发交互(改点/重掷) */
export const getInteractEffects = (card: TeeCard | null): TeeEffect[] => {
	if (!card) return [];
	const eff = card.effect;
	if (eff.type === 'reroll' || eff.type === 'set_point' || eff.type === 'set_any') return [eff];
	return [];
};

/** 该 Tee 掷出 none 时是否触发"重掷全部"(后羿) */
export const hasRerollAllOnNone = (card: TeeCard | null): boolean => {
	return card?.effect.type === 'reroll_all_on_none';
};

// ---- 奖励 ----

/** 过关奖励: 基础 + 关数递增 */
export const roundReward = (n: number): number => 4 + Math.floor((n - 1) / 3) * 2;

/** 溢出奖励: 每超出目标 1000 分 +1 币(上限 8) */
export const overflowReward = (score: number, target: number): number =>
	Math.min(8, Math.floor(Math.max(0, score - target) / 1000));

/** 经济卡加成 */
export const economyReward = (cards: TeeCard[]): number =>
	cards.reduce((s, c) => (c.effect.type === 'economy' ? s + c.effect.per : s), 0);

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
