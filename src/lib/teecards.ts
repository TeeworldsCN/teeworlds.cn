// Tee 卡系统(类 Balatro 的 Joker 构筑)
// 每个 Tee 卡 = 一个入队角色,带固定皮肤和特殊能力

export type Rarity = 'common' | 'rare' | 'legendary';

export const RARITY_INFO: Record<
	Rarity,
	{ label: string; color: string; price: number; sell: number }
> = {
	common: { label: '普通', color: '#94a3b8', price: 3, sell: 1 },
	rare: { label: '稀有', color: '#38bdf8', price: 5, sell: 2 },
	legendary: { label: '传说', color: '#fbbf24', price: 8, sell: 4 }
};

/** 卡牌效果 */
export type TeeEffect =
	| { type: 'reroll'; count: number } // 掷完后可重掷 count 颗骰子
	| { type: 'set_point'; count: number; point: number } // 掷完后把 count 颗骰子改为 point
	| { type: 'set_any'; count: number } // 掷完后把 count 颗骰子改为任意点数(玩家选择)
	| { type: 'chips'; value: number } // 个人得分 +chips
	| { type: 'mult'; value: number } // 个人得分 ×mult
	| {
			type: 'cond';
			cond:
				'none' | 'yi_xiu' | 'er_ju' | 'si_jin' | 'dui_tang' | 'san_hong_plus' | 'zhuang_yuan_plus';
			chips?: number;
			mult?: number;
	  } // 条件触发
	| { type: 'reroll_all_on_none' } // 掷出"再接再厉"时重掷全部骰子(每回合限一次)
	| { type: 'team_mult'; value: number } // 全队总分 ×mult
	| { type: 'team_chips'; value: number } // 全队每个 Tee 个人得分 +chips
	| { type: 'scaling_mult'; per: number } // 每关结束该 Tee 的 mult 永久 +per(从 1 开始)
	| { type: 'economy'; per: number }; // 每关结算 +月饼币

export interface TeeCard {
	id: string;
	name: string;
	desc: string;
	rarity: Rarity;
	skin: string; // DDNet 皮肤名
	effect: TeeEffect;
}

export type Cond =
	'none' | 'yi_xiu' | 'er_ju' | 'si_jin' | 'dui_tang' | 'san_hong_plus' | 'zhuang_yuan_plus';

// 条件是否命中
const ORDER = [
	'yi_xiu',
	'er_ju',
	'si_jin',
	'san_hong',
	'dui_tang',
	'zhuang_yuan',
	'wu_zi',
	'wu_wang',
	'liu_bo_hei',
	'liu_bo_hong',
	'zhuang_yuan_chajinhua'
];

export const condHit = (cond: Cond, levelId: string): boolean => {
	switch (cond) {
		case 'none':
			return levelId === 'none';
		case 'yi_xiu':
			return levelId === 'yi_xiu';
		case 'er_ju':
			return levelId === 'er_ju';
		case 'si_jin':
			return levelId === 'si_jin';
		case 'dui_tang':
			return levelId === 'dui_tang';
		case 'san_hong_plus':
			return ORDER.indexOf(levelId) >= ORDER.indexOf('san_hong');
		case 'zhuang_yuan_plus':
			return ORDER.indexOf(levelId) >= ORDER.indexOf('zhuang_yuan');
	}
	return false;
};

