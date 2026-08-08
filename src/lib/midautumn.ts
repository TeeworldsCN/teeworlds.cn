// 中秋博饼游戏规则(纯前端,客户端/服务端共用)

// ---- 等级与得分(×10 放大,便于 score attack 滚雪球) ----

export interface RollLevel {
	id: string;
	name: string;
	score: number;
	emoji: string;
	desc: string;
	/** 范例骰子组合(6 颗,1~6),规则面板展示用 */
	example: number[];
}

// 按等级从高到低排列
export const ROLL_LEVELS: RollLevel[] = [
	{
		id: 'zhuang_yuan_chajinhua',
		name: '状元插金花',
		score: 2560,
		emoji: '🌺',
		desc: '四个四点 + 两个一点,博饼最高奖',
		example: [4, 4, 4, 4, 1, 1]
	},
	{
		id: 'liu_bo_hong',
		name: '六博红',
		score: 1280,
		emoji: '🔥',
		desc: '六个四点,红透半边天',
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
		example: [4, 4, 4, 4, 4, 2]
	},
	{
		id: 'wu_zi',
		name: '五子登科',
		score: 480,
		emoji: '🎓',
		desc: '五个相同非四点',
		example: [5, 5, 5, 5, 5, 2]
	},
	{
		id: 'zhuang_yuan',
		name: '状元',
		score: 320,
		emoji: '🥇',
		desc: '四个四点',
		example: [4, 4, 4, 4, 2, 3]
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
		example: [4, 4, 4, 2, 3, 5]
	},
	{
		id: 'si_jin',
		name: '四进',
		score: 40,
		emoji: '🟢',
		desc: '四个相同非四点',
		example: [2, 2, 2, 2, 3, 5]
	},
	{
		id: 'er_ju',
		name: '二举',
		score: 20,
		emoji: '🟡',
		desc: '两个四点',
		example: [4, 4, 2, 3, 5, 6]
	},
	{
		id: 'yi_xiu',
		name: '一秀',
		score: 10,
		emoji: '⚪',
		desc: '一个四点',
		example: [4, 2, 3, 5, 6, 1]
	},
	{
		id: 'none',
		name: '再接再厉',
		score: 0,
		emoji: '💪',
		desc: '没有四点,下次一定',
		example: [2, 3, 5, 6, 1, 2]
	}
];

const BY_ID = new Map(ROLL_LEVELS.map((l) => [l.id, l]));

export const getRollLevel = (id: string): RollLevel => BY_ID.get(id) ?? BY_ID.get('none')!;

/** 点数变换修饰(用于 Boss 特效): 将原始点数映射为目标点数 */
export interface DiceMods {
	/** 每个骰子掷出后: 原始点数 -> 目标点数 */
	map?: Record<number, number>;
	/** 简易移位: 点数 +shift(1~6 循环,如 -1 表示 4 变 3) */
	shift?: number;
	/** 4 点视为该点数(禁月特效) */
	fourAs?: number;
}

/** 逐骰子变换结果: v 为变换后点数, fake 标记由 4 变换而来的"伪点"(不参与非四点系组合) */
/** 逐骰子变换: 原始点数 -> 目标点数 */
const applyMods = (dice: number[], mods?: DiceMods): number[] => {
	if (!mods) return dice;
	const { map, shift = 0, fourAs } = mods;
	return dice.map((d) => {
		let v = d;
		if (map && map[v] !== undefined) v = map[v];
		if (fourAs !== undefined && v === 4) v = fourAs;
		if (shift !== 0) {
			v = ((v - 1 + shift + 6) % 6) + 1;
		}
		return v;
	});
};

/**
 * 判定 6 颗骰子的博饼等级(可带 Boss 修饰)
 * 骰子点数为 1~6
 *
 * 规则: 修饰直接作用于点数后按正常规则判定(玩家可自行验算);
 * "4 视为 X"(影月)时, 原始骰子有 4 但什么都没凑成, 保底一秀。
 */
export function judgeRoll(dice: number[], mods?: DiceMods): RollLevel {
	const d = applyMods(dice, mods);
	const counts = [0, 0, 0, 0, 0, 0, 0]; // index 1..6
	for (const v of d) counts[v]++;

	const fours = counts[4];
	let maxSame = 0;
	let maxSameValue = 0;
	for (let v = 1; v <= 6; v++) {
		if (counts[v] > maxSame) {
			maxSame = counts[v];
			maxSameValue = v;
		}
	}
	const isStraight = [...d].sort((a, b) => a - b).join(',') === '1,2,3,4,5,6';

	if (fours === 6) return getRollLevel('liu_bo_hong');
	if (maxSame === 6 && maxSameValue !== 4) return getRollLevel('liu_bo_hei');
	if (fours === 5) return getRollLevel('wu_wang');
	if (maxSame === 5 && maxSameValue !== 4) return getRollLevel('wu_zi');
	if (fours === 4) {
		if (counts[1] === 2) return getRollLevel('zhuang_yuan_chajinhua');
		return getRollLevel('zhuang_yuan');
	}
	if (isStraight) return getRollLevel('dui_tang');
	if (fours === 3) return getRollLevel('san_hong');
	if (maxSame === 4 && maxSameValue !== 4) return getRollLevel('si_jin');
	if (fours === 2) return getRollLevel('er_ju');
	if (fours === 1) return getRollLevel('yi_xiu');
	// 影月保底: 4 视为 X 时, 原始骰子有 4 则至少一秀
	if (mods?.fourAs !== undefined && dice.includes(4)) return getRollLevel('yi_xiu');
	return getRollLevel('none');
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
	const d = applyMods(dice, mods);
	if (levelId === 'none') return [];
	// 影月保底一秀: 高亮原始 4(它是保底给的)
	if (mods?.fourAs !== undefined && levelId === 'yi_xiu') {
		return dice.map((v, i) => (v === 4 ? i : -1)).filter((i) => i >= 0);
	}
	if (levelId === 'dui_tang') return [0, 1, 2, 3, 4, 5];
	if (levelId === 'zhuang_yuan_chajinhua') {
		// 四个 4 + 两个 1 都算命中
		return d.map((v, i) => (v === 4 || v === 1 ? i : -1)).filter((i) => i >= 0);
	}
	if (
		levelId === 'yi_xiu' ||
		levelId === 'er_ju' ||
		levelId === 'san_hong' ||
		levelId === 'wu_wang' ||
		levelId === 'liu_bo_hong' ||
		levelId === 'zhuang_yuan'
	) {
		return d.map((v, i) => (v === 4 ? i : -1)).filter((i) => i >= 0);
	}
	// 四进 / 五子登科 / 六博黑: 数量 >= 4 的相同非四点组
	const counts = [0, 0, 0, 0, 0, 0, 0];
	for (const v of d) counts[v]++;
	let val = -1;
	for (let v = 1; v <= 6; v++) {
		if (v !== 4 && counts[v] >= 4 && counts[v] > (val === -1 ? 0 : counts[val])) val = v;
	}
	if (val === -1) return [];
	return d.map((v, i) => (v === val ? i : -1)).filter((i) => i >= 0);
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
