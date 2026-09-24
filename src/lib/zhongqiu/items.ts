// 道具系统: 加成卡(掷骰前挂到 Tee 上,持续数关)
//
//   +chips 的等效倍率 = (82.7 + N) / 82.7   → +30≈×1.36  +60≈×1.73  +120≈×2.45  +200≈×3.42
//   ×mult 与等级分无关                        → ×1.5 / ×2 / ×2.5 / ×3

import type { Cond, DiceMods, Rarity } from './teecards';

export interface BuffEffect {
	type:
		| 'chips'
		| 'mult'
		// 基础分**整块** ×value(等级底分 + 卡牌筹码 + 其他加成卡筹码都跟着走),
		// 乘算链在它后面 —— 所以是「基础分翻倍」而不是「得分翻倍」
		| 'base_mult'
		| 'chips_mult'
		// 保底等级:卡池里没有任何一张在用(那批「再接再厉时 ×N」走的是 cond),留着是给 tools 的估值表
		| 'level_floor'
		| 'roll'
		| 'set_point'
		| 'set_any'
		| 'dice_mods'
		| 'clear_void'
		| 'reverse'
		| 'cond'
		| 'own_face'
		| 'bump_point'
		| 'bundle'
		| 'sum_chips'
		// 连号长度倍率(合璧符):连号 n 颗 → ×per^(n-from)
		| 'straight_mult'
		// 坠星(桂花符):重掷的每颗骰子有 value 的概率坠为 face 点
		| 'fall_to'
		// 孤星赌(朔月符):face 点 from 颗起每多 1 颗 ×per;不足 from−1 颗 ×value(下注的代价)
		| 'streak_mult'
		// 月相符:可选任意数量的**作废骰子**改为 point 点(改点即活 = 救援)
		| 'void_fix'
		// 片影卡:点一颗骰子,只取消**这一颗**的作废(不改面)。
		// 三张抗作废的分工:月食卡整关全解除 / 半影卡按**面**(点了的骰子那个点数都不作废)/
		// 片影卡按**颗**(只有点了的那一颗);月相符是按颗救 + 改成 N 点。
		// 不走 clear_void 的 pick 分支:那个是「读点数 → 按面救」,塞一起会互相带偏。
		| 'void_one';
	value?: number;
	chips?: number;
	mult?: number;
	/** level_floor: 最低按该等级结算 */
	levelId?: string;
	/** straight_mult: 超过几颗才开始叠乘;set_point/set_any: 只能挑这个点数的骰子(4 = 只认 4 点) */
	from?: number;
	/** sum_chips: 点数和 ×per;straight_mult: 连号每多 1 颗 ×per */
	per?: number;
	/** reverse: 基础分替换(基础分 = base − 掷骰分) */
	base?: number;
	/** cond: 条件(与卡牌同一套 Cond) */
	cond?: Cond;
	/** own_face: 统计的骰面 */
	face?: number;
	/** bundle: 复合效果 */
	parts?: BuffEffect[];
	/** roll: 额外投掷次数 */
	count?: number;
	point?: number;
	/** set_any: 改成的点数只能从这里选(不填 = 1~6 任选,由玩家挑) */
	options?: number[];
	/** clear_void: 由玩家点一颗作废的骰子取消该点数作废(半影卡,读点的那颗骰子);
	 *  不填 = 整关作废全解除(月食卡) */
	pick?: boolean;
	mods?: DiceMods;
}

/** 加成卡(道具) */
export interface BuffCard {
	id: string;
	name: string;
	/** 效果描述(同时用于 tooltip) */
	desc: string;
	rarity: Rarity;
	/** 卡面 Tee 皮肤 */
	skin: string;
	price: number;
	turns: number;
	refund?: boolean;
	effect: BuffEffect;
}

/** 挂在 Tee 身上的激活加成 */
export interface AppliedBuff {
	cardId: string;
	turnsLeft: number;
}

