// Tee 卡系统(类 Balatro 的 Joker 构筑)
// 每个 Tee 卡 = 一个入队角色,带固定皮肤和特殊能力
//
// 数值设计依据见 scripts/balance.ts 的报告(2 次投掷为基线):
//   平均等级分 82.7;多 1 次投掷 ×2.33;改 1 颗为 4 点 ×2.90;改任意点 ×4.48
//   ×mult 不随等级分衰减,+chips 会(等级分 320 时 +60 只剩 ×1.19)

export type Rarity = 'common' | 'rare' | 'legendary';

export const RARITY_INFO: Record<
	Rarity,
	{ label: string; color: string; price: number; sell: number }
> = {
	common: { label: '普通', color: '#94a3b8', price: 3, sell: 1 },
	rare: { label: '稀有', color: '#38bdf8', price: 5, sell: 2 },
	legendary: { label: '传说', color: '#fbbf24', price: 8, sell: 4 }
};

/** 条件:精确等级 / 等级及以上 */
export type Cond =
	| 'none'
	| 'yi_xiu'
	| 'er_ju'
	| 'si_jin'
	| 'san_hong'
	| 'dui_tang'
	| 'zhuang_yuan'
	| 'wu_zi'
	| 'wu_wang'
	| 'liu_bo_hei'
	| 'liu_bo_hong'
	| 'zhuang_yuan_chajinhua'
	| 'yi_xiu_plus'
	| 'er_ju_plus'
	| 'si_jin_plus'
	| 'san_hong_plus'
	| 'dui_tang_plus'
	| 'zhuang_yuan_plus'
	| 'wu_zi_plus'
	| 'wu_wang_plus';

/** 点数变换(与自己骰子相乘的 Boss 修饰同构) */
export interface DiceMods {
	map?: Record<number, number>;
	shift?: number;
	/** 作废点数:掷出这些点数的骰子不参与任何判定 */
	void?: number[];
	/** 连号阶梯(与 midautumn.ts 的解释一致) */
	straightFloor?: boolean;
	/** 点数阶梯(非 4 点同点也算档位) */
	faceFloor?: boolean;
	/** 多段变换叠加 */
	chain?: DiceMods[];
}

/** 卡牌效果 */
export type TeeEffect =
	| { type: 'chips'; value: number } // 得分 +chips
	| { type: 'mult'; value: number } // 得分 ×mult
	| { type: 'chips_mult'; chips: number; mult: number } // 加算 + 乘算
	| { type: 'cond'; cond: Cond; chips?: number; mult?: number } // 条件触发
	| { type: 'team_mult'; value: number } // 全队总分 ×mult
	/** 接力回流:回合结算时把邻居本关得分的 pct 加进全队分(所有人都掷完才算,天然没有先后问题) */
	| {
			type: 'relay_pct';
			from: 'left' | 'right' | 'both';
			pct: number;
			/** 固定底分:前几关邻居分低,纯比例等于没有 */
			flat?: number;
	  }
	| { type: 'team_chips'; value: number } // 全队每个 Tee 各 +chips
	/**
	 * 压分辅助:全队总分 ×(邻居分 / 该 Tee 分)。自己分越低,全队倍率越高 ——
	 * 全池唯一一张「玩家想压低自己输出」的卡,所以故意不 clamp(先试放开)。
	 * 分母用自己本关得分(卡里带 +20,保证不为 0);邻居没人或没分时按 ×1 处理。
	 */
	| { type: 'team_ratio'; from: 'right' | 'side' }
	| { type: 'per_team_chips'; value: number } // 队伍每多 1 人,得分 +value
	| { type: 'scaling_mult'; per: number } // 每过一关,该 Tee 的 mult 永久 +per
	| { type: 'economy'; per: number } // 每关 +月饼币
	| { type: 'interest'; per: number; perCoins: number } // 每 perCoins 月饼币,每关 +per
	| { type: 'extra_roll'; count: number } // 该 Tee 可多投掷 count 次
	| { type: 'set_point'; count: number; point: number } // 掷完后把 count 颗骰子改为 point
	| { type: 'set_any'; count: number } // 掷完后把 count 颗骰子改为任意点数
	| { type: 'level_up'; count: number } // 判定等级提升 count 档(一秀→二举→四进…)
	| { type: 'self_mods'; mods: DiceMods } // 自己的骰子点数变换
	| { type: 'copy_right'; mult?: number } // 复制右侧 Tee 的卡牌(可再 ×mult 超车)
	| { type: 'reroll_all_on_none' } // 掷出"再接再厉"时自动重掷全部(每回合 1 次)
	| { type: 'sum_chips'; per: number } // 骰子点数和 ×per 计入得分(和值流)
	| { type: 'own_face'; face: number; chips?: number; mult?: number; multByCount?: boolean } // 自己最终骰子里每有 1 颗该点数(multByCount: 倍率 = 该点数颗数)
	| { type: 'per_reroll'; chips?: number; mult?: number } // 本回合每重掷 1 颗骰子
	| { type: 'reverse'; base: number; per?: number; perRound?: number } // 逆向:得分 = base(+每关 perRound×关数) − 等级分×per(可为负)
	| { type: 'straight_ladder' } // 连号阶梯:123/234/345/456→一秀,1234 系→二举,12345 系→四进
	| { type: 'straight_chips'; per: number } // 连号里每颗骰子 +per 分
	/**
	 * 充能主动技能:掷完结算后由玩家决定是否发动,发动后进入 cooldown 回合冷却。
	 * - chips:      本次得分 +value(结算后直接加,不吃倍率)
	 * - left_chips: 左侧 Tee 的**已结算分数** +value(结算动画早就播完了,所以不走公式)
	 * - retry:      本关重新开始(全队重掷,分数清零,目标/Boss 不变)
	 */
	| { type: 'active'; skill: 'chips' | 'left_chips' | 'retry'; value?: number; cooldown: number }
	// ---- 联动类:不再只是「换个数字的 +X 分」 ----
	| { type: 'neighbor'; side: 'left' | 'right' | 'both'; chips?: number; mult?: number } // 给相邻 Tee 加成(自己不吃)
	| { type: 'per_buff'; per: number; as: 'chips' | 'mult' } // 该 Tee 身上每有 1 张加成卡
	| {
			type: 'per_tag';
			tag: Tag;
			per: number;
			as: 'chips' | 'mult';
			chips?: number;
			/** 底分改成「四点颗数 × 该系数」:0 分的手牌不再被垫起来(玩法不变,只是不再绕开掷骰) */
			chipsPerFour?: number;
			teamWide?: boolean;
	  } // 队伍里每有 1 张同流派卡(teamWide: 全队同流派 Tee 都吃;chips: 额外底分)
	| { type: 'on_player'; cond: Cond; chips?: number; mult?: number; teamWide?: boolean } // 主 Tee(「我」)掷出该等级及以上时(teamWide = 全队都吃)
	| { type: 'player_die'; face: number; chips?: number; mult?: number } // 「我」最终骰子里每个该点数
	| { type: 'map_player_die'; from: number; to: number } // 「我」掷出的 from 点视为 to 点(团队规则,只作用于主 Tee)
	/**
	 * 重复牌倍率:本关「我」的**原始**骰面里有几颗 face,主 Tee 得分就 ×(颗数 + 1)(命中一颗就 ×2)。
	 * perHit = 2 时改成每颗都 ×2(叠乘)—— 传说档:很吃掷骰,但加成卡影响相对小。
	 * 注意数的是原始点数 —— 已经变成 4 的骰子数不出来,所以引擎需要 playerRawDice。
	 */
	| { type: 'face_count_mult'; face: number; perHit?: number }
	| { type: 'face_ladder' } // 点数阶梯:非 4 点的同点 n 颗按 4 点线档位结算(一秀→六博红)
	| { type: 'face_floor'; face: number; base: number; per: number } // 同点颗数的**基础分下限**:base × per^(n-1)(只升不降)
	| { type: 'team_scale'; per: number; fullBonus?: number } // 队伍每多 1 人 ×per;满编再 ×fullBonus
	| { type: 'sell_scale'; per: number } // 本局每卖出 1 个 Tee:得分 ×per(后期流派)
	| { type: 'coin_mult'; perCoin: number; per: number } // 每 perCoin 月饼币:得分 ×per
	| { type: 'growth_mult'; per: number } // 每过一关:得分 ×(1+per)(复利,读 growth)
	| { type: 'relay_left'; share: number } // 加算:左侧相邻 Tee 的已结算得分 ×share
	| { type: 'sum_mult'; from: number; per: number } // 和值每超过 from 一点:得分 ×per
	| { type: 'bundle'; parts: TeeEffect[] }; // 复合:多个效果同时生效

