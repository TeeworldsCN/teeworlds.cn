// 中秋博饼游戏规则(纯前端,客户端/服务端共用)

export interface RollLevel {
	id: string;
	name: string;
	score: number;
	emoji: string;
	desc: string;
	example: (number | 'X')[];
}

// 按等级从高到低排列
export const ROLL_LEVELS: RollLevel[] = [
	{
		id: 'zhuang_yuan_chajinhua',
		name: '状元插金花',
		score: 2560,
		emoji: '🌺',
		desc: '四个四点 + 两个一点，博饼最高奖',
		example: [4, 4, 4, 4, 1, 1]
	},
	{
		id: 'liu_bo_hong',
		name: '六博红',
		score: 1280,
		emoji: '🔥',
		desc: '六个四点，红透半边天',
		example: [4, 4, 4, 4, 4, 4]
	},
	{
		id: 'liu_bo_hei',
		name: '六博黑',
		score: 960,
		emoji: '🖤',
		desc: '六个相同非四点',
		example: [3, 3, 3, 3, 3, 3]
	},
	{
		id: 'wu_wang',
		name: '五王',
		score: 640,
		emoji: '👑',
		desc: '五个四点',
		example: [4, 4, 4, 4, 4, 'X']
	},
	{
		id: 'wu_zi',
		name: '五子登科',
		score: 480,
		emoji: '🎓',
		desc: '五个相同非四点',
		example: [5, 5, 5, 5, 5, 'X']
	},
	{
		id: 'zhuang_yuan',
		name: '状元',
		score: 320,
		emoji: '🥇',
		desc: '四个四点',
		example: [4, 4, 4, 4, 'X', 'X']
	},
	{
		id: 'dui_tang',
		name: '对堂',
		score: 160,
		emoji: '🎯',
		desc: '一二三四五六各一个',
		example: [1, 2, 3, 4, 5, 6]
	},
	{
		id: 'san_hong',
		name: '三红',
		score: 80,
		emoji: '🔴',
		desc: '三个四点',
		example: [4, 4, 4, 'X', 'X', 'X']
	},
	{
		id: 'si_jin',
		name: '四进',
		score: 40,
		emoji: '🟢',
		desc: '四个相同非四点',
		example: [2, 2, 2, 2, 'X', 'X']
	},
	{
		id: 'er_ju',
		name: '二举',
		score: 20,
		emoji: '🟡',
		desc: '两个四点',
		example: [4, 4, 'X', 'X', 'X', 'X']
	},
	{
		id: 'yi_xiu',
		name: '一秀',
		score: 10,
		emoji: '⚪',
		desc: '一个四点',
		example: [4, 'X', 'X', 'X', 'X', 'X']
	},
	{
		id: 'none',
		name: '再接再厉',
		score: 0,
		emoji: '💪',
		desc: '没有四点，下次一定',
		example: ['X', 'X', 'X', 'X', 'X', 'X']
	}
];

const BY_ID = new Map(ROLL_LEVELS.map((l) => [l.id, l]));

export function sampleDice(level: RollLevel): number[] {
	const cached = SAMPLE_CACHE.get(level.id);
	if (cached) return cached;
	const xs: number[] = [];
	level.example.forEach((v, i) => {
		if (v === 'X') xs.push(i);
	});
	const out = level.example.map((v) => (v === 'X' ? 1 : v)) as number[];
	const fill = (k: number): boolean => {
		if (k === xs.length) return judgeRoll(out).id === level.id;
		for (let f = 1; f <= 6; f++) {
			out[xs[k]] = f;
			if (fill(k + 1)) return true;
		}
		return false;
	};
	fill(0);
	SAMPLE_CACHE.set(level.id, out);
	return out;
}
const SAMPLE_CACHE = new Map<string, number[]>();

export const getRollLevel = (id: string): RollLevel => BY_ID.get(id) ?? BY_ID.get('none')!;