export const BUFF_CARDS: BuffCard[] = [
	// ======== 加算(+chips) 8 ========
	{
		id: 'yuefu',
		name: '玉兔护符',
		desc: '基础分 +30',
		rarity: 'common',
		skin: 'Cute_Blue_Bunny',
		price: 2,
		turns: 1,
		effect: { type: 'chips', value: 30 }
	},
	{
		id: 'lizi',
		name: '栗子',
		desc: '基础分 +50',
		rarity: 'common',
		skin: 'Acorn',
		price: 3,
		turns: 2,
		effect: { type: 'chips', value: 50 }
	},
	{
		id: 'ciba',
		name: '糍粑',
		desc: '基础分 +25',
		rarity: 'common',
		skin: '00_sweetfox',
		price: 3,
		turns: 3,
		effect: { type: 'chips', value: 25 }
	},
	{
		id: 'xingguangzhu',
		name: '星光烛',
		desc: '基础分 +70',
		rarity: 'rare',
		skin: 'Yellow ray',
		price: 4,
		turns: 2,
		effect: { type: 'chips', value: 70 }
	},
	{
		id: 'songren',
		name: '松仁',
		desc: '基础分 +70',
		rarity: 'rare',
		skin: 'MelonFox',
		price: 6,
		turns: 3,
		effect: { type: 'chips', value: 70 }
	},
	{
		id: 'guihuatangjiang',
		name: '桂花糖浆',
		desc: '基础分翻倍',
		rarity: 'rare',
		skin: 'cupcakesprinkle',
		price: 6,
		turns: 1,
		effect: { type: 'base_mult', value: 2 }
	},
	{
		id: 'lianrongshuang',
		name: '双黄莲蓉',
		desc: '基础分 +140',
		rarity: 'legendary',
		skin: 'Sunflower',
		price: 7,
		turns: 2,
		effect: { type: 'chips', value: 140 }
	},
	{
		id: 'baiyuetuan',
		name: '百月团',
		desc: '基础分 +180',
		rarity: 'legendary',
		skin: 'Bubble_gum',
		price: 8,
		turns: 1,
		effect: { type: 'chips', value: 180 }
	},

	// ======== 乘算(×mult) 12 ========
	{
		id: 'guihuami',
		name: '桂花蜜',
		desc: '得分 ×1.3',
		rarity: 'common',
		skin: 'cat with flowers',
		price: 2,
		turns: 1,
		effect: { type: 'mult', value: 1.3 }
	},
	{
		id: 'dangui',
		name: '红桂',
		desc: '得分 ×1.5',
		rarity: 'common',
		skin: 'Redboppenom',
		price: 3,
		turns: 1,
		effect: { type: 'mult', value: 1.5 }
	},
	{
		id: 'yingui',
		name: '银桂',
		desc: '得分 ×1.4',
		rarity: 'common',
		skin: 'default_flower',
		price: 3,
		turns: 2,
		effect: { type: 'mult', value: 1.4 }
	},
	{
		id: 'yulu',
		name: '玉露',
		desc: '得分 ×1.7',
		rarity: 'rare',
		skin: 'dropletmir',
		price: 4,
		turns: 2,
		effect: { type: 'mult', value: 1.7 }
	},
	{
		id: 'yuehua',
		name: '月华',
		desc: '得分 ×2',
		rarity: 'rare',
		skin: 'CrystalCat',
		price: 5,
		turns: 2,
		effect: { type: 'mult', value: 2 }
	},
	{
		id: 'changuang',
		name: '蟾光',
		desc: '得分 ×1.8',
		rarity: 'rare',
		skin: 'glow_hammie2',
		price: 6,
		turns: 3,
		effect: { type: 'mult', value: 1.8 }
	},
	{
		id: 'guipo',
		name: '桂魄',
		desc: '得分 ×2.2',
		rarity: 'rare',
		skin: 'AmethystCat',
		price: 6,
		turns: 2,
		effect: { type: 'mult', value: 2.2 }
	},
	{
		id: 'qinghui',
		name: '清辉',
		desc: '得分 ×4',
		rarity: 'legendary',
		skin: 'AmethystCrystalCat',
		price: 7,
		turns: 1,
		effect: { type: 'mult', value: 4 }
	},
	{
		id: 'jinguiguan',
		name: '金桂冠',
		desc: '得分 ×5',
		rarity: 'legendary',
		skin: 'Golden Shroom',
		price: 8,
		turns: 1,
		effect: { type: 'mult', value: 5 }
	},
	{
		id: 'yueshen',
		name: '月神面纱',
		desc: '得分 ×4',
		rarity: 'legendary',
		skin: 'pinkcrystal',
		price: 8,
		turns: 2,
		effect: { type: 'mult', value: 4 }
	},
	{
		id: 'yusheng',
		name: '玉绳',
		desc: '得分 ×4',
		rarity: 'legendary',
		skin: 'twindrop',
		price: 10,
		turns: 3,
		effect: { type: 'mult', value: 4 }
	},
	{
		id: 'jiuzhuan',
		name: '九转金丹',
		desc: '得分 ×5',
		rarity: 'legendary',
		skin: 'angel_toast_kiinmn',
		price: 9,
		turns: 2,
		effect: { type: 'mult', value: 5 }
	},

	// ======== 加算+乘算 4 ========
	{
		id: 'liuli',
		name: '琉璃酥',
		desc: '基础分 +40，得分 ×1.4',
		rarity: 'rare',
		skin: 'Rainbow Jawbreaker',
		price: 5,
		turns: 2,
		effect: { type: 'chips_mult', chips: 40, mult: 1.4 }
	},
	{
		id: 'yuzhi',
		name: '玉脂',
		desc: '基础分 +45，得分 ×1.5',
		rarity: 'rare',
		skin: 'emerald',
		price: 6,
		turns: 2,
		effect: { type: 'chips_mult', chips: 45, mult: 1.5 }
	},
	{
		id: 'jingui',
		name: '金桂流心',
		desc: '基础分 +60，得分 ×3',
		rarity: 'legendary',
		skin: 'OnyxNanami_Yellow',
		price: 8,
		turns: 2,
		effect: { type: 'chips_mult', chips: 60, mult: 3 }
	},
	{
		id: 'yuehun',
		name: '月魂',
		desc: '基础分 +60，得分 ×3',
		rarity: 'legendary',
		skin: 'ghost_whis',
		price: 7,
		turns: 1,
		effect: { type: 'chips_mult', chips: 60, mult: 3 }
	},

	// ======== 和值流(只此一张,故意稀有) ========
	{
		id: 'chaoxin',
		name: '潮信符',
		desc: '骰子点数和 ×3 计入基础分',
		rarity: 'rare',
		skin: 'AquaFox',
		price: 6,
		turns: 1,
		effect: { type: 'sum_chips', per: 3 }
	},

	// ======== 再接再厉(掷空)时的得分倍率 4 ========
	{
		id: 'manyuezhufu',
		name: '满月祝福',
		desc: '投掷出再接再厉时：得分 ×1.8',
		rarity: 'common',
		skin: 'twinbop_glow',
		price: 3,
		turns: 2,
		effect: { type: 'cond', cond: 'none', mult: 1.8 }
	},
	{
		id: 'guiyin',
		name: '桂荫庇佑',
		desc: '投掷出再接再厉时：得分 ×3.5',
		rarity: 'rare',
		skin: 'Lahm_blue',
		price: 5,
		turns: 2,
		effect: { type: 'cond', cond: 'none', mult: 3.5 }
	},
	{
		id: 'yueshenbiyou',
		name: '月神庇佑',
		desc: '投掷出再接再厉时：得分 ×4',
		rarity: 'legendary',
		skin: 'IceWitch_MushDeer',
		price: 8,
		turns: 1,
		effect: { type: 'cond', cond: 'none', mult: 4 }
	},
	{
		id: 'changongbiyou',
		name: '蟾宫庇佑',
		desc: '投掷出再接再厉时：得分 ×4',
		rarity: 'legendary',
		skin: 'Cat_the_Lucky',
		price: 9,
		turns: 3,
		effect: { type: 'cond', cond: 'none', mult: 4 }
	},

	// ======== 多投掷(×2.33,压高稀有度) 5 ========
	{
		id: 'tueye',
		name: '余兴',
		desc: '可多投掷 1 次',
		rarity: 'common',
		skin: 'lan_fawai',
		price: 5,
		turns: 1,
		effect: { type: 'roll', count: 1 }
	},
	{
		id: 'yujin',
		name: '余烬',
		desc: '可多投掷 1 次；没用掉就归还',
		rarity: 'rare',
		skin: 'IceWitch_Xmas',
		price: 6,
		turns: 1,
		refund: true,
		effect: { type: 'roll', count: 1 }
	},
	{
		id: 'yuetuchu',
		name: '玉兔杵',
		desc: '可多投掷 1 次',
		rarity: 'rare',
		skin: 'pixel_rabbit',
		price: 8,
		turns: 2,
		effect: { type: 'roll', count: 1 }
	},
	{
		id: 'guanghanniange',
		name: '广寒仙酿',
		desc: '可多投掷 1 次',
		rarity: 'legendary',
		skin: 'IceWitch_QueenCat',
		price: 14,
		turns: 3,
		effect: { type: 'roll', count: 1 }
	},
	{
		id: 'yuegui',
		name: '蟾宫神枝',
		desc: '可多投掷 2 次',
		rarity: 'legendary',
		skin: 'ghost_nanami',
		price: 12,
		turns: 1,
		effect: { type: 'roll', count: 2 }
	},

	// ======== 改点(×2.90 / ×4.48,强) 9 ========
	{
		id: 'yuetuchu2',
		name: '银针',
		desc: '改 1 颗骰子为 4 点',
		rarity: 'rare',
		skin: 'Silver',
		price: 4,
		turns: 1,
		effect: { type: 'set_point', count: 1, point: 4 }
	},
	{
		id: 'jinsuo',
		name: '金锁',
		desc: '改 1 颗骰子为 6 点',
		rarity: 'common',
		skin: 'Locked',
		price: 3,
		turns: 1,
		effect: { type: 'set_point', count: 1, point: 6 }
	},

	{
		id: 'yusuo',
		name: '玉锁',
		desc: '改 1 颗骰子为 6 点；没用掉就归还',
		rarity: 'rare',
		skin: 'EmeraldCat',
		price: 4,
		turns: 1,
		refund: true,
		effect: { type: 'set_point', count: 1, point: 6 }
	},
	// ---- 连号流补给(配合连珠灯 / 七星灯) ----
	{
		id: 'hebi',
		name: '合璧符',
		desc: '连号 4 颗及以上：连号每多 1 颗，得分 ×1.85',
		rarity: 'rare',
		skin: 'skeyster',
		price: 7,
		turns: 2,
		effect: { type: 'straight_mult', per: 1.85, from: 3 }
	},
	{
		id: 'yueyachi',
		name: '月牙尺',
		desc: '改 1 颗骰子点数 +1',
		rarity: 'common',
		skin: 'cool_glowfox',
		price: 3,
		turns: 2,
		effect: { type: 'bump_point', count: 1 }
	},
	{
		// 月牙尺的反向。补连号的缺口有两种姿势:捏着缺口下邻就 +1,捏着上邻就 −1
		// (持 2 3 4 6 缺 5 → 要 6→5)。池子里原来只有「+1」这半边,另一半只能买传说的改任意点数
		id: 'queyuechi',
		name: '缺月尺',
		desc: '改 1 颗骰子点数 −1',
		rarity: 'common',
		skin: 'darklightevilwolfe',
		price: 3,
		turns: 2,
		effect: { type: 'bump_point', count: 1, value: -1 }
	},
	{
		id: 'yuefu2',
		name: '月斧',
		desc: '改 1 颗骰子为 4 点；没用掉就归还',
		rarity: 'legendary',
		skin: 'Roaning Knight',
		price: 8,
		turns: 1,
		refund: true,
		effect: { type: 'set_point', count: 1, point: 4 }
	},
	{
		id: 'yuxi',
		name: '玉玺',
		desc: '改 1 颗骰子为任意点数',
		rarity: 'legendary',
		skin: 'Lan_shidun',
		price: 10,
		turns: 1,
		effect: { type: 'set_any', count: 1 }
	},
	{
		id: 'jiangxin',
		name: '匠心神笔',
		desc: '改 1 颗骰子为任意点数',
		rarity: 'legendary',
		skin: 'FantasieCat',
		price: 14,
		turns: 2,
		effect: { type: 'set_any', count: 1 }
	},

	// ======== 拆 4(只能挑 4 点,手上没 4 就白拿 → 会归还) 4 ========
	// 4 点是这套规则的硬通货(四点红/对堂/六博红/四点单点线),所以「把 4 拆掉」是
	// 一个独立的工具位:破自己的 4 换等级、救被作废的 4(空四/蚀月)、或凑对堂的 1 和 6。
	{
		id: 'shuangjipan',
		name: '双极盘',
		desc: '改 1 颗 4 点骰子为 1 或 6 点；没用掉就归还',
		rarity: 'common',
		skin: 'IceWitch_Winter',
		price: 4,
		turns: 1,
		refund: true,
		effect: { type: 'set_any', count: 1, from: 4, options: [1, 6] }
	},
	{
		id: 'zhongduanpan',
		name: '中段盘',
		desc: '改 1 颗 4 点骰子为 2 或 5 点；没用掉就归还',
		rarity: 'common',
		skin: 'IceWitch_WinterCat',
		price: 4,
		turns: 1,
		refund: true,
		effect: { type: 'set_any', count: 1, from: 4, options: [2, 5] }
	},
	{
		// 拆 4 家族的「批量」版:单颗定向盘被普池的通用定值盘(凸月盘)全面盖住,
		// 改成一次拆两颗 —— 两张各有取舍,不再是谁的下位替代
		id: 'dingwupan',
		name: '定五盘',
		desc: '改 2 颗 4 点骰子为 5 点；没用掉就归还',
		rarity: 'rare',
		skin: 'IceWitch_WitchDeer',
		price: 5,
		turns: 1,
		refund: true,
		effect: { type: 'set_point', count: 2, point: 5, from: 4 }
	},
	{
		id: 'wanxiangpan',
		name: '万象盘',
		desc: '改 1 颗 4 点骰子为任意点数；没用掉就归还',
		rarity: 'legendary',
		skin: 'IceWitch_FairyCat',
		price: 8,
		turns: 1,
		refund: true,
		effect: { type: 'set_any', count: 1, from: 4 }
	},

	// ======== 逆向流:把「掷得越烂越赚」做成加成卡 ========
	{
		id: 'niyuefu',
		name: '逆月符',
		desc: '该 Tee 基础分替换为（160 − 基础分）',
		rarity: 'rare',
		skin: 'Dark Default',
		price: 7,
		turns: 2,
		// 引擎的 reverse = base − 本回合净值(等级分 + 全部筹码,乘算之前),没有别的参数 ——
		// 所以卡面的「− 基础分」是逐字成立的
		effect: { type: 'reverse', base: 160 }
	},

	// ======== 抗 Boss:解除点数作废 ========
	{
		id: 'yueshika',
		name: '月食卡',
		desc: '身上 Tee 不受点数作废影响',
		rarity: 'rare',
		skin: 'darklightnami',
		price: 6,
		turns: 1,
		effect: { type: 'clear_void' }
	},
	{
		id: 'banyingka',
		name: '半影卡',
		desc: '选择一个骰子，取消所有该骰子点数的作废',
		rarity: 'common',
		skin: 'IceWitch_Witch',
		price: 5,
		turns: 1,
		effect: { type: 'clear_void', pick: true }
	},
	{
		id: 'pianyingka',
		name: '片影卡',
		desc: '选择一个骰子，取消这颗骰子的作废',
		rarity: 'common',
		skin: 'Shadow',
		price: 3,
		turns: 1,
		effect: { type: 'void_one' }
	},

	// 玩法:带上去之后重掷/改点的目标会变(追高的那个点数、躲低的那个),
	{
		id: 'shibei',
		name: '拾贝',
		desc: '自己每有 1 颗 5 点：基础分 +90；每有 1 颗 6 点：基础分 −90',
		rarity: 'common',
		skin: 'Seal',
		price: 3,
		turns: 2,
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'own_face', face: 5, chips: 90 },
				{ type: 'own_face', face: 6, chips: -90 }
			]
		}
	},
	{
		id: 'duzhuo',
		name: '独酌',
		desc: '自己每有 1 颗 6 点：基础分 +95；每有 1 颗 3 点：基础分 −95',
		rarity: 'common',
		skin: 'coffee_cup',
		price: 3,
		turns: 2,
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'own_face', face: 6, chips: 95 },
				{ type: 'own_face', face: 3, chips: -95 }
			]
		}
	},
	{
		id: 'shouzhuo',
		name: '守拙',
		desc: '自己每有 1 颗 4 点：基础分 +85；每有 1 颗 2 点：基础分 −85',
		rarity: 'common',
		skin: 'Graylynx',
		price: 3,
		turns: 2,
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'own_face', face: 4, chips: 85 },
				{ type: 'own_face', face: 2, chips: -85 }
			]
		}
	},
	{
		id: 'guxing',
		name: '孤星',
		desc: '自己每有 1 颗 1 点：基础分 +110；每有 1 颗 5 点：基础分 −110',
		rarity: 'common',
		skin: 'Blue ray',
		price: 3,
		turns: 2,
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'own_face', face: 1, chips: 110 },
				{ type: 'own_face', face: 5, chips: -110 }
			]
		}
	},
	{
		id: 'yishan',
		name: '移山',
		desc: '自己每有 1 颗 6 点：基础分 +130；每有 1 颗 2 点：基础分 −130',
		rarity: 'rare',
		skin: 'Beast_Winter',
		price: 6,
		turns: 2,
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'own_face', face: 6, chips: 130 },
				{ type: 'own_face', face: 2, chips: -130 }
			]
		}
	},
	{
		id: 'fantianyin',
		name: '翻天印',
		desc: '自己每有 1 颗 4 点：基础分 +200；每有 1 颗 3 点：基础分 −200',
		rarity: 'legendary',
		skin: 'dragon',
		price: 9,
		turns: 2,
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'own_face', face: 4, chips: 200 },
				{ type: 'own_face', face: 3, chips: -200 }
			]
		}
	},

	{
		id: 'yuehuabi',
		name: '月华笔',
		desc: '改 1 颗骰子为任意点数；没用掉就归还',
		rarity: 'legendary',
		skin: 'nanami_glow',
		price: 14,
		turns: 1,
		refund: true,
		effect: { type: 'set_any', count: 1 }
	},
	{
		id: 'suyuepan',
		name: '素月盘',
		desc: '改 1 颗骰子为 2 点；没用掉就归还',
		rarity: 'common',
		skin: 'IceWitch_Beach',
		price: 4,
		turns: 1,
		refund: true,
		effect: { type: 'set_point', count: 1, point: 2 }
	},
	{
		// 定值家族的中间两块拼图:普通档原来只定 2(素月盘) 和 6(金锁),
		// 而连号阶梯的中间段(3/4/5)全靠它 —— 4 是牌面最贵的,继续留在稀有
		id: 'xianyuepan',
		name: '弦月盘',
		desc: '改 1 颗骰子为 3 点；没用掉就归还',
		rarity: 'common',
		skin: 'lan_piza',
		price: 4,
		turns: 1,
		refund: true,
		effect: { type: 'set_point', count: 1, point: 3 }
	},
	{
		id: 'tuyuepan',
		name: '凸月盘',
		desc: '改 1 颗骰子为 5 点；没用掉就归还',
		rarity: 'common',
		skin: 'spacelight',
		price: 4,
		turns: 1,
		refund: true,
		effect: { type: 'set_point', count: 1, point: 5 }
	},

	// ======== 点数变换 5 ========
	{
		id: 'wangyuefu',
		name: '望月符',
		desc: '自己的 4 点视为 6 点',
		rarity: 'rare',
		skin: 'IceWitch_Deer',
		price: 5,
		turns: 2,
		effect: { type: 'dice_mods', mods: { map: { 4: 6 } } }
	},
	{
		id: 'shuoyuefu',
		name: '朔月符',
		desc: '5 点 3 颗起，每多 1 颗：得分 ×1.8；不足 2 颗：得分 ×0.7',
		rarity: 'legendary',
		skin: 'IceWitch_Reindeer',
		price: 8,
		turns: 2,
		effect: { type: 'streak_mult', face: 5, from: 3, per: 1.8, value: 0.7 }
	},
	{
		id: 'guihuafu',
		name: '桂花符',
		desc: '重掷的骰子有 50% 概率掷出 2 点',
		rarity: 'legendary',
		skin: 'Lahm_yellow',
		price: 8,
		turns: 2,
		effect: { type: 'fall_to', face: 2, value: 0.5 }
	},
	{
		id: 'yuexiangfu',
		name: '月相符',
		desc: '可选任意数量的作废骰子改为 1 点',
		rarity: 'rare',
		skin: 'IceWitch_MushCat',
		price: 5,
		turns: 2,
		effect: { type: 'void_fix', point: 1 }
	},
	{
		id: 'chanjuanfu',
		name: '婵娟符',
		desc: '自己的 4 点视为 1 点',
		rarity: 'rare',
		skin: 'IceWitch_FairyDeer',
		price: 5,
		turns: 2,
		effect: { type: 'dice_mods', mods: { map: { 4: 1 } } }
	}
];