/** 流派标签:让「队伍里带什么」产生联动 */
export type Tag = '兔' | '桂' | '饼' | '灯' | '月' | '仙';

export const TAG_INFO: Record<Tag, { emoji: string; label: string }> = {
	兔: { emoji: '🐰', label: '玉兔' },
	桂: { emoji: '🌳', label: '桂树' },
	饼: { emoji: '🥮', label: '月饼' },
	灯: { emoji: '🏮', label: '花灯' },
	月: { emoji: '🌕', label: '月华' },
	仙: { emoji: '✨', label: '仙灵' }
};

export interface TeeCard {
	id: string;
	name: string;
	desc: string;
	rarity: Rarity;
	skin: string; // DDNet 皮肤名
	/** 流派标签(部分卡有):被 per_tag 类效果统计 */
	tag?: Tag;
	effect: TeeEffect;
}

const COND_MIN_SCORE: Partial<Record<Cond, number>> = {
	yi_xiu_plus: 10,
	er_ju_plus: 20,
	si_jin_plus: 40,
	san_hong_plus: 80,
	dui_tang_plus: 160,
	zhuang_yuan_plus: 320,
	wu_zi_plus: 480,
	wu_wang_plus: 640
};

const COND_EXACT: Partial<Record<Cond, string>> = {
	none: 'none',
	yi_xiu: 'yi_xiu',
	er_ju: 'er_ju',
	si_jin: 'si_jin',
	san_hong: 'san_hong',
	dui_tang: 'dui_tang',
	zhuang_yuan: 'zhuang_yuan',
	wu_zi: 'wu_zi',
	wu_wang: 'wu_wang',
	liu_bo_hei: 'liu_bo_hei',
	liu_bo_hong: 'liu_bo_hong',
	zhuang_yuan_chajinhua: 'zhuang_yuan_chajinhua'
};

/** 等级分阶梯(升序),用于"及以上"判定与升级效果 */
export const LEVEL_LADDER = [
	'none',
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
] as const;

export const condHit = (cond: Cond, levelId: string, levelScore: number): boolean => {
	const exact = COND_EXACT[cond];
	if (exact !== undefined) return levelId === exact;
	const min = COND_MIN_SCORE[cond];
	if (min !== undefined) return levelScore >= min;
	return false;
};

// ---- 卡池(50) ----