export interface DiceMods {
	map?: Record<number, number>;
	shift?: number;
	void?: number[];
	noSameFace?: boolean;
	levelCap?: string;
	clearVoid?: boolean;
	/** 只解除这几个点数的作废(半影卡) */
	clearVoidFaces?: number[];
	chain?: DiceMods[];
	straightFloor?: boolean;
	faceFloor?: boolean;
	/** 寒月:本关加成卡的「加值」(chips)只算这个比例(0.5 = 只算一半,0 = 全废) */
	buffChipsScale?: number;
	/** 凛月:本关加成卡的「乘值」(mult)只算这个比例的**增量**(0.5 = ×5 只算 ×3,0 = 全废) */
	buffMultScale?: number;
	fixed?: number[];
	/** 按下标作废(花生:回合初始投掷整把作废,重掷的那几颗才解除) */
	voidIdx?: number[];
	/**
	 * 高照:这一手是「抄」来的,作废状态也一起抄 —— 所以本关的**点数作废**全部不算数,
	 * 只认抄来的 voidIdx。重掷之后这颗状态就丢掉,回到本关正常规则。
	 */
	voidOverride?: boolean;
}

export function longestRun(values: number[]): number {
	const has = [false, false, false, false, false, false, false];
	for (const v of values) if (v >= 1 && v <= 6) has[v] = true;
	let best = 0;
	let cur = 0;
	for (let v = 1; v <= 6; v++) {
		cur = has[v] ? cur + 1 : 0;
		if (cur > best) best = cur;
	}
	return best;
}

/**
 * 落在**连号里**的骰子颗数:任一条长度 ≥2 的连号(1-2 / 5-6 …)里的点数都算,
 * 同一条里重复的点数按颗数算(「连号里每颗骰子 +per」的字面口径)。
 * 例:1 6 5 5 2 1 有两连(1-2、5-6)→ 6 颗全算;5 5 5 5 5 5 一条连号都没有 → 0。
 */
export function straightDiceCount(values: number[]): number {
	const has = [false, false, false, false, false, false, false, false];
	for (const v of values) if (v >= 1 && v <= 6) has[v] = true;
	const inRun = [false, false, false, false, false, false, false, false];
	for (let v = 1; v <= 6; v++) if (has[v - 1] || has[v + 1]) inRun[v] = true;
	return values.filter((v) => v >= 1 && v <= 6 && inRun[v]).length;
}

export function faceFloorLevel(counts: number[]): string | null {
	let best = 0;
	for (let v = 1; v <= 6; v++) if (v !== 4 && counts[v] > best) best = counts[v];
	if (best >= 6) return 'liu_bo_hong';
	if (best === 5) return 'wu_wang';
	if (best === 4) return 'zhuang_yuan';
	if (best === 3) return 'san_hong';
	if (best === 2) return 'er_ju';
	if (best === 1) return 'yi_xiu';
	return null;
}

export function straightFloorLevel(run: number): string | null {
	// 连号一律**从二连起算**(和 straight_chips 同一口径):2~3 连 = 一秀,再往上不变。
	// 注:`straight_ladder` 现在没有任何卡带(连珠灯重做时去掉了),这里只是把口径统一,
	// 哪天把阶梯挂回灯系卡上就是「2 连也保底一秀」。
	if (run >= 5) return 'si_jin';
	if (run >= 4) return 'er_ju';
	if (run >= 2) return 'yi_xiu';
	return null;
}

export const fixedOf = (mods?: DiceMods): number[] => {
	if (!mods) return [];
	const out: number[] = [];
	const walk = (m: DiceMods) => {
		if (m.fixed?.length) out.push(...m.fixed);
		m.chain?.forEach(walk);
	};
	walk(mods);
	return out;
};

export const applyDiceMods = (dice: number[], mods?: DiceMods): number[] =>
	applyMods(dice, mods, new Set(fixedOf(mods)));

/**
 * fixed(手动改过点的骰子)要**跨层**生效。
 * modsFor 会把 {fixed} 和卡牌/道具的 {map,shift} 用 mergeMods 拼成 chain,
 * 而 fixed 只在它自己那一层被读到 —— 于是往 chain 里一拼就失效:
 * 玩家用玉玺/银针点出的 5,会被「寛月符:5 视为 4」这类效果又改回 4(踩过)。
 * 所以先把整条 chain 的 fixed 收齐,再逐层套用。
 */