export const BUFF_BY_ID = new Map(BUFF_CARDS.map((c) => [c.id, c]));

/** 中秋集市 6 格的稀有度权重:前 5 格是普通栏(60/35/5),最后 1 格是稀有栏(0/90/10)
 *
 *  原来前 5 格写死普通、后 1 格写死稀有/传说(3:1),于是 83% 的槽位都是普通,
 *  一局一半以上的普通槽位是重复;而 42 张稀有/传说挤在一个槽位里,一局只见 5~9 张。
 *  现在每格独立掷:普通栏也有 35% 出稀有、5% 出传说,稀有栏保底不出普通。
 */
export const SHOP_SLOT_WEIGHTS: Record<Rarity, number>[] = [
	{ common: 60, rare: 35, legendary: 5 },
	{ common: 60, rare: 35, legendary: 5 },
	{ common: 60, rare: 35, legendary: 5 },
	{ common: 60, rare: 35, legendary: 5 },
	{ common: 60, rare: 35, legendary: 5 },
	{ common: 0, rare: 90, legendary: 10 }
];

/** 按权重掷一档稀有度;某一档没货了(抽走了 / 被锁位占着)就从还有货的档里重新归一化 */
const rollRarity = (weights: Record<Rarity, number>, pool: BuffCard[]): Rarity | null => {
	const avail = (['common', 'rare', 'legendary'] as Rarity[]).filter(
		(r) => weights[r] > 0 && pool.some((c) => c.rarity === r)
	);
	if (!avail.length) return null;
	const total = avail.reduce((a, r) => a + weights[r], 0);
	let x = Math.random() * total;
	for (const r of avail) {
		x -= weights[r];
		if (x <= 0) return r;
	}
	return avail[avail.length - 1];
};

