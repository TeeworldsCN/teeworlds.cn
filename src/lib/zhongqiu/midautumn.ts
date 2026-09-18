// 中秋博饼游戏规则(纯前端,客户端/服务端共用)

// ---- 等级与得分(×10 放大,便于 score attack 滚雪球) ----

export interface RollLevel {
	id: string;
	name: string;
	score: number;
	emoji: string;
	desc: string;
	/**
	 * 范例骰子组合(6 颗)。`'X'` = 与这个牌型无关的散牌(玩法说明里就显示 X)。
	 * 需要真实手牌时用 `sampleDice()` 补全 —— 别直接拿去计分。
	 */
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

/**
 * 把示例里的 `'X'` 补成真实点数,得到一手**确实判定为该等级**的牌。
 * 作弊引擎(jump)塞「已掷完」结果、以及任何需要真实骰子的地方都走这里 ——
 * 直接把带 X 的 example 丢进计分函数会算出 NaN。
 */
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

/** 点数变换 / 作废修饰(用于 Boss 特效与卡牌) */
export interface DiceMods {
	/** 每个骰子掷出后: 原始点数 -> 目标点数 */
	map?: Record<number, number>;
	/** 简易移位: 点数 +shift(1~6 循环,如 -1 表示 4 变 3)。平移是面的置换,不改概率 */
	shift?: number;
	/** 作废点数:掷出这些点数的骰子不参与任何判定(4 点系/同点组合/对堂都不算) */
	void?: number[];
	/** 同点组合(四进/五子登科/六博黑)本关不作数 */
	noSameFace?: boolean;
	/** 本关等级封顶(血月:再好的牌也只算到这一档) */
	levelCap?: string;
	/** 解除作废:月食卡挂上后,该 Tee 本关不受「点数作废」影响 */
	clearVoid?: boolean;
	/** 依次叠加多段变换(先 chain[0],再 chain[1]…),用于「角色自身改造 + Boss 改造」叠加 */
	chain?: DiceMods[];
	/** 连号阶梯:123/234/345/456 按一秀、1234 系按二举、12345 系按四进结算(只抬不压) */
	straightFloor?: boolean;
	/** 点数阶梯:非 4 点的同点 n 颗按 4 点线同档位结算(只抬不压) */
	faceFloor?: boolean;
	/** 玩家手动改过的骰子下标:豁免「视为」映射(改点 > 视为 > 原始点数) */
	fixed?: number[];
}

/** 最长连续点数长度(只看出现过哪些点数):123 → 3、3456 → 4、123456 → 6 */
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

/** 点数阶梯:非 4 点报点数 n 颗对应的档位(和 4 点线同一张表) */
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

/** 连号阶梯对应的等级(不足 3 连返回 null) */
export function straightFloorLevel(run: number): string | null {
	if (run >= 5) return 'si_jin';
	if (run >= 4) return 'er_ju';
	if (run >= 3) return 'yi_xiu';
	return null;
}

/** 应用点数变换(判定与和值都要用变换后的点数) */
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

export const applyDiceMods = (dice: number[], mods?: DiceMods): number[] => {
	if (!mods) return dice;
	if (mods.chain?.length) return mods.chain.reduce((d, m) => applyDiceMods(d, m), dice);
	const { map, shift = 0 } = mods;
	// 改点盖过视为:玩家手动改过的骰子不再吃映射
	const fixed = new Set(mods.fixed ?? []);
	return dice.map((d, i) => {
		if (fixed.has(i)) return d;
		let v = map && map[d] !== undefined ? map[d] : d;
		if (shift !== 0) v = ((v - 1 + shift + 6) % 6) + 1;
		return v;
	});
};

/** 作废点数(chain 各段取并集)。看的是**掷出的原始点数**,玩家一眼能对上骰面 */
export const voidFacesOf = (mods?: DiceMods): number[] => {
	if (!mods) return [];
	if (mods.chain?.length) return [...new Set(mods.chain.flatMap(voidFacesOf))];
	return mods.void ?? [];
};

export const isVoidFace = (face: number, mods?: DiceMods): boolean =>
	voidFacesOf(mods).includes(face);

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
	if (!mods.void?.length) return mods;
	const { void: _drop, ...rest } = mods;
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

/**
 * 取 mods 里最严格的等级封顶(chain 里任一段设了就生效)。
 * **按分数比,不能按数组下标** —— ROLL_LEVELS 是分数从高到低排的,
 * 用下标会把「低档」当成高档,封顶变成白送(踩过一次)。
 */
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

/** 按封顶降级:超过 cap 的一律算 cap 那档 */
const applyLevelCap = (level: RollLevel, mods?: DiceMods): RollLevel => {
	const cap = levelCapOf(mods);
	if (!cap) return level;
	const capLevel = getRollLevel(cap);
	return level.score <= capLevel.score ? level : capLevel;
};

/** 封顶后的等级 id(升级卡/保底结算之后再套一次,避免越过封顶) */
export const cappedLevelId = (levelId: string, mods?: DiceMods): string =>
	applyLevelCap(getRollLevel(levelId), mods).id;

/** 去掉封顶(高亮用) */
const stripLevelCap = (mods: DiceMods): DiceMods =>
	mods.chain ? { chain: mods.chain.map(stripLevelCap) } : { ...mods, levelCap: undefined };

/** 参与判定的骰子(作废点数直接剔除,对堂也会因此被拆掉) */
const liveDice = (dice: number[], mods?: DiceMods): { values: number[]; faces: number[] } => {
	const shown = applyDiceMods(dice, mods);
	const values: number[] = [];
	const faces: number[] = [];
	dice.forEach((raw, i) => {
		if (isVoidFace(raw, mods)) return;
		values.push(shown[i]);
		faces.push(raw);
	});
	return { values, faces };
};

/**
 * 判定 6 颗骰子的博饼等级(可带 Boss 修饰)
 * 骰子点数为 1~6
 *
 * 规则:
 *   ① 「视为」类修饰直接改点数后按正常规则判定(玩家可自行验算);
 *   ② 「作废」点数的骰子不参与任何判定(4 点系/同点组合/对堂都不算);
 *   ③ 暗月: noSameFace 时同点组合整档不作数;
 *   ④ 月食: levelCap 时等级封顶。
 */
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

/**
 * 判定后命中的骰子索引(用于掷骰结果高亮展示)
 * 四点系: 所有 4;四进/五子/六博黑: 相同非四点组;对堂: 全部;再接再厉: 无
 */
export function hitIndices(dice: number[], levelId: string, mods?: DiceMods): number[] {
	const shown = applyDiceMods(dice, mods);
	// 作废的骰子永不参与高亮
	const idx = dice.map((raw, i) => (isVoidFace(raw, mods) ? -1 : i)).filter((i) => i >= 0);
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