export const CARDS: TeeCard[] = [
	// ======== 普通 21 ========
	{
		id: 'yutou',
		name: '芋泥饼',
		desc: '再接再厉：得分 +220',
		rarity: 'rare',
		tag: '饼',
		skin: 'cupcake',
		effect: { type: 'cond', cond: 'none', chips: 220 }
	},
	{
		id: 'chahu',
		name: '茶壶',
		desc: '二举及以上：得分 ×1.75',
		rarity: 'common',
		skin: 'Tea',
		effect: { type: 'cond', cond: 'er_ju_plus', mult: 1.75 }
	},
	{
		id: 'tuerdeng',
		name: '兔儿爷',
		desc: '三红及以上：得分 ×1.8',
		rarity: 'common',
		tag: '兔',
		skin: 'bunny',
		effect: { type: 'cond', cond: 'san_hong_plus', mult: 1.8 }
	},
	{
		id: 'mizao',
		name: '蜜枣',
		desc: '四进及以上：得分 +100',
		rarity: 'common',
		skin: 'BerryCat',
		effect: { type: 'cond', cond: 'si_jin_plus', chips: 100 }
	},
	{
		id: 'huasheng',
		name: '花生',
		desc: '对堂及以上：得分 +330',
		rarity: 'common',
		skin: 'burnttoast_kiinmn',
		effect: { type: 'cond', cond: 'dui_tang_plus', chips: 330 }
	},
	{
		id: 'denglong',
		name: '高照',
		desc: '三红及以上：得分 +150',
		rarity: 'common',
		skin: 'red_flame',
		effect: { type: 'cond', cond: 'san_hong_plus', chips: 150 }
	},
	{
		id: 'guazi',
		name: '金瓜子',
		desc: '每关 +1 月饼币',
		rarity: 'common',
		skin: 'Watermelon',
		effect: { type: 'economy', per: 1 }
	},
	{
		id: 'huadeng',
		name: '喜钱',
		desc: '一秀及以上：得分 +50',
		rarity: 'common',
		skin: 'cutee_glow',
		effect: { type: 'cond', cond: 'yi_xiu_plus', chips: 50 }
	},
	{
		id: 'dengmi',
		name: '猜谜',
		desc: '二举及以上：得分 +65',
		rarity: 'common',
		skin: 'glow_default',
		effect: { type: 'cond', cond: 'er_ju_plus', chips: 65 }
	},
	{
		id: 'youzi',
		name: '柚子',
		desc: '全队 Tee 得分 +8',
		rarity: 'common',
		skin: 'CuteApple',
		effect: { type: 'team_chips', value: 8 }
	},
	{
		id: 'lingjiao',
		name: '菱角',
		desc: '队伍人数 ×12 分',
		rarity: 'common',
		skin: 'jellyfish',
		effect: { type: 'per_team_chips', value: 12 }
	},

	// ======== 联动流:支援 / 加持 / 流派 / 主 Tee ========
	{
		id: 'tidengyinlu',
		name: '引路',
		desc: '右侧 Tee 得分 +45，自身 +18',
		rarity: 'common',
		skin: 'glow_clafairy',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'neighbor', side: 'right', chips: 45 },
				{ type: 'chips', value: 18 }
			]
		}
	},
	{
		id: 'pengyue',
		name: '承露',
		desc: '该 Tee 身上每张加成卡，得分 +25',
		rarity: 'common',
		skin: 'Puffball',
		effect: { type: 'per_buff', per: 25, as: 'chips' }
	},
	{
		id: 'dengshi',
		name: '灯市',
		desc: '每拥有一个独特的「灯」系角色，得分 +20',
		rarity: 'common',
		skin: 'glow_musictee',
		tag: '灯',
		effect: { type: 'per_tag', tag: '灯', per: 20, as: 'chips' }
	},
	{
		id: 'shiyue',
		name: '拾遗',
		desc: '「我」最终骰子里每个 4，该 Tee 得分 +40',
		rarity: 'common',
		skin: 'small_star',
		effect: { type: 'player_die', face: 4, chips: 40 }
	},
	{
		id: 'guiying',
		name: '桂影',
		desc: '回合结算时：右邻本关得分的 30% + 60 分加进全队分，自己 ×1.3',
		rarity: 'common',
		skin: 'Green',
		tag: '桂',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'relay_pct', from: 'right', pct: 0.3, flat: 60 },
				{ type: 'mult', value: 1.3 }
			]
		}
	},
	{
		id: 'bingdilian',
		name: '并蒂莲',
		desc: '回合结算时：左右两人本关得分的 45% + 100 分加进全队分，自己 ×1.35',
		rarity: 'rare',
		skin: 'rainbowwateregg',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'relay_pct', from: 'both', pct: 0.45, flat: 100 },
				{ type: 'mult', value: 1.35 }
			]
		}
	},
	{
		id: 'qiansixi',
		name: '牵丝戏',
		desc: '全队总分 ×1.15',
		rarity: 'rare',
		skin: 'IceWitch_Clown',
		effect: { type: 'team_mult', value: 1.15 }
	},
	{
		id: 'dengguan',
		name: '灯官',
		desc: '该 Tee 身上每张加成卡，得分 ×1.4',
		rarity: 'rare',
		skin: 'glow_hammie',
		tag: '灯',
		effect: { type: 'per_buff', per: 1.4, as: 'mult' }
	},
	{
		id: 'yutuzuqun',
		name: '玉兔族群',
		desc: '每拥有一个独特的「兔」系角色，该 Tee 得分 +75',
		rarity: 'rare',
		skin: 'whitebunny',
		tag: '兔',
		effect: { type: 'per_tag', tag: '兔', per: 75, as: 'chips' }
	},
	{
		id: 'wangyuehuaiyuan',
		name: '望月怀远',
		desc: '「我」掷出"三红"及以上时，该 Tee 得分 ×4.5',
		rarity: 'rare',
		tag: '月',
		skin: 'lunalovegood',
		effect: { type: 'on_player', cond: 'san_hong_plus', mult: 4.5 }
	},
	{
		id: 'yuexialaoren',
		name: '月下老人',
		desc: '回合结算时：左右两人本关得分的 75% + 150 分加进全队分，自己 ×1.45',
		rarity: 'legendary',
		skin: 'OLD Tee',
		tag: '月',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'relay_pct', from: 'both', pct: 0.75, flat: 150 },
				{ type: 'mult', value: 1.45 }
			]
		}
	},
	{
		id: 'guanghandenghui',
		name: '广寒灯会',
		desc: '该 Tee 身上每张加成卡，得分 ×1.7',
		rarity: 'legendary',
		skin: '10Nanami_glow',
		tag: '灯',
		effect: { type: 'per_buff', per: 1.7, as: 'mult' }
	},
	{
		id: 'yuebingshijia',
		name: '饼香世家',
		desc: '每拥有一个独特的「饼」系角色，该 Tee 得分 ×3',
		rarity: 'legendary',
		skin: 'cupcakecherry',
		tag: '饼',
		effect: { type: 'per_tag', tag: '饼', per: 3.0, as: 'mult' }
	},
	{
		id: 'mingyuegongzhao',
		name: '明月共照',
		desc: '「我」掷出"四进"及以上时，全队 Tee 得分 +300、×3',
		rarity: 'legendary',
		skin: 'Startee',
		tag: '月',
		effect: { type: 'on_player', cond: 'si_jin_plus', chips: 300, mult: 3, teamWide: true }
	},

	// ======== 稀有/传说:和值流(故意做得少,它会简化取舍) ========
	{
		id: 'yuechao',
		name: '潮汐',
		desc: '骰子点数和 ×4 计入得分；和值超过 10 后每点：得分 ×1.12',
		rarity: 'rare',
		skin: 'Riptide',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'sum_chips', per: 4 },
				{ type: 'sum_mult', from: 10, per: 1.12 }
			]
		}
	},
	{
		id: 'wangyue',
		name: '望月',
		desc: '骰子点数和 ×10 计入得分；和值超过 15 后每点：得分 ×1.15',
		rarity: 'legendary',
		tag: '月',
		skin: 'star',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'sum_chips', per: 10 },
				{ type: 'sum_mult', from: 15, per: 1.15 }
			]
		}
	},

	// ======== 稀有:连号流(攻对堂的另一条路:不靠 4,靠连号) ========
	{
		id: 'lianzhudeng',
		name: '连珠灯',
		desc: '连号 3 颗（如 123）算一秀、4 颗算二举、5 颗算四进；连号里每颗骰子：得分 +45；掷出对堂（连号 6 颗）：得分 +150、×3',
		rarity: 'rare',
		tag: '灯',
		skin: 'glow_coala_cammo',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'straight_ladder' },
				{ type: 'straight_chips', per: 45 },
				// 招牌手不能输给别人的中档牌:满顺(对堂)额外给一笔
				{ type: 'cond', cond: 'dui_tang', chips: 150, mult: 3 }
			]
		}
	},
	{
		id: 'qixingdeng',
		name: '七星灯',
		desc: '连号里每颗骰子：得分 +70；掷出对堂（连号 6 颗）：得分 ×2.5',
		rarity: 'rare',
		tag: '灯',
		skin: 'glow_contrastfox',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'straight_chips', per: 70 },
				{ type: 'cond', cond: 'dui_tang', mult: 2.5 }
			]
		}
	},
	{
		id: 'zhideng',
		name: '串珠',
		desc: '连号里每颗骰子：得分 +15',
		rarity: 'common',
		skin: 'generic_glow',
		effect: { type: 'straight_chips', per: 15 }
	},
	// ======== 稀有 22 ========
	{
		id: 'baiyutu',
		name: '白玉兔',
		desc: '可投掷 3 次',
		rarity: 'rare',
		tag: '兔',
		skin: 'Cute_bunny',
		effect: { type: 'extra_roll', count: 1 }
	},
	{
		id: 'change',
		name: '嫦娥仙子',
		desc: '改 1 颗骰子为 4 点',
		rarity: 'legendary',
		tag: '仙',
		skin: 'TeeAngel',
		effect: { type: 'set_point', count: 1, point: 4 }
	},
	{
		id: 'yuebingwang',
		name: '饼王',
		desc: '得分 ×2',
		rarity: 'rare',
		tag: '饼',
		skin: 'cookie_bite',
		effect: { type: 'mult', value: 2 }
	},
	{
		id: 'guihuajiu',
		name: '桂花酒',
		desc: '得分 +85，×1.2',
		rarity: 'rare',
		tag: '桂',
		skin: 'Apple green',
		effect: { type: 'chips_mult', chips: 85, mult: 1.2 }
	},
	{
		id: 'xiaoshangfan',
		name: '小商贩',
		desc: '每关 +3 月饼币',
		rarity: 'rare',
		skin: 'cardboard_box',
		effect: { type: 'economy', per: 3 }
	},
	{
		id: 'guanghangong',
		name: '月宫广寒',
		desc: '每过一关：得分 ×1.25，可叠（复利）',
		rarity: 'rare',
		tag: '月',
		skin: 'IceWitch_IceQueen',
		effect: { type: 'growth_mult', per: 0.25 }
	},
	{
		id: 'houyi',
		name: '射日仙',
		desc: '再接再厉时自动重掷全部（每回合 1 次），得分 ×2',
		rarity: 'rare',
		tag: '仙',
		skin: 'Yellow',
		effect: { type: 'bundle', parts: [{ type: 'reroll_all_on_none' }, { type: 'mult', value: 2 }] }
	},
	{
		id: 'yupan',
		name: '月华盘',
		desc: '全队总分 ×1.25',
		rarity: 'rare',
		tag: '月',
		skin: 'cloud_ball',
		effect: { type: 'team_mult', value: 1.25 }
	},
	{
		id: 'quanjiafu',
		name: '合家福饼',
		desc: '队伍每多 1 人：得分 ×1.5；满 6 人再 ×2',
		rarity: 'legendary',
		tag: '饼',
		skin: 'Red and White',
		effect: { type: 'team_scale', per: 1.5, fullBonus: 2 }
	},
	{
		id: 'yutuyao',
		name: '玉兔捣药',
		desc: '判定等级 +1 档，但得分 ×0.8',
		rarity: 'rare',
		tag: '兔',
		skin: 'rabbit_new2',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'level_up', count: 1 },
				{ type: 'mult', value: 0.8 }
			]
		}
	},
	{
		id: 'yinhe',
		name: '星河',
		desc: '状元及以上：得分 ×3',
		rarity: 'rare',
		skin: 'astronaut',
		effect: { type: 'cond', cond: 'zhuang_yuan_plus', mult: 3 }
	},
	{
		id: 'yueya',
		name: '银钩',
		desc: '对堂及以上：得分 +700',
		rarity: 'rare',
		skin: 'stargirl',
		effect: { type: 'cond', cond: 'dui_tang_plus', chips: 700 }
	},
	{
		id: 'changong',
		name: '蟾魄',
		desc: '自己的 6 点视为 4 点',
		rarity: 'rare',
		skin: 'IceWitch_Frozen',
		effect: { type: 'self_mods', mods: { map: { 6: 4 } } }
	},
	{
		id: 'yuelao',
		name: '红绳',
		desc: '复制右侧 Tee 的卡牌',
		rarity: 'common',
		skin: 'dark_chao',
		effect: { type: 'copy_right' }
	},
	{
		id: 'yinyuanbu',
		name: '姻缘簿',
		desc: '复制右侧 Tee 的卡牌，并额外 ×1.5',
		rarity: 'rare',
		skin: 'Dark Angel',
		effect: { type: 'copy_right', mult: 1.5 }
	},
	{
		id: 'kongmingdeng',
		name: '孔明灯',
		desc: '队伍每多 1 人：得分 ×1.2',
		rarity: 'rare',
		tag: '灯',
		skin: 'FalFy_glow',
		effect: { type: 'team_scale', per: 1.2 }
	},
	{
		id: 'guihuaniang',
		name: '桂花酿',
		desc: '得分 +45，×1.5',
		rarity: 'rare',
		tag: '桂',
		skin: 'grapegreen',
		effect: { type: 'chips_mult', chips: 45, mult: 1.5 }
	},
	{
		id: 'yuhuachi',
		name: '玉兔车',
		desc: '每持有 5 月饼币，每关 +1 月饼币',
		rarity: 'rare',
		tag: '兔',
		skin: 'rabbit_new1',
		effect: { type: 'interest', per: 1, perCoins: 5 }
	},
	{
		id: 'tianluo',
		name: '田螺',
		desc: '四进及以上：得分 ×2.2',
		rarity: 'rare',
		skin: 'Frog',
		effect: { type: 'cond', cond: 'si_jin_plus', mult: 2.2 }
	},
	{
		id: 'yunhai',
		name: '云海',
		desc: '二举及以上：得分 ×2.4',
		rarity: 'rare',
		skin: 'cloudly',
		effect: { type: 'cond', cond: 'er_ju_plus', mult: 2.4 }
	},
	{
		id: 'guishu',
		name: '桂树',
		desc: '每过一关：得分 ×1.15，可叠（复利）',
		rarity: 'rare',
		tag: '桂',
		skin: 'Leafeon',
		effect: { type: 'growth_mult', per: 0.15 }
	},

	// ======== 传说 10 ========
	{
		id: 'wugang',
		name: '吴刚成仙',
		desc: '改 1 颗骰子为任意点数',
		rarity: 'legendary',
		tag: '仙',
		skin: 'king-greyfox',
		effect: { type: 'set_any', count: 1 }
	},
	{
		id: 'jinyuebing',
		name: '金饼',
		desc: '得分 ×3',
		rarity: 'legendary',
		tag: '饼',
		skin: 'candy_apple',
		effect: { type: 'mult', value: 3 }
	},
	{
		id: 'guihuashu',
		name: '金粟神树',
		desc: '全队总分 ×1.5',
		rarity: 'legendary',
		skin: 'greenstripe',
		effect: { type: 'team_mult', value: 1.5 }
	},
	{
		id: 'yuegongxianzi',
		name: '仙子临凡',
		desc: '状元及以上：得分 ×5.5',
		rarity: 'legendary',
		tag: '仙',
		skin: 'IceWitch_AccurateAngel',
		effect: { type: 'cond', cond: 'zhuang_yuan_plus', mult: 5.5 }
	},
	{
		id: 'changepair',
		name: '嫦娥飞仙',
		desc: '改 2 颗骰子为 4 点，但得分 ×0.5',
		rarity: 'legendary',
		tag: '仙',
		skin: 'GlowPinky',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'set_point', count: 2, point: 4 },
				{ type: 'mult', value: 0.5 }
			]
		}
	},
	{
		id: 'yuetu',
		name: '仙娥',
		desc: '可投掷 3 次，且得分 ×1.5',
		rarity: 'legendary',
		tag: '仙',
		skin: 'IceWitch_Fairy',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'extra_roll', count: 1 },
				{ type: 'mult', value: 1.5 }
			]
		}
	},
	{
		id: 'chijin',
		name: '赤金仙丹',
		desc: '得分 ×1.5；三红及以上再 ×2.5',
		rarity: 'legendary',
		tag: '仙',
		skin: 'FireCrystalCat',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'mult', value: 1.5 },
				{ type: 'cond', cond: 'san_hong_plus', mult: 2.5 }
			]
		}
	},
	{
		id: 'yueying',
		name: '霜影',
		desc: '自己的 1 点视为 4 点',
		rarity: 'legendary',
		skin: 'White Jawbreaker',
		effect: { type: 'self_mods', mods: { map: { 1: 4 } } }
	},
	{
		id: 'guanghan',
		name: '月上广寒',
		desc: '该 Tee 得分 +20，掷出的 1、6 视为 4；回合结算时：总分额外 +（「我」的得分 × 相邻 Tee 本关得分 ÷ 该 Tee 得分），右邻优先',
		rarity: 'rare',
		tag: '月',
		skin: 'IceWitch',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'chips', value: 20 },
				{ type: 'self_mods', mods: { map: { 1: 4, 6: 4 } } },
				{ type: 'team_ratio', from: 'side' }
			]
		}
	},
	{
		id: 'jinghuashuiyue',
		name: '镜花仙缘',
		desc: '复制右侧 Tee 的卡牌，且全队总分 ×1.25',
		rarity: 'legendary',
		tag: '仙',
		skin: 'cammostripeangelgirl',
		effect: { type: 'bundle', parts: [{ type: 'copy_right' }, { type: 'team_mult', value: 1.25 }] }
	},
	{
		id: 'panlong',
		name: '蟠龙礼盒',
		desc: '全队总分 ×1.3，每关 +4 月饼币；每 10 月饼币：该 Tee 得分 ×1.2',
		rarity: 'legendary',
		skin: 'ghost_dragon',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'team_mult', value: 1.3 },
				{ type: 'economy', per: 4 },
				{ type: 'coin_mult', perCoin: 10, per: 1.2 }
			]
		}
	},
	// ==== 点数统计流:自己骰子里的点数越多越强,和改点/视为类配装联动 ====
	{
		id: 'dianjiang',
		name: '点将',
		desc: '自己每有 1 颗 6 点：得分 +30',
		rarity: 'common',
		skin: 'glow_brownbear',
		effect: { type: 'own_face', face: 6, chips: 30 }
	},
	{
		id: 'guyue',
		name: '孤影',
		desc: '自己每有 1 颗 1 点：得分 +28',
		rarity: 'common',
		skin: 'White',
		effect: { type: 'own_face', face: 1, chips: 28 }
	},
	{
		id: 'duiying',
		name: '对影',
		desc: '自己每有 1 颗 2 点：得分 +35',
		rarity: 'common',
		skin: 'Shadowtee',
		effect: { type: 'own_face', face: 2, chips: 35 }
	},
	{
		id: 'sansheng',
		name: '桂下三生',
		desc: '自己每有 1 颗 3 点：得分 +60',
		rarity: 'rare',
		tag: '桂',
		skin: 'amor_green',
		effect: { type: 'own_face', face: 3, chips: 60 }
	},
	{
		id: 'sixi',
		name: '四喜饼',
		desc: '自己每有 1 颗 4 点：得分 ×1.25',
		rarity: 'rare',
		tag: '饼',
		skin: 'SweetVertigo',
		effect: { type: 'own_face', face: 4, mult: 1.25 }
	},
	{
		id: 'zhaixing',
		name: '摘星',
		desc: '自己每有 1 颗 6 点：得分 +65；每有 1 颗 1 点：得分 −10',
		rarity: 'common',
		skin: 'glow_mermyfox',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'own_face', face: 6, chips: 65 },
				{ type: 'own_face', face: 1, chips: -10 }
			]
		}
	},

	// ==== 点数线套装:每个点数一套 ====
	//
	// 用途:让"非四点"也能成为主攻方向,而不是只能当保底。
	// 蓝卡(2025-09 重做):自己的同点 n 颗把**基础分**抬到 base × 3^(n-1),只升不降。
	//   base 按点数钉死:1/6 点 42、2/5 点 44、3 点 45(旧的 30/120/420/1600/3700/8400
	//   用 base·3^(n-1) 拟合,最大偏差 30%)。文案一句话「同点每多一颗 ×3」,
	//   玩家不用再去联想四点线的档位 —— 2025-09 收到「三秋看不懂」的反馈。
	// 橙卡:仍是「4 点线档位 + 每颗 ×2」那一套(待定:要不要也换新阶梯)。
	// 4 点自己那套**不乘**(牌型分已经是它的倍率,再乘就是给最强线发钱)。
	{
		id: 'hanxing',
		name: '寒星',
		desc: '投掷出 1 颗 1 点：获得 42 分；每多 1 颗 1 点，得分 ×3',
		rarity: 'rare',
		skin: 'IceWitch_Dark',
		effect: { type: 'face_floor', face: 1, base: 42, per: 3 }
	},
	{
		id: 'shuangli',
		name: '双鲤衔饼',
		desc: '投掷出 1 颗 2 点：获得 44 分；每多 1 颗 2 点，得分 ×3',
		rarity: 'rare',
		tag: '饼',
		skin: 'Aqua Fish_KZ',
		effect: { type: 'face_floor', face: 2, base: 44, per: 3 }
	},
	{
		id: 'sanqiu',
		name: '灯下三秋',
		desc: '投掷出 1 颗 3 点：获得 45 分；每多 1 颗 3 点，得分 ×3',
		rarity: 'rare',
		tag: '灯',
		skin: 'glow_turtle',
		effect: { type: 'face_floor', face: 3, base: 45, per: 3 }
	},
	{
		id: 'mantanghong',
		name: '满堂红',
		desc: '自己每有 1 颗 4 点：得分 +45',
		rarity: 'rare',
		skin: 'Red',
		effect: { type: 'own_face', face: 4, chips: 45 }
	},
	{
		id: 'wugeng',
		name: '五更桂花',
		desc: '投掷出 1 颗 5 点：获得 44 分；每多 1 颗 5 点，得分 ×3',
		rarity: 'rare',
		tag: '桂',
		skin: 'Greeny',
		effect: { type: 'face_floor', face: 5, base: 44, per: 3 }
	},
	{
		id: 'liuhe',
		name: '六合仙踪',
		desc: '投掷出 1 颗 6 点：获得 42 分；每多 1 颗 6 点，得分 ×3',
		rarity: 'rare',
		tag: '仙',
		skin: 'coala_phoenix',
		effect: { type: 'face_floor', face: 6, base: 42, per: 3 }
	},

	// ==== 点数线套装(传说档):每颗翻倍,橙卡是这套的终点 ====
	{
		id: 'yiyang',
		name: '纯阳仙',
		desc: '自己每有 1 颗 1 点：得分 +20、每颗 ×2；同点 n 颗按 4 点线档位结算',
		rarity: 'legendary',
		tag: '仙',
		skin: 'clan_wheat',
		effect: {
			type: 'bundle',
			parts: [{ type: 'face_ladder' }, { type: 'own_face', face: 1, chips: 20, mult: 2 }]
		}
	},
	{
		id: 'shuangbi',
		name: '桂璧生辉',
		desc: '自己每有 1 颗 2 点：得分 +20、每颗 ×2；同点 n 颗按 4 点线档位结算',
		rarity: 'legendary',
		tag: '桂',
		skin: 'OnyxNanami_AquaGreen',
		effect: {
			type: 'bundle',
			parts: [{ type: 'face_ladder' }, { type: 'own_face', face: 2, chips: 20, mult: 2 }]
		}
	},
	{
		id: 'sanqing',
		name: '三清仙尊',
		desc: '自己每有 1 颗 3 点：得分 +20、每颗 ×2；同点 n 颗按 4 点线档位结算',
		rarity: 'legendary',
		tag: '仙',
		skin: 'IceWitch_Druid',
		effect: {
			type: 'bundle',
			parts: [{ type: 'face_ladder' }, { type: 'own_face', face: 3, chips: 20, mult: 2 }]
		}
	},
	{
		id: 'jinhua',
		name: '月下金花',
		desc: '自己每有 1 颗 4 点：得分 +120',
		rarity: 'legendary',
		tag: '月',
		skin: 'IceWitch_Sakura',
		effect: { type: 'own_face', face: 4, chips: 120 }
	},
	{
		id: 'wuyue',
		name: '五岳桂香',
		desc: '自己每有 1 颗 5 点：得分 +25、每颗 ×2；同点 n 颗按 4 点线档位结算',
		rarity: 'legendary',
		tag: '桂',
		skin: 'Green ray',
		effect: {
			type: 'bundle',
			parts: [{ type: 'face_ladder' }, { type: 'own_face', face: 5, chips: 25, mult: 2 }]
		}
	},
	{
		id: 'liulong',
		name: '六龙仙驭',
		desc: '自己每有 1 颗 6 点：得分 +25、每颗 ×2；同点 n 颗按 4 点线档位结算',
		rarity: 'legendary',
		tag: '仙',
		skin: 'dragon 2',
		effect: {
			type: 'bundle',
			parts: [{ type: 'face_ladder' }, { type: 'own_face', face: 6, chips: 25, mult: 2 }]
		}
	},

	// ==== 流派流:同流派越多越强(蓝=只加自己,橙=全队同流派都吃) ====
	//
	// 两种档位,机制只差一个 teamWide:
	//   蓝(稀有):每拥有一个独特的「X」系角色,该 Tee 得分 ×2(叠乘),外加 +20 底分
	//   橙(传说):同样的 ×2 和 +20,但**所有「X」系 Tee 都吃** —— 一张橙卡
	//             就能把全队同流派摊开,不需要人手一张
	//
	// 5 张同流派时 ×(2^5)=32 → 一秀 (10+20)×32 = 960 > 状元 320。
	// 底分 +20 是必需的:只靠 ×2 时一秀正好 320 = 状元(等于不算大于)。
	{
		id: 'yutuhui',
		name: '兔儿满堂',
		desc: '每拥有一个独特的「兔」系角色：该 Tee 得分 ×1.8（叠乘）；每有 1 颗四点，得分 +1',
		rarity: 'rare',
		tag: '兔',
		skin: 'BunnyViVi',
		effect: { type: 'per_tag', tag: '兔', per: 1.8, as: 'mult', chipsPerFour: 1 }
	},
	{
		id: 'guiyuan',
		name: '桂苑',
		desc: '每拥有一个独特的「桂」系角色：该 Tee 得分 ×1.4（叠乘）；每有 1 颗四点，得分 +1',
		rarity: 'rare',
		tag: '桂',
		skin: 'flower_crown_ghost',
		effect: { type: 'per_tag', tag: '桂', per: 1.4, as: 'mult', chipsPerFour: 1 }
	},
	{
		id: 'yuebingfang',
		name: '饼坊',
		desc: '每拥有一个独特的「饼」系角色：该 Tee 得分 ×1.7（叠乘）；每有 1 颗四点，得分 +1',
		rarity: 'rare',
		tag: '饼',
		skin: 'buni',
		effect: { type: 'per_tag', tag: '饼', per: 1.7, as: 'mult', chipsPerFour: 1 }
	},
	{
		id: 'dengzhen',
		name: '灯阵',
		desc: '每拥有一个独特的「灯」系角色：该 Tee 得分 ×1.5（叠乘）；每有 1 颗四点，得分 +1',
		rarity: 'rare',
		tag: '灯',
		skin: 'glow_axolotl',
		effect: { type: 'per_tag', tag: '灯', per: 1.5, as: 'mult', chipsPerFour: 1 }
	},
	{
		id: 'yuelun',
		name: '月轮',
		desc: '每拥有一个独特的「月」系角色：该 Tee 得分 ×1.2（叠乘）；每有 1 颗四点，得分 +1',
		rarity: 'rare',
		tag: '月',
		skin: 'cloud',
		effect: { type: 'per_tag', tag: '月', per: 1.2, as: 'mult', chipsPerFour: 1 }
	},
	{
		id: 'xianlv',
		name: '仙侣',
		desc: '每拥有一个独特的「仙」系角色：该 Tee 得分 ×1.6（叠乘）；每有 1 颗四点，得分 +1',
		rarity: 'rare',
		tag: '仙',
		skin: 'cammostripeangel',
		effect: { type: 'per_tag', tag: '仙', per: 1.6, as: 'mult', chipsPerFour: 1 }
	},
	{
		id: 'yutulinfan',
		name: '玉兔临凡',
		desc: '每拥有一个独特的「兔」系角色：所有「兔」系 Tee 得分 ×2.3（叠乘）；每有 1 颗四点，得分 +1',
		rarity: 'legendary',
		tag: '兔',
		skin: 'usagi',
		effect: { type: 'per_tag', tag: '兔', per: 2.3, as: 'mult', chipsPerFour: 1, teamWide: true }
	},
	{
		id: 'guidian',
		name: '桂殿',
		desc: '每拥有一个独特的「桂」系角色：所有「桂」系 Tee 得分 ×2.3（叠乘）；每有 1 颗四点，得分 +1',
		rarity: 'legendary',
		tag: '桂',
		skin: 'ghost_greensward',
		effect: { type: 'per_tag', tag: '桂', per: 2.3, as: 'mult', chipsPerFour: 1, teamWide: true }
	},
	{
		id: 'tuanyuanbing',
		name: '团圆饼',
		desc: '每拥有一个独特的「饼」系角色：所有「饼」系 Tee 得分 ×3（叠乘）；每有 1 颗四点，得分 +1',
		rarity: 'legendary',
		tag: '饼',
		skin: 'Mint Choco',
		effect: { type: 'per_tag', tag: '饼', per: 3.0, as: 'mult', chipsPerFour: 1, teamWide: true }
	},
	{
		id: 'changmingdeng',
		name: '长明灯',
		desc: '每拥有一个独特的「灯」系角色：所有「灯」系 Tee 得分 ×2.1（叠乘）；每有 1 颗四点，得分 +1',
		rarity: 'legendary',
		tag: '灯',
		skin: 'glow_cammo',
		effect: { type: 'per_tag', tag: '灯', per: 2.1, as: 'mult', chipsPerFour: 1, teamWide: true }
	},
	{
		id: 'taiyin',
		name: '太阴素月',
		desc: '每拥有一个独特的「月」系角色：所有「月」系 Tee 得分 ×2（叠乘）；每有 1 颗四点，得分 +1',
		rarity: 'legendary',
		tag: '月',
		skin: 'IceWitch_Queen',
		effect: { type: 'per_tag', tag: '月', per: 2.0, as: 'mult', chipsPerFour: 1, teamWide: true }
	},
	{
		id: 'qunxianhui',
		name: '群仙会',
		desc: '每拥有一个独特的「仙」系角色：所有「仙」系 Tee 得分 ×2.3（叠乘）；每有 1 颗四点，得分 +1',
		rarity: 'legendary',
		tag: '仙',
		skin: 'Drag Queen',
		effect: { type: 'per_tag', tag: '仙', per: 2.3, as: 'mult', chipsPerFour: 1, teamWide: true }
	},
	// ==== 主 Tee 流:队友给「我」改骰子规则 ====
	//
	// 「我掷出的 X 点视为 4」——五张集齐(1/2/3/5/6)时,「我」的骰子全是 4 = 100% 六博红。
	// 稀有度按「凑齐难度」排:1/6 普通、2/3/5 稀有。
	// 稀有档额外带「重复牌倍率」:本关「我」掷出几颗这个点数,得分就 ×几 ——
	// 奖励的正是本来该重掷掉的重复牌(掷出 1,1,1 不再是烂牌,而是 ×3)。
	// 作废优先于映射(判定看原始点数),所以 Boss 迷月的 6 作废会直接打断这条线。
	{
		id: 'xiaoyue',
		name: '破晓',
		desc: '「我」掷出的 1 点视为 4 点',
		rarity: 'common',
		skin: 'Irradiated Sunny',
		effect: { type: 'map_player_die', from: 1, to: 4 }
	},
	{
		id: 'meiyue',
		name: '柳眉',
		desc: '「我」掷出的 2 点视为 4 点；本关「我」骰子里有几颗 2，得分就 ×（颗数 + 1）',
		rarity: 'rare',
		skin: 'green_stripe',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'map_player_die', from: 2, to: 4 },
				{ type: 'face_count_mult', face: 2 }
			]
		}
	},
	{
		id: 'xinyue',
		name: '朔日',
		desc: '「我」掷出的 3 点视为 4 点；本关「我」每有 1 颗 3，得分就 ×2（叠乘）',
		rarity: 'legendary',
		skin: 'IceWitch_Snow',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'map_player_die', from: 3, to: 4 },
				{ type: 'face_count_mult', face: 3, perHit: 2 }
			]
		}
	},
	{
		id: 'sanxingzhao',
		name: '三星照',
		desc: '「我」掷出的 3 点视为 4 点；本关「我」骰子里有几颗 3，得分就 ×（颗数 + 1）',
		rarity: 'rare',
		skin: 'sunwateregg',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'map_player_die', from: 3, to: 4 },
				{ type: 'face_count_mult', face: 3 }
			]
		}
	},
	{
		id: 'shangxian',
		name: '上弦',
		desc: '「我」掷出的 5 点视为 4 点；本关「我」骰子里有几颗 5，得分就 ×（颗数 + 1）',
		rarity: 'rare',
		skin: 'IceWitch_DeerSakura',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'map_player_die', from: 5, to: 4 },
				{ type: 'face_count_mult', face: 5 }
			]
		}
	},
	{
		id: 'wangshu',
		name: '望舒',
		desc: '「我」掷出的 6 点视为 4 点',
		rarity: 'common',
		skin: 'Littlewhite',
		effect: { type: 'map_player_die', from: 6, to: 4 }
	},
	// ==== 团队流 · 卖卡攒倍率(后期) ====
	//
	// 卖 Tee 是"把已经拿到的东西换成倍率"——R6 之前队伍没满,根本舍不得卖;
	// R6 之后每卖一个都变成永久倍率,所以是典型的后期流派(越晚越强)。
	{
		id: 'yeshi',
		name: '夜市饼香',
		desc: '每卖出 1 个 Tee：得分 ×1.25（每回合最多计 2 个）',
		rarity: 'rare',
		tag: '饼',
		skin: 'Lan_Pudding',
		effect: { type: 'sell_scale', per: 1.25 }
	},
	{
		id: 'dazhanggui',
		name: '饼铺掌柜',
		desc: '每累计卖出 1 个 Tee：得分 ×1.3（每回合最多计 2 个，叠乘）',
		rarity: 'legendary',
		tag: '饼',
		skin: 'biscuit',
		effect: { type: 'sell_scale', per: 1.3 }
	},
	// ==== 重掷流:重掷越多越强,和「多投掷」配装联动 ====
	{
		id: 'kuaiyu',
		name: '快雨',
		desc: '本回合每重掷 1 颗骰子：得分 ×1.25',
		rarity: 'rare',
		skin: 'mermydon_glow',
		effect: { type: 'per_reroll', mult: 1.25 }
	},
	// ==== 充能角色:掷完结算动画播完,由玩家决定是否发动,发动后进冷却 ====
	{
		id: 'jinchan',
		name: '仙蟾',
		desc: '掷完可发动：本 Tee +650 分（冷却 3 关）',
		rarity: 'legendary',
		tag: '仙',
		skin: 'royal_turtle',
		effect: { type: 'active', skill: 'chips', value: 650, cooldown: 3 }
	},
	{
		id: 'fagui',
		name: '伐桂',
		desc: '掷完可发动：左侧 Tee +700 分（冷却 3 关）',
		rarity: 'legendary',
		tag: '桂',
		skin: 'Green person',
		effect: { type: 'active', skill: 'left_chips', value: 700, cooldown: 3 }
	},
	{
		id: 'shilun',
		name: '时之仙轮',
		desc: '掷完可发动：本关重新掷过（冷却 7 关）',
		rarity: 'legendary',
		tag: '仙',
		skin: 'Hollow Knight',
		effect: { type: 'active', skill: 'retry', cooldown: 7 }
	},

	// ==== 逆向流:得分 = base − 本次掷骰分 × per(可以为负) ====
	//
	// 引擎里等级分在外面已经加过一次,所以卡里的 per 是**叠在它上面**的:
	// 等级分净系数 = 1 − per。原来 per = 1 恰好把等级分整项抵消 ⇒ 掷骰完全不影响
	// 分数(和卡面写的「− 本次掷骰分」不符)。所以这里统一 +1:净系数 = −per_text,
	// 卡面文字逐字成立,「掷得越烂越赚」才是真的。
	// 稀有度 = 压制难度:普通罚 1 倍、稀有一半、传说 2.5 倍,越狠越需要空四/改点压制。
	{
		id: 'kuiyue',
		name: '亏月',
		desc: '得分 = 100 + 每关 +5 − 本次掷骰分',
		rarity: 'common',
		tag: '月',
		skin: 'Whitetee Small',
		effect: { type: 'reverse', base: 100, perRound: 5, per: 2 }
	},
	{
		// 稀有 = 改点型:掷完后必须自己挑一颗骰子改成 1 点(压等级的操作)
		// 罚分 ×1.5:净系数 −1.5(per = 1 + 1.5)
		id: 'queyue',
		name: '缺月',
		desc: '得分 = 170 + 每关 +50 − 掷骰分 ×1.5；掷完后把 1 颗骰子改为 1 点',
		rarity: 'rare',
		tag: '月',
		skin: 'darkforce',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'reverse', base: 170, perRound: 50, per: 2.5 },
				{ type: 'set_point', count: 1, point: 1 }
			]
		}
	},
	{
		// 传说 = 改点型(比缺月多改一个方向):罚分 ×2.5(净系数 −2.5)意味着高等级牌型
		// 会把你打成负分,所以给你一颗可以自己挑的骰子去压等级。真正的压制仍然靠
		// 「空四」(自己 4 点作废,便宜普通、能囤)。
		id: 'canyue',
		name: '残月',
		desc: '得分 = 320 + 每关 +100 − 掷骰分 ×2.5；掷完后把 1 颗骰子改为 3 点',
		rarity: 'legendary',
		tag: '月',
		skin: 'IceWitch_Halloween',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'reverse', base: 320, perRound: 100, per: 3.5 },
				{ type: 'set_point', count: 1, point: 3 }
			]
		}
	},
	// 负分流的「零件」:4 点是分数引擎,逆向流却要你把等级压低 —— 两张稀有卡少了它
	// 就是自伤卡,所以它刻意做成便宜普通,让玩家前期就能囤起来等后期。
	{
		id: 'kongsi',
		name: '空四',
		desc: '自己掷出的 4 点作废；得分 +150',
		rarity: 'common',
		skin: 'Black Hole',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'self_mods', mods: { void: [4] } },
				{ type: 'chips', value: 150 }
			]
		}
	}
];

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