/** 抽 6 格中秋集市。锁定的格子保留原位(也占住池子),同一家店不出现重复卡 */
export const drawShopItems = (locks: (string | null)[] = []): BuffCard[] => {
	// taken = 锁定的商品,既保留在原位,也从池子里排除,免得同一张占两格
	const taken = new Set(locks.filter((id): id is string => !!id));
	const out: BuffCard[] = [];
	for (let i = 0; i < SHOP_SLOT_WEIGHTS.length; i++) {
		const locked = locks[i] ? BUFF_BY_ID.get(locks[i]!) : null;
		if (locked) {
			out.push(locked);
			continue;
		}
		const pool = BUFF_CARDS.filter((c) => !taken.has(c.id));
		const rarity = rollRarity(SHOP_SLOT_WEIGHTS[i], pool);
		const pick = rarity
			? drawItems(
					pool.filter((c) => c.rarity === rarity),
					1
				)[0]
			: undefined;
		if (!pick) break;
		taken.add(pick.id);
		out.push(pick);
	}
	return out;
};

export function drawItems<T extends { id: string }>(pool: T[], n: number): T[] {
	const p = [...pool];
	const out: T[] = [];
	while (out.length < n && p.length > 0) {
		out.push(p.splice(Math.floor(Math.random() * p.length), 1)[0]);
	}
	return out;
}
