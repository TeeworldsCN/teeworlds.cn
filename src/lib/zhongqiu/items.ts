// 道具系统: 加成卡(掷骰前挂到 Tee 上,持续数关)
//
// 定价依据 scripts/balance.ts(2 次投掷基线,平均等级分 82.7):
//   +chips 的等效倍率 = (82.7 + N) / 82.7   → +30≈×1.36  +60≈×1.73  +120≈×2.45  +200≈×3.42
//   ×mult 与等级分无关                        → ×1.5 / ×2 / ×2.5 / ×3
//   多 1 次投掷 ×2.33、改 1 颗为 4 点 ×2.90、改任意点 ×4.48(强,压传说档)

import type { Cond, DiceMods, Rarity } from './teecards';

export interface BuffEffect {
	type:
		| 'chips'
		| 'mult'
		| 'chips_mult'
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
		| 'sum_chips';
	value?: number;
	chips?: number;
	mult?: number;
	/** level_floor: 最低按该等级结算 */
	levelId?: string;
	/** sum_chips: 点数和 ×per;reverse: 减分系数(默认 1) */
	per?: number;
	/** reverse: 基础分(得分 = base − 掷骰分) */
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
	mods?: DiceMods;
}

/** 加成卡(道具) */
export interface BuffCard {
	id: string;
	name: string;
	/** 效果描述(同时用于 tooltip) */
	desc: string;
	/**
	 * ⚠️ 加成卡**没有 tag**:不参与 per_tag 计数,也不做流派归类 —— 名字里出现的
	 * 流派字只是风味道具名(最多一个,见 qa/copy.ts)。别在这里加 tag 字段。
	 */
	rarity: Rarity;
	/** 卡面 Tee 皮肤 */
	skin: string;
	price: number;
	/** 激活关卡数(1~3): 挂上后每过一关 -1,归零消失 */
	turns: number;
	/**
	 * 低压道具:本关**没用掉**就归还库存(不算消耗,回合数也不减)。
	 * 只会用在「改点」这类需要玩家主动决定的道具上 —— 会归还的定价贵一点。
	 */
	refund?: boolean;
	effect: BuffEffect;
}

/** 挂在 Tee 身上的激活加成 */
export interface AppliedBuff {
	cardId: string;
	turnsLeft: number;
}