export const CARDS: TeeCard[] = [
	// ---- 普通(12) ----
	{
		id: 'yutu',
		name: '玉兔',
		desc: '掷完后可重掷 1 颗骰子',
		rarity: 'common',
		skin: 'tuzi',
		effect: { type: 'reroll', count: 1 }
	},
	{
		id: 'guihuagao',
		name: '桂花糕',
		desc: '个人得分 +40',
		rarity: 'common',
		skin: 'cupcake',
		effect: { type: 'chips', value: 40 }
	},
	{
		id: 'tanghulu',
		name: '糖葫芦',
		desc: '个人得分 +30',
		rarity: 'common',
		skin: 'redbopp',
		effect: { type: 'chips', value: 30 }
	},
	{
		id: 'xiaoyuebing',
		name: '小月饼',
		desc: '个人得分 +20,×1.25',
		rarity: 'common',
		skin: 'pumpkin',
		effect: { type: 'chips', value: 20 }
	},
	{
		id: 'xiaoyuebing_mult',
		name: '芝麻团',
		desc: '个人得分 ×1.5',
		rarity: 'common',
		skin: 'blacktee',
		effect: { type: 'mult', value: 1.5 }
	},
	{
		id: 'guazi',
		name: '金瓜子',
		desc: '每关结算 +1 月饼币',
		rarity: 'common',
		skin: 'GoldCat',
		effect: { type: 'economy', per: 1 }
	},
	{
		id: 'yutou',
		name: '芋头',
		desc: '掷出"再接再厉"时 +80',
		rarity: 'common',
		skin: 'alien',
		effect: { type: 'cond', cond: 'none', chips: 80 }
	},
	{
		id: 'chahu',
		name: '茶壶',
		desc: '掷出"一秀"时 ×2',
		rarity: 'common',
		skin: 'ghost',
		effect: { type: 'cond', cond: 'yi_xiu', mult: 2 }
	},
	{
		id: 'tuerdeng',
		name: '兔儿灯',
		desc: '掷出"二举"时 ×2',
		rarity: 'common',
		skin: 'bunny',
		effect: { type: 'cond', cond: 'er_ju', mult: 2 }
	},
	{
		id: 'mizao',
		name: '蜜枣',
		desc: '掷出"四进"时 +60',
		rarity: 'common',
		skin: 'snowflake',
		effect: { type: 'cond', cond: 'si_jin', chips: 60 }
	},
	{
		id: 'huasheng',
		name: '花生',
		desc: '掷出"对堂"时 +100',
		rarity: 'common',
		skin: 'iceberg',
		effect: { type: 'cond', cond: 'dui_tang', chips: 100 }
	},
	{
		id: 'denglong',
		name: '红灯笼',
		desc: '掷出"三红"及以上时 ×2',
		rarity: 'common',
		skin: 'santa',
		effect: { type: 'cond', cond: 'san_hong_plus', mult: 2 }
	},

	// ---- 稀有(8) ----
	{
		id: 'change',
		name: '嫦娥',
		desc: '掷完后把 1 颗骰子改为 4 点',
		rarity: 'rare',
		skin: 'Sailormoon',
		effect: { type: 'set_point', count: 1, point: 4 }
	},
	{
		id: 'yuebingwang',
		name: '月饼王',
		desc: '个人得分 ×2',
		rarity: 'rare',
		skin: 'golden shroom',
		effect: { type: 'mult', value: 2 }
	},
	{
		id: 'guihuajiu',
		name: '桂花酒',
		desc: '个人得分 +80,×1.5',
		rarity: 'rare',
		skin: 'TeeDevil',
		effect: { type: 'chips', value: 80 }
	},
	{
		id: 'xiaoshangfan',
		name: '小商贩',
		desc: '每关结算 +3 月饼币',
		rarity: 'rare',
		skin: 'Cowboy',
		effect: { type: 'economy', per: 3 }
	},
	{
		id: 'guanghangong',
		name: '广寒宫',
		desc: '每过一关,个人得分 ×永久 +1(成长)',
		rarity: 'rare',
		skin: 'IceWitch',
		effect: { type: 'scaling_mult', per: 1 }
	},
	{
		id: 'houyi',
		name: '后羿',
		desc: '掷出"再接再厉"时重掷全部骰子(限 1 次)',
		rarity: 'rare',
		skin: 'Samurai',
		effect: { type: 'reroll_all_on_none' }
	},
	{
		id: 'yupan',
		name: '玉盘',
		desc: '全队总分 ×1.2',
		rarity: 'rare',
		skin: 'White_tee',
		effect: { type: 'team_mult', value: 1.2 }
	},
	{
		id: 'quanjiafu',
		name: '全家福',
		desc: '全队每个 Tee 个人得分 +15',
		rarity: 'rare',
		skin: 'Panda',
		effect: { type: 'team_chips', value: 15 }
	},

	// ---- 传说(4) ----
	{
		id: 'wugang',
		name: '吴刚',
		desc: '掷完后把 1 颗骰子改为任意点数',
		rarity: 'legendary',
		skin: 'viking',
		effect: { type: 'set_any', count: 1 }
	},
	{
		id: 'jinyuebing',
		name: '金月饼',
		desc: '个人得分 ×3',
		rarity: 'legendary',
		skin: 'iron_pot_o_gold',
		effect: { type: 'mult', value: 3 }
	},
	{
		id: 'guihuashu',
		name: '桂花神树',
		desc: '全队总分 ×1.5',
		rarity: 'legendary',
		skin: 'greensward',
		effect: { type: 'team_mult', value: 1.5 }
	},
	{
		id: 'yuegongxianzi',
		name: '月宫仙子',
		desc: '掷出"状元"及以上时 ×3',
		rarity: 'legendary',
		skin: 'TeeAngel',
		effect: { type: 'cond', cond: 'zhuang_yuan_plus', mult: 3 }
	}
];

// 月宫仙子的条件其实是"状元及以上",但复用 san_hong_plus 会变成三红。用单独判定:
// 修正:传说卡的 cond 用 'zhuang_yuan_plus'?—— 为避免改动类型,单独处理:
export const CARD_BY_ID = new Map(CARDS.map((c) => [c.id, c]));

/** 按稀有度加权抽卡,返回不重复的 n 张 */
export function drawCards(n: number, excludeIds: Set<string> = new Set()): TeeCard[] {
	const pool = CARDS.filter((c) => !excludeIds.has(c.id));
	const weight: Record<Rarity, number> = { common: 7, rare: 3, legendary: 1 };
	const picked: TeeCard[] = [];
	while (picked.length < n && pool.length > 0) {
		const total = pool.reduce((s, c) => s + weight[c.rarity], 0);
		let r = Math.random() * total;
		let idx = 0;
		for (let i = 0; i < pool.length; i++) {
			r -= weight[pool[i].rarity];
			if (r <= 0) {
				idx = i;
				break;
			}
		}
		picked.push(pool[idx]);
		pool.splice(idx, 1);
	}
	return picked;
}