const applyMods = (dice: number[], mods: DiceMods | undefined, fixed: Set<number>): number[] => {
	if (!mods) return dice;
	if (mods.chain?.length) return mods.chain.reduce((d, m) => applyMods(d, m, fixed), dice);
	const { map, shift = 0 } = mods;
	return dice.map((d, i) => {
		if (fixed.has(i)) return d;
		let v = map && map[d] !== undefined ? map[d] : d;
		if (shift !== 0) v = ((v - 1 + shift + 6) % 6) + 1;
		return v;
	});
};

/** mods(含 chain)里有没有「作废状态以抄来的为准」的标记(高照) */
export const hasVoidOverride = (mods?: DiceMods): boolean => {
	if (!mods) return false;
	if (mods.chain?.length) return mods.chain.some(hasVoidOverride);
	return mods.voidOverride === true;
};

export const voidFacesOf = (mods?: DiceMods): number[] => {
	if (!mods) return [];
	// 抄来的那一手:本关的点数作废统统不作数(只认 voidIdx)
	if (hasVoidOverride(mods)) return [];
	if (mods.chain?.length) return [...new Set(mods.chain.flatMap(voidFacesOf))];
	return mods.void ?? [];
};

const clearedFacesOf = (mods?: DiceMods): number[] => {
	if (!mods) return [];
	if (mods.chain?.length) return mods.chain.flatMap(clearedFacesOf);
	return mods.clearVoidFaces ?? [];
};

/** 该点数是否被作废。「取消作废」的点数(半影卡)不算 —— 不管作废来自 Boss 还是自己的卡 */
export const isVoidFace = (face: number, mods?: DiceMods): boolean =>
	!clearedFacesOf(mods).includes(face) && voidFacesOf(mods).includes(face);

/** 按下标作废的骰子(花生) */
export const voidIdxOf = (mods?: DiceMods): number[] => {
	if (!mods) return [];
	if (mods.chain?.length) return mods.chain.flatMap(voidIdxOf);
	return mods.voidIdx ?? [];
};

/**
 * 第 i 颗骰子是否作废 —— 按点数(Boss/自己的卡)和按下标(花生)两种口径合一。
 * 半影卡的「取消作废」只认点数:它挑的是牌面,救不了按颗作废的骰子。
 */
export const isVoidDie = (dice: number[], i: number, mods?: DiceMods): boolean =>
	voidIdxOf(mods).includes(i) || isVoidFace(dice[i], mods);

/**
 * 参与结算的点数:套上 map/shift 之后,把**作废**的骰子整个剔掉。
 * 判定、和值、点数类效果(每颗 4 分 / 某点数个数 / 连号)都要用这个 ——
 * 作废的意思是「这颗骰子本关不算数」,不只是不算牌型。
 * 作废按**原始骰面**判:改点把 6 改成 4 之后就不再作废了。
 */
export const liveDiceValues = (dice: number[], mods?: DiceMods): number[] => {
	const shown = applyDiceMods(dice, mods);
	return shown.filter((_, i) => !isVoidDie(dice, i, mods));
};

/** 原始骰面(不做 map/shift),只剔掉作废的 —— 给「重复牌倍率」这类数真实骰面的效果用 */
export const rawLiveDice = (dice: number[], mods?: DiceMods): number[] =>
	dice.filter((_, i) => !isVoidDie(dice, i, mods));

/**
 * 「每**掷出** 1 颗 X 点」的计数:**原投掷的算,改成 X 点的也算,同一颗只算一次**。
 *
 * ⚠️ 只服务文案写「每掷出」的那一族(三星照 / 柳眉 / 朔日 / 上弦)。
 *    文案写「每有」「最终骰子里」的(拾遗 / 明月共照 / 拾贝 / 桂树 / 月系四点 …)
 *    一律只数**最终骰面**,别拿这个函数去换 —— 两套口径是故意分开的:
 *      · 每有   = 最终判定的点数(被改走的就不算)
 *      · 每掷出 = 掷出来是什么就算什么
 *    三星照自己就把 3 改成了 4:只数最终骰面,它那句「每掷出 1 颗 3 点」永远是 0。
 *
 * 同一颗两个数组都命中(原投掷就是 3、也没被改走)时只记一次。
 * 两个数组都必须是**剔过作废**的同序数组(liveDiceValues / rawLiveDice),
 * 否则作废的骰子会被数进来。
 */
