// 月宫掷骰 · 游戏核心逻辑(关卡、Boss、计分、存档)
import { getRollLevel, hasClearVoid, judgeRoll, stripVoid, type DiceMods } from './midautumn';
import { LEVEL_LADDER, CARD_BY_ID, CARDS, condHit, type TeeCard, type TeeEffect } from './teecards';
import { longestRun } from './midautumn';
import { BUFF_BY_ID, type AppliedBuff } from './items';

// ---- 关卡 ----
//

export const TARGETS = [
	60, 180, 360, 560, 750, 885, 1045, 1235, 1460, 1725, 2035, 2400, 2835, 3345, 3950, 4660
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
		desc: '本关掷出的 4 作废；目标 ×0.4',
		mods: { void: [4] },
		targetMult: 0.4,
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
		targetMult: 1.5
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

export const getBoss = (n: number): Boss => {
	const pool = BOSSES.filter((b) => (n <= 6 ? b.mild : b.id !== 'shiyue' || n > 16));
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
	/** 卡牌 id,主 Tee(玩家皮肤)为 null */
	cardId: string | null;
	/** 玩家皮肤(仅主 Tee) */
	playerSkin?: string;
	/** 本关该 Tee 的得分(掷完后) */
	lastScore: number;
	lastLevelId: string;
	lastDice: number[];
	buffs: AppliedBuff[];
	charge?: number;
}

export const TEAM_LIMIT = 6;

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
	kind: 'point' | 'any' | 'bump';
	count: number;
	point?: number;
	srcId?: string;
}

export const collectSetOps = (self: EffectiveEffect[], buffs: AppliedBuff[] = []): SetOp[] => {
	const ops: SetOp[] = [];
	type AnyEff = { type: string; parts?: AnyEff[]; count?: number; point?: number };
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
		// 月食卡:解除本关的「点数作废」
		if (e?.type === 'clear_void') mods.push({ clearVoid: true });
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
	const walk = (eff: TeeEffect) => {
		if (eff.type === 'map_player_die') map[eff.from] = eff.to;
		else if (eff.type === 'bundle') eff.parts.forEach(walk);
	};
	for (const c of cards) if (c) walk(c.effect);
	return Object.keys(map).length ? { map } : undefined;
};

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
	teamCards: (TeeCard | null)[];
	growth: GrowthMap;
	buffs: AppliedBuff[];
	teamSize: number;
	/** 判定用的骰子点数和 */
	diceSum: number;
	ownDice?: number[];
	rerolled?: number;
	playerLevelId: string;
	playerDice: number[];
	playerRawDice?: number[];
	/** 当前月饼币(coin_mult 用) */
	coins?: number;
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
	teamCards,
	growth,
	buffs,
	teamSize,
	diceSum,
	ownDice = [],
	rerolled = 0,
	playerLevelId,
	playerDice,
	playerRawDice,
	coins = 0,
	round = 1,
	leftScore = 0,
	soldCount = 0
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

	const apply = (eff: TeeEffect, srcId: string, skipTeamWide = false) => {
		switch (eff.type) {
			case 'chips': {
				const before = { chips, mult };
				chips += eff.value;
				note(srcId, 'card', chips - before.chips, before.mult === 0 ? 1 : mult / before.mult);
				break;
			}
			case 'face_count_mult': {
				if (skipTeamWide || index !== 0) break;
				{
					const raw = playerRawDice ?? playerDice ?? [];
					const hits = raw.filter((d) => d === eff.face).length;
					if (hits > 0) {
						const bm = mult;
						mult *= eff.perHit ? Math.pow(eff.perHit, hits) : hits + 1;
						note(srcId, 'card', 0, bm === 0 ? 1 : mult / bm, `${hits} 颗 ${eff.face}`);
					}
				}
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
				else mult *= Math.pow(eff.per, n);
				// 底分 = 四点颗数(用最终骰子,「1、6 视为 4」已算进去):
				if (eff.chipsPerFour) chips += ownDice.filter((d) => d === 4).length * eff.chipsPerFour;
				note(srcId, 'card', chips - bc, bm === 0 ? 1 : mult / bm, `${eff.tag}系 ${n} 张`);
				break;
			}
			case 'on_player': {
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
				eff.parts.forEach((p) => apply(p, srcId, skipTeamWide));
				break;
			default:
				break; // team_mult / economy / interest / extra_roll / set_* / self_mods / level_up / copy_right 不在这里计分
		}
	};

	// 自己卡牌的效果(跳过全队效果,免得和下面那轮重复计算)
	for (const { eff, srcId } of self) apply(eff, srcId, true);
	for (const list of allSelf) {
		for (const { eff, srcId } of list) {
			if (eff.type === 'team_chips') apply(eff, srcId, false);
			else if (eff.type === 'on_player' && eff.teamWide) apply(eff, srcId, false);
			// 流派流的传说档:一张卡把全队同流派都抬起来
			else if (eff.type === 'per_tag' && eff.teamWide) apply(eff, srcId, false);
			// 重复牌倍率:卡在谁身上都生效,但只抬主 Tee(自己那一轮已跳过)
			else if (eff.type === 'face_count_mult') apply(eff, srcId, false);
			// 上面那几种可能被包在 bundle 里(改点卡的「重复牌倍率」就是)
			else if (eff.type === 'bundle')
				for (const p of eff.parts) if (p.type === 'face_count_mult') apply(p, srcId, false);
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

	const base = Math.max(level.score, baseFloor);
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
	const raw = Math.round((base + chips + buffChips) * mult * buffMult * 100) / 100;
	const netChips = chips + buffChips;
	const total = swapped !== null || allowNegative || netChips < 0 ? raw : Math.max(0, raw);
	return { base, chips: chips + buffChips, mult: mult * buffMult, teamMult: 1, total, sources };
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
	const walk = (eff: TeeEffect, i: number, cardId: string) => {
		if (eff.type === 'team_mult') teamMult *= eff.value;
		else if (eff.type === 'relay_pct') addRelay(eff, i, cardId);
		else if (eff.type === 'team_ratio') {
			// 只放大「我」这一份再加进总分,不再乘全队总分:
			const own = Math.max(1, scores[i] ?? 0);
			const nb =
				eff.from === 'right' ? (scores[i + 1] ?? 0) : (scores[i + 1] ?? scores[i - 1] ?? 0);
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
export const roundReward = (n: number): number => 5 + Math.floor((n - 1) / 3) * 3;

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

// ---- 局内存档:退出页面重进还能接着打 ----
//
// 与上面的最高分/局数分开存(那个是跨局战绩,这个是当前这一局)。
// 避免把动画中途的半成品状态写进去(重新进就是重掷本关,单机游戏不亏)。
const RUN_KEY = 'midautumn:run';
const RUN_VERSION = 5;

export type RunTeamSlot = {
	cardId: string | null;
	buffs: { cardId: string; turnsLeft: number }[];
	lastScore: number;
	lastLevelId: string;
	lastDice: number[];
	/** 主动技能冷却(几关后可用) */
	charge?: number;
};

export type RunOp =
	| { kind: 'set_point'; count: number; point: number; srcId?: string }
	| { kind: 'set_any'; count: number; pick?: number; srcId?: string }
	| { kind: 'bump'; count: number; srcId?: string };

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
	soldThisRound: number;
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
	optedDice: number[];
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