export const BUFF_CARDS: BuffCard[] = [
	// ======== 加算(+chips) 14 ========
	{
		id: 'yuefu',
		name: '玉兔护符',
		desc: '得分 +30',
		rarity: 'common',
		skin: 'Cute_Blue_Bunny',
		price: 2,
		turns: 1,
		effect: { type: 'chips', value: 30 }
	},
	{
		id: 'wurenxian',
		name: '五仁馅',
		desc: '得分 +40',
		rarity: 'common',
		skin: 'Blueberry_Cat',
		price: 2,
		turns: 1,
		effect: { type: 'chips', value: 40 }
	},
	{
		id: 'doushaxian',
		name: '豆沙馅',
		desc: '得分 +45',
		rarity: 'common',
		skin: 'HTF_reddy',
		price: 2,
		turns: 1,
		effect: { type: 'chips', value: 45 }
	},
	{
		id: 'lianrongxian',
		name: '莲蓉馅',
		desc: '得分 +55',
		rarity: 'common',
		skin: 'mermydon_beanie',
		price: 3,
		turns: 1,
		effect: { type: 'chips', value: 55 }
	},
	{
		id: 'zaoni',
		name: '枣泥',
		desc: '得分 +35',
		rarity: 'common',
		skin: 'sweet',
		price: 3,
		turns: 2,
		effect: { type: 'chips', value: 35 }
	},
	{
		id: 'lizi',
		name: '栗子',
		desc: '得分 +50',
		rarity: 'common',
		skin: 'Acorn',
		price: 3,
		turns: 2,
		effect: { type: 'chips', value: 50 }
	},
	{
		id: 'ciba',
		name: '糍粑',
		desc: '得分 +25',
		rarity: 'common',
		skin: '00_sweetfox',
		price: 3,
		turns: 3,
		effect: { type: 'chips', value: 25 }
	},
	{
		id: 'xingguangzhu',
		name: '星光烛',
		desc: '得分 +70',
		rarity: 'rare',
		skin: 'Yellow ray',
		price: 4,
		turns: 2,
		effect: { type: 'chips', value: 70 }
	},
	{
		id: 'xianrou',
		name: '鲜肉月团',
		desc: '得分 +100',
		rarity: 'rare',
		skin: 'Red Tomato',
		price: 4,
		turns: 2,
		effect: { type: 'chips', value: 100 }
	},
	{
		id: 'yunniang',
		name: '云腿月团',
		desc: '得分 +120',
		rarity: 'rare',
		skin: 'Red Coke',
		price: 5,
		turns: 2,
		effect: { type: 'chips', value: 120 }
	},
	{
		id: 'songren',
		name: '松仁',
		desc: '得分 +90',
		rarity: 'rare',
		skin: 'MelonFox',
		price: 5,
		turns: 3,
		effect: { type: 'chips', value: 90 }
	},
	{
		id: 'guihuatangjiang',
		name: '桂花糖浆',
		desc: '得分 +130',
		rarity: 'rare',
		skin: 'cupcakesprinkle',
		price: 5,
		turns: 2,
		effect: { type: 'chips', value: 130 }
	},
	{
		id: 'lianrongshuang',
		name: '双黄莲蓉',
		desc: '得分 +150',
		rarity: 'legendary',
		skin: 'Sunflower',
		price: 7,
		turns: 2,
		effect: { type: 'chips', value: 150 }
	},
	{
		id: 'baiyuetuan',
		name: '百月团',
		desc: '得分 +180',
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
		name: '丹桂',
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
		desc: '得分 ×1.75',
		rarity: 'rare',
		skin: 'ender_pearl',
		price: 4,
		turns: 2,
		effect: { type: 'mult', value: 1.75 }
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
		price: 5,
		turns: 3,
		effect: { type: 'mult', value: 1.8 }
	},
	{
		id: 'guipo',
		name: '桂魄',
		desc: '得分 ×2.25',
		rarity: 'rare',
		skin: 'babyYoda_flower',
		price: 5,
		turns: 2,
		effect: { type: 'mult', value: 2.25 }
	},
	{
		id: 'qinghui',
		name: '清辉',
		desc: '得分 ×2.5',
		rarity: 'legendary',
		skin: 'AmethystCrystalCat',
		price: 7,
		turns: 1,
		effect: { type: 'mult', value: 2.5 }
	},
	{
		id: 'jinguiguan',
		name: '金桂冠',
		desc: '得分 ×3',
		rarity: 'legendary',
		skin: 'Golden Shroom',
		price: 8,
		turns: 1,
		effect: { type: 'mult', value: 3 }
	},
	{
		id: 'yueshen',
		name: '月神面纱',
		desc: '得分 ×2.4',
		rarity: 'legendary',
		skin: 'pinkcrystal',
		price: 8,
		turns: 2,
		effect: { type: 'mult', value: 2.4 }
	},
	{
		id: 'yusheng',
		name: '玉绳',
		desc: '得分 ×2.6',
		rarity: 'legendary',
		skin: 'HTF_whitepinky',
		price: 9,
		turns: 3,
		effect: { type: 'mult', value: 2.6 }
	},
	{
		id: 'jiuzhuan',
		name: '九转金丹',
		desc: '得分 ×3.2',
		rarity: 'legendary',
		skin: 'angel_toast_kiinmn',
		price: 9,
		turns: 1,
		effect: { type: 'mult', value: 3.2 }
	},

	// ======== 加算+乘算 4 ========
	{
		id: 'liuli',
		name: '琉璃酥',
		desc: '得分 +60，×1.4',
		rarity: 'rare',
		skin: 'Rainbow Jawbreaker',
		price: 5,
		turns: 2,
		effect: { type: 'chips_mult', chips: 60, mult: 1.4 }
	},
	{
		id: 'yuzhi',
		name: '玉脂',
		desc: '得分 +60，×1.5',
		rarity: 'rare',
		skin: 'emerald',
		price: 6,
		turns: 2,
		effect: { type: 'chips_mult', chips: 60, mult: 1.5 }
	},
	{
		id: 'jingui',
		name: '金桂流心',
		desc: '得分 +80，×1.6',
		rarity: 'legendary',
		skin: 'OnyxNanami_Yellow',
		price: 8,
		turns: 2,
		effect: { type: 'chips_mult', chips: 80, mult: 1.6 }
	},
	{
		id: 'yuehun',
		name: '月魂',
		desc: '得分 +60，×2',
		rarity: 'legendary',
		skin: 'aristocats_marie_glow',
		price: 9,
		turns: 1,
		effect: { type: 'chips_mult', chips: 60, mult: 2 }
	},

	// ======== 和值流(只此一张,故意稀有) ========
	{
		id: 'chaoxin',
		name: '潮信符',
		desc: '骰子点数和 ×3 计入得分',
		rarity: 'rare',
		skin: 'AquaFox',
		price: 6,
		turns: 1,
		effect: { type: 'sum_chips', per: 3 }
	},

	// ======== 保底等级 4 ========
	{
		id: 'manyuezhufu',
		name: '满月祝福',
		desc: '最低按"一秀"结算',
		rarity: 'common',
		skin: 'twinbop_glow',
		price: 3,
		turns: 2,
		effect: { type: 'level_floor', levelId: 'yi_xiu' }
	},
	{
		id: 'guiyin',
		name: '桂荫庇佑',
		desc: '最低按"二举"结算',
		rarity: 'rare',
		skin: 'Lahm_blue',
		price: 5,
		turns: 2,
		effect: { type: 'level_floor', levelId: 'er_ju' }
	},
	{
		id: 'yueshenbiyou',
		name: '月神庇佑',
		desc: '最低按"三红"结算',
		rarity: 'legendary',
		skin: 'IceWitch_MushDeer',
		price: 8,
		turns: 1,
		effect: { type: 'level_floor', levelId: 'san_hong' }
	},
	{
		id: 'changongbiyou',
		name: '蟾宫庇佑',
		desc: '最低按"对堂"结算',
		rarity: 'legendary',
		skin: 'clefairy',
		price: 9,
		turns: 1,
		effect: { type: 'level_floor', levelId: 'dui_tang' }
	},

	// ======== 多投掷(×2.33,压高稀有度) 4 ========
	{
		id: 'tueye',
		name: '余兴',
		desc: '可多投掷 1 次',
		rarity: 'rare',
		skin: 'rabbit_Judy',
		price: 6,
		turns: 1,
		effect: { type: 'roll', count: 1 }
	},
	{
		id: 'yuetuchu',
		name: '玉兔杵',
		desc: '可多投掷 1 次',
		rarity: 'legendary',
		skin: 'luoxiaohei_rabbit',
		price: 10,
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
		skin: 'HTF_greenberg',
		price: 12,
		turns: 1,
		effect: { type: 'roll', count: 2 }
	},

	// ======== 改点(×2.90 / ×4.48,强) 5 ========
	{
		id: 'yuetuchu2',
		name: '银针',
		desc: '改 1 颗骰子为 4 点',
		rarity: 'rare',
		skin: 'Silver',
		price: 5,
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
	// ---- 连号流补给(配合连珠灯 / 七星灯) ----
	{
		id: 'hebi',
		name: '合璧符',
		desc: '对堂及以上：得分 ×3',
		rarity: 'rare',
		skin: 'skeyster',
		price: 7,
		turns: 2,
		effect: { type: 'cond', cond: 'dui_tang_plus', mult: 3 }
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
		id: 'yuefu2',
		name: '月斧',
		desc: '改 1 颗骰子为 4 点',
		rarity: 'legendary',
		skin: 'Roaning Knight',
		price: 9,
		turns: 2,
		effect: { type: 'set_point', count: 1, point: 4 }
	},
	{
		id: 'yuxi',
		name: '玉玺',
		desc: '改 1 颗骰子为任意点数',
		rarity: 'legendary',
		skin: 'tiPrince',
		price: 10,
		turns: 1,
		effect: { type: 'set_any', count: 1 }
	},
	{
		id: 'jiangxin',
		name: '匠心神笔',
		desc: '改 1 颗骰子为任意点数',
		rarity: 'legendary',
		skin: 'hero_chao',
		price: 14,
		turns: 2,
		effect: { type: 'set_any', count: 1 }
	},

	// ======== 逆向流:把「掷得越烂越赚」做成加成卡 ========
	{
		id: 'niyuefu',
		name: '逆月符',
		desc: '该 Tee 本关得分 = 160 − 本次掷骰分',
		rarity: 'rare',
		skin: 'Dark Default',
		price: 7,
		turns: 2,
		// per = 1 + 1:引擎在外面已经加过一次等级分,这里要把它抵掉,
		// 卡面的「− 本次掷骰分」才逐字成立
		effect: { type: 'reverse', base: 160, per: 2 }
	},

	// ======== 抗 Boss:解除点数作废 ========
	{
		id: 'yueshika',
		name: '月食卡',
		desc: '身上 Tee 本关不受点数作废影响',
		rarity: 'rare',
		skin: 'darklightevilwolfe',
		price: 6,
		turns: 1,
		effect: { type: 'clear_void' }
	},

	// ======== 取舍卡:点数加成 + 点数惩罚(强效果配副作用)========
	// 玩法:带上去之后重掷/改点的目标会变(追高的那个点数、躲低的那个),
	// 所以普通档是主力(经常能碰到才谈得上取舍),高稀有度的是「点数很高」的赌狗版。
	{
		id: 'shibei',
		name: '拾贝',
		desc: '自己每有 1 颗 5 点：得分 +65；每有 1 颗 2 点：得分 −25',
		rarity: 'common',
		skin: 'Seal',
		price: 3,
		turns: 2,
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'own_face', face: 5, chips: 65 },
				{ type: 'own_face', face: 2, chips: -25 }
			]
		}
	},
	{
		id: 'duzhuo',
		name: '独酌',
		desc: '自己每有 1 颗 6 点：得分 +70；每有 1 颗 3 点：得分 −30',
		rarity: 'common',
		skin: 'coffee_cup',
		price: 3,
		turns: 2,
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'own_face', face: 6, chips: 70 },
				{ type: 'own_face', face: 3, chips: -30 }
			]
		}
	},
	{
		id: 'shouzhuo',
		name: '守拙',
		desc: '自己每有 1 颗 4 点：得分 +60；每有 1 颗 2 点：得分 −25',
		rarity: 'common',
		skin: 'Graylynx',
		price: 3,
		turns: 2,
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'own_face', face: 4, chips: 60 },
				{ type: 'own_face', face: 2, chips: -25 }
			]
		}
	},
	{
		id: 'guxing',
		name: '孤星',
		desc: '自己每有 1 颗 1 点：得分 +80；每有 1 颗 4 点：得分 −35',
		rarity: 'common',
		skin: 'Blue ray',
		price: 3,
		turns: 2,
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'own_face', face: 1, chips: 80 },
				{ type: 'own_face', face: 4, chips: -35 }
			]
		}
	},
	{
		id: 'yishan',
		name: '移山',
		desc: '自己每有 1 颗 6 点：得分 +130；每有 1 颗 2 点：得分 −55',
		rarity: 'rare',
		skin: 'Beast_Winter',
		price: 6,
		turns: 2,
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'own_face', face: 6, chips: 130 },
				{ type: 'own_face', face: 2, chips: -55 }
			]
		}
	},
	{
		id: 'fantianyin',
		name: '翻天印',
		desc: '自己每有 1 颗 4 点：得分 +200；每有 1 颗 2 点：得分 −80',
		rarity: 'legendary',
		skin: 'dragon',
		price: 9,
		turns: 2,
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'own_face', face: 4, chips: 200 },
				{ type: 'own_face', face: 2, chips: -80 }
			]
		}
	},

	// ======== 低压道具(未使用即归还,定价比同类贵 40%~50%) ========
	{
		id: 'yaochu',
		name: '玉兔药杵',
		desc: '改 1 颗骰子为 4 点；本关没用掉就归还',
		rarity: 'rare',
		skin: 'sleppbunny',
		price: 7,
		turns: 1,
		refund: true,
		effect: { type: 'set_point', count: 1, point: 4 }
	},
	{
		id: 'yuehuabi',
		name: '月华笔',
		desc: '改 1 颗骰子为任意点数；本关没用掉就归还',
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
		desc: '改 1 颗骰子为 2 点；本关没用掉就归还',
		rarity: 'common',
		skin: 'IceWitch_Beach',
		price: 4,
		turns: 1,
		refund: true,
		effect: { type: 'set_point', count: 1, point: 2 }
	},

	// ======== 点数变换 5 ========
	{
		id: 'wangyuefu',
		name: '望月符',
		desc: '自己的 6 视为 4 点',
		rarity: 'rare',
		skin: 'IceWitch_Deer',
		price: 5,
		turns: 2,
		effect: { type: 'dice_mods', mods: { map: { 6: 4 } } }
	},
	{
		id: 'shuoyuefu',
		name: '朔月符',
		desc: '自己的 5 视为 4 点',
		rarity: 'common',
		skin: 'IceWitch_Reindeer',
		price: 3,
		turns: 2,
		effect: { type: 'dice_mods', mods: { map: { 5: 4 } } }
	},
	{
		id: 'yuexiangfu',
		name: '月相符',
		desc: '自己的 3 视为 4 点',
		rarity: 'common',
		skin: 'IceWitch_MushCat',
		price: 3,
		turns: 2,
		effect: { type: 'dice_mods', mods: { map: { 3: 4 } } }
	},
	{
		id: 'guihuafu',
		name: '桂花符',
		desc: '自己的 2 视为 4 点',
		rarity: 'rare',
		skin: 'Lahm_yellow',
		price: 4,
		turns: 2,
		effect: { type: 'dice_mods', mods: { map: { 2: 4 } } }
	},
	{
		id: 'chanjuanfu',
		name: '婵娟符',
		desc: '自己的 1 视为 4 点',
		rarity: 'legendary',
		skin: 'IceWitch_FairyDeer',
		price: 7,
		turns: 2,
		effect: { type: 'dice_mods', mods: { map: { 1: 4 } } }
	}
];