export const faceHits = (face: number, shown: number[], raw?: number[]): number => {
	let n = 0;
	for (let i = 0; i < shown.length; i++) if (shown[i] === face || raw?.[i] === face) n += 1;
	return n;
};

/** mods(含 chain)里是否有「解除作废」 */
export const hasClearVoid = (mods?: DiceMods): boolean => {
	if (!mods) return false;
	if (mods.chain?.length) return mods.chain.some(hasClearVoid);
	return mods.clearVoid === true;
};

/** 摘掉所有作废(月食卡用) */
export const stripVoid = (mods?: DiceMods): DiceMods | undefined => {
	if (!mods) return undefined;
	if (mods.chain?.length) return { ...mods, chain: mods.chain.map(stripVoid) as DiceMods[] };
	if (!mods.void?.length && !mods.voidIdx?.length && !mods.voidOverride) return mods;
	const { void: _drop, voidIdx: _dropIdx, voidOverride: _dropOv, ...rest } = mods;
	return rest;
};

/** mods(含 chain)里是否含某字段 */
const hasMod = (
	mods: DiceMods | undefined,
	key: 'noSameFace' | 'levelCap' | 'straightFloor' | 'faceFloor'
): boolean => {
	if (!mods) return false;
	if (mods.chain?.length) return mods.chain.some((m) => hasMod(m, key));
	return mods[key] !== undefined;
};

export const levelCapOf = (mods?: DiceMods): string | undefined => {
	if (!mods) return undefined;
	if (mods.chain?.length) {
		let cap: string | undefined;
		for (const m of mods.chain) {
			const c = levelCapOf(m);
			if (c && (!cap || getRollLevel(c).score < getRollLevel(cap).score)) cap = c;
		}
		return cap;
	}
	return mods.levelCap;
};

const applyLevelCap = (level: RollLevel, mods?: DiceMods): RollLevel => {
	const cap = levelCapOf(mods);
	if (!cap) return level;
	const capLevel = getRollLevel(cap);
	return level.score <= capLevel.score ? level : capLevel;
};

export const cappedLevelId = (levelId: string, mods?: DiceMods): string =>
	applyLevelCap(getRollLevel(levelId), mods).id;

/** 去掉封顶(高亮用) */
const stripLevelCap = (mods: DiceMods): DiceMods =>
	mods.chain ? { chain: mods.chain.map(stripLevelCap) } : { ...mods, levelCap: undefined };

const liveDice = (dice: number[], mods?: DiceMods): { values: number[]; faces: number[] } => {
	const shown = applyDiceMods(dice, mods);
	const values: number[] = [];
	const faces: number[] = [];
	dice.forEach((raw, i) => {
		if (isVoidDie(dice, i, mods)) return;
		values.push(shown[i]);
		faces.push(raw);
	});
	return { values, faces };
};

export function judgeRoll(dice: number[], mods?: DiceMods): RollLevel {
	let res = judgeRollRaw(dice, mods);
	const { values: d } = liveDice(dice, mods);
	const raiseTo = (lid: string | null) => {
		if (!lid) return;
		const up = applyLevelCap(getRollLevel(lid), mods);
		if (up.score > res.score) res = up;
	};
	if (hasMod(mods, 'straightFloor')) raiseTo(straightFloorLevel(longestRun(d)));
	if (hasMod(mods, 'faceFloor')) {
		const counts = [0, 0, 0, 0, 0, 0, 0];
		for (const v of d) counts[v]++;
		raiseTo(faceFloorLevel(counts));
	}
	return res;
}

