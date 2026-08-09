// 道具系统: 加成卡(掷骰前挂到 Tee 上,持续数回合)与重构卡(掷完后操作点数)
import type { Rarity } from './teecards';

// ---- 加成卡 ----

export interface BuffEffect {
	type: 'chips' | 'mult' | 'guarantee';
	value?: number;
}

export interface BuffCard {
	id: string;
	name: string;
	/** 效果描述(同时用于 tooltip) */
	desc: string;
	rarity: Rarity;
	/** 卡面 Tee 皮肤 */
	skin: string;
	price: number;
	/** 激活回合数(通常 1,最多 3): 挂上后每过一关 -1,归零消失 */
	turns: number;
	effect: BuffEffect;
}

/** 挂在 Tee 身上的激活加成 */
export interface AppliedBuff {
	cardId: string;
	turnsLeft: number;
}

export const BUFF_CARDS: BuffCard[] = [
	{
		id: 'yuefu',
		name: '月兔护符',
		desc: '该 Tee 得分 +60',
		rarity: 'common',
		skin: 'tuzi',
		price: 2,
		turns: 1,
		effect: { type: 'chips', value: 60 }
	},
	{
		id: 'guihuami',
		name: '桂花蜜',
		desc: '该 Tee 得分 ×1.5',
		rarity: 'common',
		skin: 'cupcake',
		price: 2,
		turns: 1,
		effect: { type: 'mult', value: 1.5 }
	},
	{
		id: 'xingguangzhu',
		name: '星光烛',
		desc: '该 Tee 得分 +50',
		rarity: 'rare',
		skin: 'snowflake',
		price: 4,
		turns: 2,
		effect: { type: 'chips', value: 50 }
	},
	{
		id: 'yulu',
		name: '玉露',
		desc: '该 Tee 得分 ×2',
		rarity: 'rare',
		skin: 'IceWitch',
		price: 4,
		turns: 2,
		effect: { type: 'mult', value: 2 }
	},
	{
		id: 'manyuezhufu',
		name: '满月祝福',
		desc: '掷出"再接再厉"时保底一秀(10 分)',
		rarity: 'rare',
		skin: 'bunny',
		price: 4,
		turns: 3,
		effect: { type: 'guarantee' }
	},
	{
		id: 'jinguiguan',
		name: '金桂冠',
		desc: '该 Tee 得分 ×3',
		rarity: 'legendary',
		skin: 'golden shroom',
		price: 6,
		turns: 1,
		effect: { type: 'mult', value: 3 }
	}
];

// ---- 重构卡 ----

export interface ReworkCard {
	id: string;
	name: string;
	desc: string;
	rarity: Rarity;
	/** 卡面 Tee 皮肤 */
	skin: string;
	price: number;
	effect: { type: 'reroll_tee' };
}

export const REWORK_CARDS: ReworkCard[] = [
	{
		id: 'chongzhifu',
		name: '重掷符',
		desc: '让 1 个 Tee 重新投掷',
		rarity: 'common',
		skin: 'dknight',
		price: 3,
		effect: { type: 'reroll_tee' }
	}
];

export const BUFF_BY_ID = new Map(BUFF_CARDS.map((c) => [c.id, c]));
export const REWORK_BY_ID = new Map(REWORK_CARDS.map((c) => [c.id, c]));

/** 从池中抽 n 张不重复(商店用) */
export function drawItems<T extends { id: string }>(pool: T[], n: number): T[] {
	const p = [...pool];
	const out: T[] = [];
	while (out.length < n && p.length > 0) {
		out.push(p.splice(Math.floor(Math.random() * p.length), 1)[0]);
	}
	return out;
}