export const BUFF_BY_ID = new Map(BUFF_CARDS.map((c) => [c.id, c]));

/** 从池中抽 n 张不重复(商店用) */
/**
 * 商店货架:5 张普通 + **最后 1 格**给稀有/传说。
 * 也就是「普通道具每次刷新 5 个,高稀有度每次只出 1 个」——
 * 稀有度不是纯随机权重,而是固定槽位,玩家一眼知道最后那格是惊喜位。
 */
export const drawShopItems = (locks: (string | null)[] = []): BuffCard[] => {
	// 锁定的槽位保留原商品(不参与重抽),并且从池子里排除,免得同一张占两格
	const held = locks.filter((id): id is string => !!id);
	const common = BUFF_CARDS.filter((c) => c.rarity === 'common' && !held.includes(c.id));
	const high = BUFF_CARDS.filter((c) => c.rarity !== 'common' && !held.includes(c.id));
	const weight: Record<string, number> = { rare: 3, legendary: 1 };
	const total = high.reduce((a, c) => a + (weight[c.rarity] ?? 1), 0);
	let r = Math.random() * total;
	let hi: BuffCard = high[0];
	for (const c of high) {
		r -= weight[c.rarity] ?? 1;
		if (r <= 0) {
			hi = c;
			break;
		}
	}
	const drawn = [...drawItems(common, 5), hi];
	// 锁住的槽位原样放回(位置也不变,玩家锁哪格就在哪格)
	return locks.length
		? drawn.map((c, i) => (locks[i] ? (BUFF_BY_ID.get(locks[i]!) ?? c) : c))
		: drawn;
};

export function drawItems<T extends { id: string }>(pool: T[], n: number): T[] {
	const p = [...pool];
	const out: T[] = [];
	while (out.length < n && p.length > 0) {
		out.push(p.splice(Math.floor(Math.random() * p.length), 1)[0]);
	}
	return out;
}