function judgeRollRaw(dice: number[], mods?: DiceMods): RollLevel {
	const { values: d } = liveDice(dice, mods);
	const counts = [0, 0, 0, 0, 0, 0, 0]; // index 1..6
	for (const v of d) counts[v]++;

	const fours = counts[4];
	const noSame = hasMod(mods, 'noSameFace');
	let maxSame = 0;
	let maxSameValue = 0;
	for (let v = 1; v <= 6; v++) {
		if (counts[v] > maxSame) {
			maxSame = counts[v];
			maxSameValue = v;
		}
	}
	const isStraight = [...d].sort((a, b) => a - b).join(',') === '1,2,3,4,5,6';

	const pick = (id: string) => applyLevelCap(getRollLevel(id), mods);

	if (fours === 6) return pick('liu_bo_hong');
	if (!noSame && maxSame === 6 && maxSameValue !== 4) return pick('liu_bo_hei');
	if (fours === 5) return pick('wu_wang');
	if (!noSame && maxSame === 5 && maxSameValue !== 4) return pick('wu_zi');
	if (fours === 4) {
		if (counts[1] === 2) return pick('zhuang_yuan_chajinhua');
		return pick('zhuang_yuan');
	}
	if (isStraight) return pick('dui_tang');
	if (fours === 3) return pick('san_hong');
	if (!noSame && maxSame === 4 && maxSameValue !== 4) return pick('si_jin');
	if (fours === 2) return pick('er_ju');
	if (fours === 1) return pick('yi_xiu');
	return pick('none');
}

/** 随机掷 6 颗骰子 */
export function rollDice(): number[] {
	return Array.from({ length: 6 }, () => 1 + Math.floor(Math.random() * 6));
}

export function hitIndices(dice: number[], levelId: string, mods?: DiceMods): number[] {
	const shown = applyDiceMods(dice, mods);
	// 作废的骰子永不参与高亮
	const idx = dice.map((_, i) => (isVoidDie(dice, i, mods) ? -1 : i)).filter((i) => i >= 0);
	const d = idx.map((i) => shown[i]);
	// 封顶(血月)时按**原本掷出的牌型**高亮,否则玩家看不出是哪几颗凑的
	if (hasMod(mods, 'levelCap')) levelId = judgeRoll(dice, stripLevelCap(mods!)).id;
	if (levelId === 'none') return [];
	const at = (k: number) => idx[k];
	if (levelId === 'dui_tang') return [...idx];
	// 连号阶梯:亮出最长连号里各一颗
	if (hasMod(mods, 'straightFloor')) {
		const lid = straightFloorLevel(longestRun(d));
		if (lid === levelId) {
			const start = (() => {
				for (let s0 = 1; s0 <= 6; s0++)
					if (d.includes(s0) && !d.includes(s0 - 1)) {
						let len = 0;
						while (d.includes(s0 + len)) len++;
						if (len === longestRun(d)) return s0;
					}
				return 1;
			})();
			const need = [...new Set(d.filter((v) => v >= start && v < start + longestRun(d)))];
			return need.map((v) => at(d.indexOf(v))).filter((i) => i >= 0);
		}
	}
	if (levelId === 'zhuang_yuan_chajinhua') {
		// 四个 4 + 两个 1 都算命中
		return d.map((v, k) => (v === 4 || v === 1 ? at(k) : -1)).filter((i) => i >= 0);
	}
	if (
		levelId === 'yi_xiu' ||
		levelId === 'er_ju' ||
		levelId === 'san_hong' ||
		levelId === 'wu_wang' ||
		levelId === 'liu_bo_hong' ||
		levelId === 'zhuang_yuan'
	) {
		return d.map((v, k) => (v === 4 ? at(k) : -1)).filter((i) => i >= 0);
	}
	// 四进 / 五子登科 / 六博黑: 数量 >= 4 的相同非四点组
	const counts = [0, 0, 0, 0, 0, 0, 0];
	for (const v of d) counts[v]++;
	let val = -1;
	for (let v = 1; v <= 6; v++) {
		if (v !== 4 && counts[v] >= 4 && counts[v] > (val === -1 ? 0 : counts[val])) val = v;
	}
	if (val === -1) return [];
	return d.map((v, k) => (v === val ? at(k) : -1)).filter((i) => i >= 0);
}

// ---- 骰子渲染点阵 ----

export const DICE_PIPS: Record<number, number[]> = {
	1: [5],
	2: [3, 7],
	3: [3, 5, 7],
	4: [1, 3, 7, 9],
	5: [1, 3, 5, 7, 9],
	6: [1, 3, 4, 6, 7, 9]
};

export const showPip = (value: number, pos: number) => (DICE_PIPS[value] ?? []).includes(pos);
