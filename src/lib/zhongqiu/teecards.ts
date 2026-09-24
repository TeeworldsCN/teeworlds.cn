// Tee 卡系统(类 Balatro 的 Joker 构筑)
// 每个 Tee 卡 = 一个入队Tee,带固定皮肤和特殊能力
//

export type Rarity = 'common' | 'rare' | 'legendary';

/** 稀有度的展示信息 + 卖出价。Tee 卡只能选/拿(开局 5 选 2、每关 3 选 1),不能用月饼币买,
 *  所以这里只有 `sell` —— 买入价不存在,别再加回来。加成卡的价格在各自的 `price` 上。 */
export const RARITY_INFO: Record<Rarity, { label: string; color: string; sell: number }> = {
	common: { label: '普通', color: '#94a3b8', sell: 1 },
	rare: { label: '稀有', color: '#38bdf8', sell: 2 },
	legendary: { label: '传说', color: '#fbbf24', sell: 4 }
};

/**
 * 卡片描边色:稀有度色 45% 混进透明。
 * 满色的稀有度描边在深色底上又粗又亮,压到 45% 才和卡面是一个重量级。
 * TeeCard 的 `.tee-card` 用的是同一口径(CSS 里写死 `color-mix(... 45%, transparent)`,
 * 因为它要靠 `--rarity` 变量给 hover 阴影复用)—— 改这里记得同步那边。
 */
export const cardBorderColor = (color: string) => `color-mix(in srgb, ${color} 45%, transparent)`;

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

export interface DiceMods {
	map?: Record<number, number>;
	shift?: number;
	void?: number[];
	/** 连号阶梯(与 midautumn.ts 的解释一致) */
	straightFloor?: boolean;
	faceFloor?: boolean;
	/** 多段变换叠加 */
	chain?: DiceMods[];
}

/** 卡牌效果 */
export type TeeEffect =
	| { type: 'chips'; value: number } // 基础分 +chips
	| { type: 'live_die_chips'; per: number } // 每颗未作废的骰子:基础分 +per(空四)
	// unlessNone:判成「再接再厉」时这条不生效(玉兔捣药卡面「未掷出再接再厉时…但得分 ×0.8」)
	| { type: 'mult'; value: number; unlessNone?: boolean } // 得分 ×mult
	| { type: 'chips_mult'; chips: number; mult: number } // 加算 + 乘算
	| { type: 'cond'; cond: Cond; chips?: number; mult?: number } // 条件触发
	| { type: 'team_mult'; value: number } // 全队总分 ×mult
	| {
			type: 'relay_pct';
			from: 'left' | 'right' | 'both';
			pct: number;
			flat?: number;
	  }
	| { type: 'team_chips'; value: number } // 全队每个 Tee 各 +chips
	| { type: 'team_ratio'; from: 'right' | 'left' | 'side'; min?: number } // 该 Tee 本关得分低于 min 就不触发(卡面「若得分 < 100，不触发"):挡住 own → 0/负分被 Math.max(1, …) 钳成 1、比值变成「邻居分 ÷ 1」的爆分(逆月符/翻天印/守拙压成负分、云海提前收关时干脆是 0,实测 900 万分)
	| { type: 'per_team_chips'; value: number } // 队伍每多 1 人,基础分 +value
	| { type: 'scaling_mult'; per: number } // 每过一关,该 Tee 的 mult 永久 +per
	| { type: 'economy'; per: number } // 每关 +月饼币
	| { type: 'interest'; per: number; perCoins: number } // 每 perCoins 月饼币,每关 +per
	| { type: 'extra_roll'; count: number } // 该 Tee 可多投掷 count 次
	// from: 只能挑这个点数的骰子(连珠灯的「4 点→任意点数」);options: 改后点数只能二选一
	| { type: 'set_point'; count: number; point: number; from?: number }
	| { type: 'set_any'; count: number; from?: number; options?: number[] } // 掷完后把 count 颗骰子改为任意点数
	| { type: 'level_up'; count: number } // 判定等级提升 count 档(一秀→二举→四进…)
	// 点名等级的基础分 ×value(进士:四进 / 六博黑)。注意是 chips 侧翻倍,
	// 不是「得分 ×2」——只放大这几个等级自带的基础分,不动后面的倍率链
	| { type: 'level_base_mult'; levelIds: string[]; value: number }
	| { type: 'self_mods'; mods: DiceMods } // 自己的骰子点数变换
	| { type: 'copy_right'; mult?: number } // 复制右侧 Tee 的卡牌(可再 ×mult 超车);右侧还是复制卡就一路向右 —— 展开口径见 effectiveEffects
	| { type: 'reroll_all_on_none' } // 掷出"再接再厉"时自动重掷全部(每回合 1 次)
	| { type: 'sum_chips'; per: number } // 骰子点数和 ×per 计入基础分(和值流)
	| {
			type: 'own_face';
			face: number;
			chips?: number;
			mult?: number;
			multByCount?: boolean;
			asRolled?: boolean;
	  } // 自己最终骰子里每有 1 颗该点数(multByCount: 倍率 = 该点数颗数;asRolled: 只数**掷出**的,**改点来的不算**)
	// 该 Tee 自己的骰子里每颗 face 点:倍率 **+per**(桂树 —— 乘值在增长,不是再乘一层)
	| { type: 'own_face_add'; face: number; per: number; base: number }
	// 桂树:同上,但颗数**跨关累计** —— 计分读 growth[srcId](页面把该 Tee 的累计数并进去);
	// 本关掷出的颗数由页面在**回合结束**才记进 tee.faceGrow(不能当场记:同一回合后面几只 Tee 会立刻吃到)
	| { type: 'own_face_grow'; face: number; per: number; base: number }
	// chipsMult 是**基础分侧**的每颗倍率(基础分 ×chipsMult^重掷颗数),mult 才是得分侧
	| { type: 'per_reroll'; chips?: number; mult?: number; chipsMult?: number } // 本回合每重掷 1 颗骰子
	| { type: 'per_extra_roll'; per: number } // 每多 1 次投掷机会:倍率 ×per^n
	// 逆向:把「本回合已得的净值(等级分 + 筹码)」整个替换掉 ——
	// 基础分 = base(+每关 perRound×关数) − 净值,掷得越烂越赚(per 字段没实现,别用)
	| { type: 'reverse'; base: number; per?: number; perRound?: number }
	| { type: 'straight_ladder' } // 连号阶梯:123/234/345/456→一秀,1234 系→二举,12345 系→四进
	| { type: 'straight_chips'; per: number } // 最长连号的颗数 ×per(重复点数只算 1 颗,多条只取最长)
	// 连号长度倍率:连号 n 颗 → 得分 ×per^(n-from)。连号流的引擎 ——
	// 原来三张卡的乘数全锁在「对堂(6 连)」上,而那是 ~1.5% 的事件,等于按不出来。
	| { type: 'straight_mult'; per: number; from?: number }
	| { type: 'active'; skill: 'chips' | 'left_chips' | 'retry'; value?: number; cooldown: number }
	// 田螺:掷完可发动 —— 停靠的加成卡按价格 ×perPrice **计入基础分**,返还减半;
	// 不发动就照旧按原价返还(发动 = 拿分,不发动 = 拿钱)
	| { type: 'active'; skill: 'parked'; perPrice: number; cooldown: number }
	// 和值类主动技:发动时按**当前骰子点数和**结算,所以参数不是固定 value
	| { type: 'active'; skill: 'sum'; per: number; from?: number; mult?: number; cooldown: number }
	// 改骰子的主动技(连珠灯):发动后先改一颗骰子为 4 点,再把任意四点改成任意点数。
	// 发生在改点阶段之前 —— 所以卡牌的改点能看到它改出来的 4 点。
	| { type: 'active'; skill: 'to_four'; cooldown: number }
	// 掷完可发动:把该 Tee 的**总分**再乘一层。cost 可选 —— 喜钱花 10 月饼币,仙蟾不花。
	| { type: 'active'; skill: 'mult'; mult: number; cost?: number; cooldown: number }
	// 云海:掷完可发动,立刻结束本关;每个还没投掷的Tee各给 perTee 月饼币
	| { type: 'active'; skill: 'end_round'; perTee: number; cooldown: number }
	// 归家:技能不留在持有者身上,而是授予「我」(toPlayer);掷完可发动,
	// 回合结算时出售「我」换 coins 月饼币(结算动画里补一行,不走 sellTee)
	| { type: 'active'; skill: 'sell_self'; coins: number; cooldown: number; toPlayer: true }
	// ---- 联动类:不再只是「换个数字的 +X 分」 ----
	| { type: 'neighbor'; side: 'left' | 'right' | 'both'; chips?: number; mult?: number } // 给相邻 Tee 加成(自己不吃)
	| { type: 'per_buff'; per: number; as: 'chips' | 'mult' } // 该 Tee 身上每有 1 张加成卡
	| {
			type: 'per_tag';
			tag: Tag;
			per: number;
			as: 'chips' | 'mult';
			chips?: number;
			chipsPerFour?: number;
			teamWide?: boolean;
	  } // 队伍里每有 1 张同流派卡(teamWide: 全队同流派 Tee 都吃;chips: 额外底分)
	| { type: 'on_player'; cond: Cond; chips?: number; mult?: number; teamWide?: boolean } // 主 Tee(「我」)掷出该等级及以上时(teamWide = 全队都吃)
	| { type: 'player_die'; face: number; chips?: number; mult?: number } // 「我」每有 1 颗该点数(只数最终骰面)
	| { type: 'map_player_die'; from: number; to: number } // 「我」掷出的 from 点视为 to 点(团队规则,只作用于主 Tee)
	| { type: 'face_count_chips'; face: number; chips: number }
	| { type: 'face_ladder' } // 点数阶梯:非 4 点的同点 n 颗按 4 点线档位结算(一秀→六博红)
	| { type: 'face_floor'; face: number; base: number; per: number } // 同点颗数的**基础分下限**:base × per^(n-1)(只升不降)
	| { type: 'team_scale'; per: number; fullBonus?: number } // 队伍每多 1 人 ×per;满编再 ×fullBonus
	// 已废弃(2025-09):夜市饼香→夜市饼摊、饼铺掌柜都改了,没有卡再用它。留着是因为 tools/run.ts 的
	// 流派偏好表还在提它;真要清就一起清。
	| { type: 'sell_scale'; per: number }
	| { type: 'coin_mult'; perCoin: number; per: number } // 每 perCoin 月饼币:得分 ×per
	| { type: 'growth_mult'; per: number } // 每过一关:得分 ×(1+per)(复利,读 growth)
	| { type: 'relay_left'; share: number } // 加算:左侧相邻 Tee 的已结算得分 ×share
	| { type: 'sum_mult'; from: number; per: number } // 和值每超过 from 一点:得分 ×per
	// 花生:基础分 += per × (未作废点数和) × (未作废颗数)。作废按下标算 —— 见 first_roll_void
	| { type: 'live_sum_chips'; per: number }
	// 花生:本回合**首次投掷整把作废**;重掷过的那几颗解除作废;
	// 重掷完之后,重掷的骰子里只要和别人同点数就作废(判定在页面侧,这里只是声明+给工具读)
	| { type: 'first_roll_void' }
	// 星河:「我」掷出的这些点数作废(和 map_player_die 一样是全队收集、只作用在「我」身上)
	| { type: 'player_void_die'; faces: number[] }
	// 「我」的得分 ×per(无条件)。持卡者是谁不重要 —— 加成一律落在「我」身上。
	// 星河:「我」得分 ×2 就是它。
	| { type: 'self_mult'; per: number }
	// 按「我」**作废**的骰子数,把**该 Tee**(持卡者)的得分 ×per^颗数、基础分 +chips×颗数。
	// 星河的「该 Tee 基础分 +30、得分 ×1.5」就是它 —— 受益人是持卡者,不是「我」。
	| { type: 'player_die_mult'; per: number; chips?: number }
	// (「该 Tee 基础分 +30」用普通的 chips 就行 —— 那种效果天然落在持有者身上)
	// 蜜枣:该回合**首次投掷**按几率直接变成 faces(不看骰子)
	| { type: 'jackpot'; chance: number; faces: number[] }
	// 田螺:该 Tee 身上的加成卡不生效、掷完原价返还;掷完可发动主动技(见 active/parked)
	//  分/价 中位在 16 上下,压到 12 → 存卡永远不如用掉一张合适的底分卡,
	//  但能把用不上的卡(以及糍粑 8.3 这种低于行情的)救回来 —— 这正是田螺的定位)
	| { type: 'buff_refund' }
	// 夜市饼摊:上回合卖出过 Tee → 本回合该 Tee 得分 ×mult(不累积、不限次数)
	| { type: 'next_round_sell_mult'; mult: number }
	// 饼铺掌柜(一):每累计卖出 1 个 Tee,基础分 +per
	| { type: 'sold_chips'; per: number }
	// 饼铺掌柜(二):队伍里没有「我」时,回合结算时队伍总分 ×mult
	| { type: 'no_me_team_mult'; mult: number }
	// 猜谜:每次「重掷之后点数没变」的基础分安慰奖(挑出去的那几颗全掷回原来的点数)
	| { type: 'stuck_reroll_chips'; per: number }
	// 掷出 min 个同点数(任意点数)就 +chips,有几组算几组(点数线的橙卡)
	| { type: 'same_face_chips'; min: number; chips: number }
	// 「连珠灯照」:本关队伍里每掷出 1 个 `levelId`(如对堂),**全队总分** ×per^个数(0 个 = ×1)。
	// `free` = 前几个不算(「每**多**出 1 个」)。层数于是被**队伍人数**自然封住:六只最多 5 层,
	// 而正常队伍里「我」没有 Tee 卡、进不了这条线 —— 要六只都上线上还得先把「我」卖出去(归家)。
	// 不封顶就会变成「多塞几张线上卡就多叠一层」的堆料游戏(实测两连珠灯不带串珠能把上限翻倍)。
	// 算在团队那一轮(calcTeamTotal):先要全队都投完才数得清,逐 Tee 结算时数不全(会是半路的数)。
	// 高照把首个投掷者的骰子抄给线上其他 Tee —— 一个对堂就此变成整队一层,这是那份配合的兑现处。
	| { type: 'team_level_mult'; levelId: string; per: number; free?: number }
	// 高照:「高照/串珠/七星灯/连珠灯」里**首个投掷者**的最终骰子状态(点数 + 作废)
	//      → **这条线里其他 Tee** 回合内首次投掷的骰子(线上的 Tee 才吃复制,线外不抄)
	| { type: 'shared_first_roll' } // 只有高照带这条;点名的四张既是「模板候选」也是「复制对象」
	// 「连珠灯照」的接力版:线上每只 Tee 首次投掷抄的是**上一只线上 Tee 掷完后的最终骰子状态**
	// (线上第一只自己掷)。高照只把**首个投掷者**那一手传给所有人 —— 第一手烂了整队跟着烂;
	// 接力则是一手接一手地改:后一只可以在前一只的成果上继续救,救好了再往下传。
	| { type: 'shared_prev_roll' }
	| { type: 'bundle'; parts: TeeEffect[] }; // 复合:多个效果同时生效

export type Tag = '兔' | '桂' | '饼' | '灯' | '月' | '仙' | '丹';

export const TAG_INFO: Record<Tag, { emoji: string; label: string }> = {
	兔: { emoji: '🐰', label: '玉兔' },
	桂: { emoji: '🌳', label: '桂树' },
	饼: { emoji: '🥮', label: '月饼' },
	灯: { emoji: '🏮', label: '花灯' },
	月: { emoji: '🌕', label: '月华' },
	仙: { emoji: '✨', label: '仙灵' },
	// 仙系拆出来的第二派(控骰流):丹道 —— 改点/投掷/重掷那几张
	丹: { emoji: '🧪', label: '丹道' }
};

export interface TeeCard {
	id: string;
	name: string;
	desc: string;
	rarity: Rarity;
	skin: string; // DDNet 皮肤名
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

// ---- 卡池(111 张:普通 30 / 稀有 49 / 传说 32) ----
//
// 顺序即数组下标(「卡池一览」页按它排),**与稀有度无关** —— 稀有度只看每张的 rarity。
// 开局 5 选 2 只从普通卡里抽(drawDraftChoices),3 选 1 全池按稀有度加权(drawCards)。

export const CARDS: TeeCard[] = [
	{
		id: 'yutou',
		name: '芋泥饼',
		desc: '再接再厉：基础分 +220',
		rarity: 'common',
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
		// 原来的 'bunny' 是只深棕兔,小卡上缩到 48px 就是一坨黑影;换成金橙色的兔儿爷
		skin: 'HaiMo_TuZi_huang',
		effect: { type: 'cond', cond: 'san_hong_plus', mult: 1.8 }
	},
	{
		id: 'mizao',
		name: '蜜枣',
		desc: '本回合首次投掷有 10% 概率掷出「444444」',
		rarity: 'common',
		skin: 'BerryCat',
		effect: { type: 'jackpot', chance: 0.1, faces: [4, 4, 4, 4, 4, 4] }
	},
	{
		id: 'jinshi',
		name: '进士',
		desc: '四进、五子登科、六博黑：该等级基础分 ×3',
		rarity: 'common',
		skin: 'Scholar',
		effect: { type: 'level_base_mult', levelIds: ['si_jin', 'wu_zi', 'liu_bo_hei'], value: 3 }
	},
	{
		id: 'huasheng',
		name: '花生',
		desc: '本回合首次投掷的骰子全部作废；重掷的骰子不作废；重掷后有同点数的骰子作废；基础分 + 未作废点数和 × 未作废颗数 × 2',
		rarity: 'common',
		skin: 'burnttoast_kiinmn',
		effect: {
			type: 'bundle',
			parts: [{ type: 'first_roll_void' }, { type: 'live_sum_chips', per: 2 }]
		}
	},
	{
		id: 'denglong',
		name: '高照',
		desc: '「高照」在队伍中时：「高照」「串珠」「七星灯」「连珠灯」「连珠灯照」里首先投掷的那个 Tee，其最终的骰子状态决定这条线里其他 Tee 回合内首次投掷的骰子（队伍里还有「连珠灯照」时，改按它的接力抄法）',
		rarity: 'common',
		skin: 'red_flame',
		effect: { type: 'shared_first_roll' }
	},
	{
		id: 'lianzhudengzhao',
		name: '连珠灯照',
		desc: '「连珠灯照」在队伍中时（它接替「高照」的抄法）：「高照」「串珠」「七星灯」「连珠灯」「连珠灯照」这条线上，每只 Tee 首次投掷的骰子都抄上一只线上 Tee 掷完后的最终骰子状态（线上第一只自己掷）；本关每多掷出 1 个对堂，全队总分 ×3（第 1 个不算）',
		rarity: 'legendary',
		tag: '灯',
		skin: 'glow chinese',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'shared_prev_roll' },
				{ type: 'team_level_mult', levelId: 'dui_tang', per: 3, free: 1 }
			]
		}
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
		desc: '掷完可发动：消耗 10 月饼币，该 Tee 得分 ×3.5（冷却 2 关）',
		rarity: 'common',
		skin: 'cutee_glow',
		effect: { type: 'active', skill: 'mult', mult: 3.5, cost: 10, cooldown: 2 }
	},
	{
		id: 'dengmi',
		name: '猜谜',
		desc: '每次重掷点数未发生变化时，基础分 +50',
		rarity: 'common',
		skin: 'glow_default',
		effect: { type: 'stuck_reroll_chips', per: 50 }
	},
	{
		id: 'youzi',
		name: '柚子',
		desc: '全队 Tee 基础分 +8',
		rarity: 'common',
		skin: 'CuteApple',
		effect: { type: 'team_chips', value: 8 }
	},
	{
		id: 'lingjiao',
		name: '菱角',
		desc: '该 Tee 基础分 + 队伍人数 ×12',
		rarity: 'common',
		skin: 'jellyfish',
		effect: { type: 'per_team_chips', value: 12 }
	},

	// ======== 联动流:支援 / 加持 / 流派 / 主 Tee ========
	{
		id: 'tidengyinlu',
		name: '引路',
		desc: '右侧 Tee 基础分 +45，自身基础分 +18',
		rarity: 'common',
		skin: 'ghost_random',
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
		desc: '该 Tee 身上每张加成卡，基础分 +25',
		rarity: 'common',
		skin: 'Puffball',
		effect: { type: 'per_buff', per: 25, as: 'chips' }
	},
	{
		id: 'dengshi',
		name: '灯市',
		desc: '每拥有一个独特的「灯」系Tee，基础分 +20',
		rarity: 'common',
		skin: 'glow_musictee',
		tag: '灯',
		effect: { type: 'per_tag', tag: '灯', per: 20, as: 'chips' }
	},
	{
		id: 'shiyue',
		name: '拾遗',
		desc: '「我」每有 1 颗 4 点：该 Tee 基础分 +30',
		rarity: 'common',
		skin: 'small_star',
		effect: { type: 'player_die', face: 4, chips: 30 }
	},
	{
		id: 'guiying',
		name: '桂影',
		desc: '回合结算时：右邻本关得分的 30% + 60 分加进全队分，自己的得分 ×1.3',
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
		desc: '回合结算时：左右两人本关得分的 45% + 100 分加进全队分，自己的得分 ×1.5',
		rarity: 'rare',
		skin: 'rainbowwateregg',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'relay_pct', from: 'both', pct: 0.45, flat: 100 },
				{ type: 'mult', value: 1.5 }
			]
		}
	},
	{
		id: 'qiansixi',
		name: '牵丝戏',
		desc: '全队总分 ×1.3',
		rarity: 'rare',
		skin: 'IceWitch_Clown',
		effect: { type: 'team_mult', value: 1.3 }
	},
	{
		id: 'dengguan',
		name: '灯官',
		desc: '该 Tee 身上每张加成卡，得分 ×1.5',
		rarity: 'rare',
		skin: 'glow_hammie',
		tag: '灯',
		effect: { type: 'per_buff', per: 1.5, as: 'mult' }
	},
	{
		id: 'yutuzuqun',
		name: '玉兔族群',
		desc: '每拥有一个独特的「兔」系Tee，该 Tee 基础分 +75',
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
		skin: 'sleppbunny',
		effect: { type: 'on_player', cond: 'san_hong_plus', mult: 4.5 }
	},
	{
		id: 'yuexialaoren',
		name: '月下老人',
		desc: '回合结算时：左右两人本关得分的 100% + 150 分加进全队分，自己的得分 ×3.5',
		rarity: 'legendary',
		skin: 'OLD Tee',
		tag: '月',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'relay_pct', from: 'both', pct: 1, flat: 150 },
				{ type: 'mult', value: 3.5 }
			]
		}
	},
	{
		id: 'guanghandenghui',
		name: '广寒灯会',
		desc: '该 Tee 身上每张加成卡，得分 ×2.0',
		rarity: 'legendary',
		skin: '10Nanami_glow',
		tag: '灯',
		effect: { type: 'per_buff', per: 2.0, as: 'mult' }
	},
	{
		id: 'yuebingshijia',
		name: '饼香世家',
		desc: '每拥有一个独特的「饼」系Tee，该 Tee 得分 ×1.26；每有 1 颗 4 点，该 Tee 基础分 +375',
		rarity: 'legendary',
		skin: 'cupcakecherry',
		tag: '饼',
		effect: { type: 'per_tag', tag: '饼', per: 1.26, as: 'mult', chipsPerFour: 375 }
	},
	{
		id: 'mingyuegongzhao',
		name: '明月共照',
		desc: '「我」每有 1 颗 4 点：该 Tee 得分 ×2',
		rarity: 'legendary',
		skin: 'Startee',
		tag: '月',
		effect: {
			type: 'bundle',
			parts: [{ type: 'player_die', face: 4, mult: 2 }]
		}
	},

	{
		id: 'yuechao',
		name: '潮汐',
		desc: '掷完可发动：本 Tee 点数和 ×4 计入基础分，和值超过 18 后每点 ×1.12（冷却 2 关）',
		rarity: 'rare',
		skin: 'Riptide',
		effect: { type: 'active', skill: 'sum', per: 4, from: 18, mult: 1.12, cooldown: 2 }
	},
	{
		id: 'wangyue',
		name: '望月',
		desc: '掷完可发动：本 Tee 点数和 ×10 计入基础分，和值超过 18 后每点 ×1.25（冷却 2 关）',
		rarity: 'legendary',
		tag: '月',
		skin: 'star',
		effect: { type: 'active', skill: 'sum', per: 10, from: 18, mult: 1.25, cooldown: 2 }
	},
	{
		id: 'lianzhudeng',
		name: '连珠灯',
		desc: '投掷后可发动：把 1 颗未作废的骰子改为 4 点，冷却 2 关；投掷后还可把未作废的 4 点骰子（任意数量）改为任意点数；掷出对堂：基础分 +150，得分 ×12',
		rarity: 'rare',
		tag: '灯',
		skin: 'glow_coala_cammo',
		effect: {
			type: 'bundle',
			parts: [
				// 主动技(可选):改 1 颗骰子为 4 点,冷却 2 关
				{ type: 'active', skill: 'to_four', cooldown: 2 },
				// 恒定:把任意数量的 4 点改成任意点数 —— 和主动技无关,每回合都在改点队列里
				{ type: 'set_any', count: 6, from: 4 },
				{ type: 'cond', cond: 'dui_tang', chips: 150, mult: 12 }
			]
		}
	},
	{
		id: 'qixingdeng',
		name: '七星灯',
		desc: '最长连号的每颗点数：基础分 +70；连号每多 1 颗，得分 ×1.35',
		rarity: 'rare',
		tag: '灯',
		skin: 'glow_contrastfox',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'straight_chips', per: 70 },
				// 七星灯是连号流的头牌:纯靠「连得越长越猛」,不再赌 6 连那种偶然
				{ type: 'straight_mult', per: 1.35, from: 2 }
			]
		}
	},
	{
		id: 'zhideng',
		name: '串珠',
		desc: '最长连号的每颗点数：基础分 +15',
		rarity: 'common',
		skin: 'generic_glow',
		effect: { type: 'straight_chips', per: 15 }
	},
	// ======== 开场/基础卡(上面那批)之后:流派卡 ========
	{
		id: 'baiyutu',
		name: '白玉兔',
		desc: '可投掷 3 次；自己每有 1 颗 4 点：基础分 +45',
		rarity: 'rare',
		tag: '兔',
		skin: 'Cute_bunny',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'extra_roll', count: 1 },
				// 丹引(多 1 投掷 + 每多 1 次投掷机会 ×2)是同稀有度的上位版;这张补一条 4 点
				// 底分当区分度:一个赌次数,一个吃四点
				{ type: 'own_face', face: 4, chips: 45 }
			]
		}
	},
	{
		id: 'change',
		name: '丹砂',
		desc: '改 1 颗未作废的骰子为 4 点；自己每掷出 1 颗 4 点：得分 ×1.25',
		rarity: 'rare',
		tag: '丹',
		skin: 'TeeAngel',
		effect: {
			type: 'bundle',
			parts: [
				// asRolled:和丹火同一口径 —— 改点来的 4 点只顶等级,不进乘算
				// (否则「改 1 颗为 4」的保底 × 乘算叠在一起)
				{ type: 'set_point', count: 1, point: 4 },
				{ type: 'own_face', face: 4, mult: 1.25, asRolled: true }
			]
		}
	},
	{
		id: 'yuebingwang',
		name: '饼王',
		desc: '得分 ×1.5',
		rarity: 'common',
		tag: '饼',
		skin: 'cookie_bite',
		// 下放普通后从 ×2 砍下来:无条件乘算在普通档是白给的(茶壶那张还要二举及以上才 ×1.75)
		effect: { type: 'mult', value: 1.5 }
	},
	{
		id: 'guihuajiu',
		name: '桂花酒',
		desc: '基础分 +85，得分 ×1.5',
		rarity: 'rare',
		tag: '桂',
		skin: 'Apple green',
		effect: { type: 'chips_mult', chips: 85, mult: 1.5 }
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
		desc: '掷完可发动：该 Tee 总分得分 ×2；冷却 2 关',
		rarity: 'rare',
		tag: '月',
		skin: 'IceWitch_IceQueen',
		effect: { type: 'active', skill: 'mult', mult: 2, cooldown: 2 }
	},
	{
		id: 'houyi',
		name: '回炉丹',
		desc: '再接再厉时自动重掷全部（每回合 1 次）；本回合每重掷 1 颗骰子：得分 ×1.5',
		rarity: 'rare',
		tag: '丹',
		skin: 'Yellow',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'reroll_all_on_none' },
				// 自动重掷也算(那 6 颗同样进 rerolled)—— 页面里 rerollCount += 6。
				// 作用在基础分侧:能和道具的得分倍率叠着爆(得分 ×2 那半段已去掉)。
				{ type: 'per_reroll', chipsMult: 1.5 }
			]
		}
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
		desc: '队伍每多 1 人：得分 ×1.4；满 6 人再 ×2',
		rarity: 'legendary',
		tag: '饼',
		skin: 'Red and White',
		effect: { type: 'team_scale', per: 1.4, fullBonus: 2 }
	},
	{
		id: 'yutuyao',
		name: '玉兔捣药',
		desc: '未掷出再接再厉时：判定等级 +1 档，但得分 ×0.8；状元插金花：基础分 ×2',
		rarity: 'rare',
		tag: '兔',
		skin: 'rabbit_new2',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'level_up', count: 1 },
				// ×0.8 和抬档是**同一个条件**:掷空时抬档被页面的 level_up 门挡住,
				// 这条不跟着挡就会白扣 20%(踩过:掷空 + 柚子 +8 → 实算 6,应为 8)
				{ type: 'mult', value: 0.8, unlessNone: true },
				// 已经是最高档(状元插金花)时 +1 档无处可去,改成底分翻倍顶上
				{ type: 'level_base_mult', levelIds: ['zhuang_yuan_chajinhua'], value: 2 }
			]
		}
	},
	{
		id: 'yinhe',
		name: '星河',
		desc: '「我」得分 ×2；「我」掷出的 4 点作废；「我」每有 1 颗作废骰子：该 Tee 基础分 +30、得分 ×1.5',
		rarity: 'rare',
		skin: 'astronaut',
		effect: {
			type: 'bundle',
			parts: [
				// 「我」得分 ×2(无条件,加成落在「我」身上)
				{ type: 'self_mult', per: 2 },
				// 「我」掷出的 4 点作废
				{ type: 'player_void_die', faces: [4] },
				// 「我」每有 1 颗作废骰子:该 Tee(持卡者)基础分 +30、得分 ×1.5
				{ type: 'player_die_mult', per: 1.5, chips: 30 }
			]
		}
	},
	{
		id: 'yueya',
		name: '归家',
		desc: '「我」获得能力：「掷完可发动：回合结算时出售该 Tee，获得 8 月饼币」',
		rarity: 'rare',
		skin: 'stargirl',
		effect: { type: 'active', skill: 'sell_self', coins: 8, cooldown: 0, toPlayer: true }
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
		skin: 'red_panda',
		effect: { type: 'copy_right' }
	},
	{
		id: 'yinyuanbu',
		name: '姻缘簿',
		desc: '复制右侧 Tee 的卡牌，并额外得分 ×1.5',
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
		desc: '基础分 +25，得分 ×1.3',
		rarity: 'common',
		tag: '桂',
		skin: 'grapegreen',
		// 下放普通后从 +45/×1.5 砍下来(自身 ×2.32 → 队伍影响 1.22,超出普通档 1.05~1.13);
		// 砍到 +25/×1.3 = 自身 ×1.69 → 队伍影响 1.12 ✓。桂花酒(稀有 +85/×1.5)仍是它的上位版
		effect: { type: 'chips_mult', chips: 25, mult: 1.3 }
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
		desc: '该 Tee 身上的加成卡不生效、掷完原价返还；掷完可发动：停靠的卡按价格 ×12 计入基础分，返还减半',
		rarity: 'rare',
		skin: 'Frog',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'buff_refund' },
				{ type: 'active', skill: 'parked', perPrice: 12, cooldown: 0 }
			]
		}
	},
	{
		id: 'yunhai',
		name: '云海',
		desc: '掷完可发动：立刻结束本关，每个尚未投掷的Tee +5 月饼币；尚未投掷的Tee身上的加成卡保留至下一回合（冷却 2 关）',
		rarity: 'rare',
		skin: 'cloudly',
		effect: { type: 'active', skill: 'end_round', perTee: 5, cooldown: 2 }
	},
	{
		id: 'guishu',
		name: '桂树',
		desc: '该 Tee 得分 ×1.15；该 Tee 每累计掷出 1 颗 4 点，倍率 +0.05',
		rarity: 'rare',
		tag: '桂',
		skin: 'GoldCat',
		effect: { type: 'own_face_grow', face: 4, per: 0.05, base: 1.15 }
	},

	// (这里原本按稀有度分过区,早已和实际稀有度对不上 —— 删了,看每张的 rarity)
	{
		id: 'wugang',
		name: '丹诀',
		desc: '把 1 颗未作废的骰子改为任意点数；自己每掷出 1 颗 4 点：得分 ×2',
		rarity: 'legendary',
		tag: '丹',
		skin: 'king-greyfox',
		effect: {
			type: 'bundle',
			parts: [
				// asRolled:和丹火同一口径(丹家的三张都改成「掷出」了)
				{ type: 'set_any', count: 1 },
				{ type: 'own_face', face: 4, mult: 2, asRolled: true }
			]
		}
	},
	{
		id: 'jinyuebing',
		name: '金饼',
		desc: '得分 ×5',
		rarity: 'legendary',
		tag: '饼',
		skin: 'candy_apple',
		effect: { type: 'mult', value: 5 }
	},
	{
		id: 'guihuashu',
		name: '金粟神树',
		desc: '全队总分 ×2',
		rarity: 'legendary',
		skin: 'greenstripe',
		effect: { type: 'team_mult', value: 2 }
	},
	{
		id: 'yuegongxianzi',
		name: '仙子临凡',
		desc: '三红及以上：得分 ×8',
		rarity: 'rare',
		tag: '仙',
		skin: 'IceWitch_AccurateAngel',
		// 同稀有度的赤金仙丸在同触发档是 ×2×3 = ×6、平时也有 ×2 —— ×5 会被它全面盖住;
		// 抬到 ×8:三红+ 时这张更高、平时赤金更高,两张各有所长(纯赌狗卡的高天花板)
		effect: { type: 'cond', cond: 'san_hong_plus', mult: 8 }
	},
	{
		id: 'changepair',
		name: '丹火',
		desc: '改 2 颗未作废的骰子为 4 点；自己每掷出 1 颗 4 点：得分 ×2',
		rarity: 'legendary',
		tag: '丹',
		skin: 'GlowPinky',
		effect: {
			type: 'bundle',
			parts: [
				// asRolled:「每有」会把保底那两颗 4 点也乘进去 —— 改 2 颗为 4 = 二举 20 分,
				// 再 ×2² = **80 分保底**(正好是无卡时的平均分),p10 直接顶到 80。
				// 改点只顶等级(那是它的设计意图),不进乘算。
				{ type: 'set_point', count: 2, point: 4 },
				{ type: 'own_face', face: 4, mult: 2, asRolled: true }
			]
		}
	},
	{
		id: 'yuetu',
		name: '丹引',
		desc: '可多投掷 1 次；每多 1 次投掷机会：得分 ×2',
		rarity: 'rare',
		tag: '丹',
		skin: 'IceWitch_Fairy',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'extra_roll', count: 1 },
				{ type: 'per_extra_roll', per: 2 }
			]
		}
	},
	{
		id: 'chijin',
		name: '赤金仙丸',
		desc: '得分 ×2；三红及以上倍率再增长 ×3',
		rarity: 'rare',
		tag: '仙',
		skin: 'FireCrystalCat',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'mult', value: 2 },
				{ type: 'cond', cond: 'san_hong_plus', mult: 3 }
			]
		}
	},
	{
		id: 'yueying',
		name: '霜影',
		desc: '自己的 1 点视为 4 点；自己每有 1 颗 4 点：得分 ×1.5',
		rarity: 'legendary',
		skin: 'White Jawbreaker',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'self_mods', mods: { map: { 1: 4 } } },
				{ type: 'own_face', face: 4, mult: 1.5 }
			]
		}
	},
	{
		id: 'guanghan',
		name: '月上广寒',
		desc: '该 Tee 基础分 +200，掷出的 1、6 视为 4；回合结算时：总分额外 +（「我」的得分 × 左侧 Tee 得分 ÷ 该 Tee 得分）；若得分 < 100，不触发',
		rarity: 'rare',
		tag: '月',
		skin: 'IceWitch',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'chips', value: 200 },
				{ type: 'self_mods', mods: { map: { 1: 4, 6: 4 } } },
				{ type: 'team_ratio', from: 'left', min: 100 }
			]
		}
	},
	{
		id: 'jinghuashuiyue',
		name: '镜花仙缘',
		desc: '复制右侧 Tee 的卡牌，且全队总分 ×1.35',
		rarity: 'legendary',
		tag: '仙',
		skin: 'cammostripeangelgirl',
		effect: { type: 'bundle', parts: [{ type: 'copy_right' }, { type: 'team_mult', value: 1.35 }] }
	},
	{
		id: 'panlong',
		name: '蟠龙礼盒',
		desc: '全队总分 ×1.3，每关 +4 月饼币；每 10 月饼币：该 Tee 得分 ×1.32',
		rarity: 'legendary',
		skin: 'ghost_dragon',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'team_mult', value: 1.3 },
				{ type: 'economy', per: 4 },
				{ type: 'coin_mult', perCoin: 10, per: 1.32 }
			]
		}
	},
	{
		id: 'dianjiang',
		name: '点将',
		desc: '自己每有 1 颗 6 点：基础分 +45',
		rarity: 'common',
		skin: 'glow_brownbear',
		effect: { type: 'own_face', face: 6, chips: 45 }
	},
	{
		id: 'guyue',
		name: '孤影',
		desc: '自己每有 1 颗 1 点：基础分 +35',
		rarity: 'common',
		skin: 'White',
		effect: { type: 'own_face', face: 1, chips: 35 }
	},
	{
		id: 'duiying',
		name: '对影',
		desc: '自己每有 1 颗 2 点：基础分 +40',
		rarity: 'common',
		skin: 'Shadowtee',
		effect: { type: 'own_face', face: 2, chips: 40 }
	},
	{
		// 旧值只有 +60:点数线重做时漏掉的卡,对齐同线的 rare 标准(+14x / ×1.5)
		id: 'sansheng',
		name: '桂下三生',
		desc: '自己每有 1 颗 3 点：基础分 +145、得分 ×1.5',
		rarity: 'rare',
		tag: '桂',
		skin: 'amor_green',
		effect: { type: 'own_face', face: 3, chips: 145, mult: 1.5 }
	},
	{
		id: 'sixi',
		name: '四喜饼',
		desc: '自己每有 1 颗 4 点：得分 ×1.5',
		rarity: 'rare',
		tag: '饼',
		skin: 'SweetVertigo',
		effect: { type: 'own_face', face: 4, mult: 1.5 }
	},
	{
		id: 'zhaixing',
		name: '摘星',
		desc: '自己每有 1 颗 6 点：基础分 +50；每有 1 颗 1 点：基础分 −12',
		rarity: 'common',
		skin: 'glow_mermyfox',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'own_face', face: 6, chips: 50 },
				{ type: 'own_face', face: 1, chips: -12 }
			]
		}
	},

	// ==== 点数线套装:每个点数一套 ====
	//
	// 用途:让"非四点"也能成为主攻方向,而不是只能当保底。
	//   base 按点数钉死:1/6 点 142、2/5 点 144、3 点 145(旧值 30/120/420/1600/3700/8400)
	{
		id: 'hanxing',
		name: '寒星',
		desc: '自己每有 1 颗 1 点：基础分 +150、得分 ×1.55',
		rarity: 'rare',
		skin: 'IceWitch_Dark',
		effect: { type: 'own_face', face: 1, chips: 150, mult: 1.55 }
	},
	{
		id: 'shuangli',
		name: '双鲤衔饼',
		desc: '自己每有 1 颗 2 点：基础分 +144、得分 ×1.5',
		rarity: 'rare',
		tag: '饼',
		skin: 'Aqua Fish_KZ',
		effect: { type: 'own_face', face: 2, chips: 144, mult: 1.5 }
	},
	{
		id: 'sanqiu',
		name: '灯下三秋',
		desc: '自己每有 1 颗 3 点：基础分 +145、得分 ×1.5',
		rarity: 'rare',
		tag: '灯',
		skin: 'glow_turtle',
		effect: { type: 'own_face', face: 3, chips: 145, mult: 1.5 }
	},
	{
		id: 'mantanghong',
		name: '满堂红',
		desc: '自己每有 1 颗 4 点：基础分 +80',
		rarity: 'rare',
		skin: 'Red',
		effect: { type: 'own_face', face: 4, chips: 80 }
	},
	{
		id: 'wugeng',
		name: '五更桂花',
		desc: '自己每有 1 颗 5 点：基础分 +144、得分 ×1.5',
		rarity: 'rare',
		tag: '桂',
		skin: 'Greeny',
		effect: { type: 'own_face', face: 5, chips: 144, mult: 1.5 }
	},
	{
		id: 'liuhe',
		name: '六合仙踪',
		desc: '自己每有 1 颗 6 点：基础分 +142、得分 ×1.5',
		rarity: 'rare',
		tag: '仙',
		skin: 'coala_phoenix',
		effect: { type: 'own_face', face: 6, chips: 142, mult: 1.5 }
	},

	// ==== 点数线套装(传说档):每颗翻倍,橙卡是这套的终点 ====
	{
		id: 'yiyang',
		name: '纯阳仙',
		desc: '四进、五子登科、六博黑：该等级基础分 ×2；掷出 3 个同点数：基础分 +90；自己每有 1 颗 1 点：基础分 +35、得分 ×2',
		rarity: 'legendary',
		tag: '仙',
		skin: 'clan_wheat',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'level_base_mult', levelIds: ['si_jin', 'wu_zi', 'liu_bo_hei'], value: 2 },
				{ type: 'same_face_chips', min: 3, chips: 90 },
				{ type: 'own_face', face: 1, chips: 35, mult: 2 }
			]
		}
	},
	{
		id: 'shuangbi',
		name: '桂璧生辉',
		desc: '四进、五子登科、六博黑：该等级基础分 ×2；掷出 3 个同点数：基础分 +90；自己每有 1 颗 2 点：基础分 +28、得分 ×2',
		rarity: 'legendary',
		tag: '桂',
		skin: 'OnyxNanami_AquaGreen',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'level_base_mult', levelIds: ['si_jin', 'wu_zi', 'liu_bo_hei'], value: 2 },
				{ type: 'same_face_chips', min: 3, chips: 90 },
				{ type: 'own_face', face: 2, chips: 28, mult: 2 }
			]
		}
	},
	{
		id: 'sanqing',
		name: '三清仙尊',
		desc: '四进、五子登科、六博黑：该等级基础分 ×2；掷出 3 个同点数：基础分 +90；自己每有 1 颗 3 点：基础分 +28、得分 ×2',
		rarity: 'legendary',
		tag: '仙',
		skin: 'IceWitch_Druid',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'level_base_mult', levelIds: ['si_jin', 'wu_zi', 'liu_bo_hei'], value: 2 },
				{ type: 'same_face_chips', min: 3, chips: 90 },
				{ type: 'own_face', face: 3, chips: 28, mult: 2 }
			]
		}
	},
	{
		id: 'jinhua',
		name: '月下金花',
		desc: '自己每有 1 颗 4 点：基础分 +320',
		rarity: 'legendary',
		tag: '月',
		skin: 'IceWitch_Sakura',
		effect: { type: 'own_face', face: 4, chips: 320 }
	},
	{
		id: 'wuyue',
		name: '五岳桂香',
		desc: '四进、五子登科、六博黑：该等级基础分 ×2；掷出 3 个同点数：基础分 +90；自己每有 1 颗 5 点：基础分 +21、得分 ×2',
		rarity: 'legendary',
		tag: '桂',
		skin: 'Green ray',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'level_base_mult', levelIds: ['si_jin', 'wu_zi', 'liu_bo_hei'], value: 2 },
				{ type: 'same_face_chips', min: 3, chips: 90 },
				{ type: 'own_face', face: 5, chips: 21, mult: 2 }
			]
		}
	},
	{
		id: 'liulong',
		name: '六龙仙驭',
		desc: '四进、五子登科、六博黑：该等级基础分 ×2；掷出 3 个同点数：基础分 +90；自己每有 1 颗 6 点：基础分 +21、得分 ×2',
		rarity: 'legendary',
		tag: '仙',
		skin: 'dragon 2',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'level_base_mult', levelIds: ['si_jin', 'wu_zi', 'liu_bo_hei'], value: 2 },
				{ type: 'same_face_chips', min: 3, chips: 90 },
				{ type: 'own_face', face: 6, chips: 21, mult: 2 }
			]
		}
	},

	//
	// 两种档位,机制只差一个 teamWide:
	//             就能把全队同流派摊开,不需要人手一张
	//
	// 5 张同流派时 ×(2^5)=32 → 一秀 (10+20)×32 = 960 > 状元 320。
	{
		id: 'yutuhui',
		name: '兔儿满堂',
		desc: '每拥有一个独特的「兔」系Tee：该 Tee 得分 ×1.42；每有 1 颗 4 点，该 Tee 基础分 +150',
		rarity: 'rare',
		tag: '兔',
		skin: 'BunnyViVi',
		effect: { type: 'per_tag', tag: '兔', per: 1.42, as: 'mult', chipsPerFour: 150 }
	},
	{
		id: 'guiyuan',
		name: '桂苑',
		desc: '每拥有一个独特的「桂」系Tee：该 Tee 得分 ×1.39；每有 1 颗 4 点，该 Tee 基础分 +150',
		rarity: 'rare',
		tag: '桂',
		skin: 'flower_crown_ghost',
		effect: { type: 'per_tag', tag: '桂', per: 1.39, as: 'mult', chipsPerFour: 150 }
	},
	{
		id: 'yuebingfang',
		name: '饼坊',
		desc: '每拥有一个独特的「饼」系Tee：该 Tee 得分 ×1.26；每有 1 颗 4 点，该 Tee 基础分 +150',
		rarity: 'rare',
		tag: '饼',
		skin: 'buni',
		effect: { type: 'per_tag', tag: '饼', per: 1.26, as: 'mult', chipsPerFour: 150 }
	},
	{
		id: 'dengzhen',
		name: '灯阵',
		desc: '每拥有一个独特的「灯」系Tee：该 Tee 得分 ×1.41；每有 1 颗 4 点，该 Tee 基础分 +150',
		rarity: 'rare',
		tag: '灯',
		skin: 'glow_axolotl',
		effect: { type: 'per_tag', tag: '灯', per: 1.41, as: 'mult', chipsPerFour: 150 }
	},
	{
		id: 'yuelun',
		name: '月轮',
		desc: '每拥有一个独特的「月」系Tee：该 Tee 得分 ×1.36；每有 1 颗 4 点，该 Tee 基础分 +150',
		rarity: 'rare',
		tag: '月',
		skin: 'cloud',
		effect: { type: 'per_tag', tag: '月', per: 1.36, as: 'mult', chipsPerFour: 150 }
	},
	{
		id: 'xianlv',
		name: '仙侣',
		desc: '每拥有一个独特的「仙」系Tee：该 Tee 得分 ×1.56；每有 1 颗 4 点，该 Tee 基础分 +150',
		rarity: 'rare',
		tag: '仙',
		skin: 'cammostripeangel',
		effect: { type: 'per_tag', tag: '仙', per: 1.56, as: 'mult', chipsPerFour: 150 }
	},
	{
		id: 'yutulinfan',
		name: '玉兔临凡',
		desc: '每拥有一个独特的「兔」系Tee：所有「兔」系 Tee 得分 ×1.42；每有 1 颗 4 点，该 Tee 基础分 +375',
		rarity: 'legendary',
		tag: '兔',
		skin: 'usagi',
		effect: { type: 'per_tag', tag: '兔', per: 1.42, as: 'mult', chipsPerFour: 375, teamWide: true }
	},
	{
		id: 'guidian',
		name: '桂殿',
		desc: '每拥有一个独特的「桂」系Tee：所有「桂」系 Tee 得分 ×1.39；每有 1 颗 4 点，该 Tee 基础分 +375',
		rarity: 'legendary',
		tag: '桂',
		skin: 'ghost_greensward',
		effect: { type: 'per_tag', tag: '桂', per: 1.39, as: 'mult', chipsPerFour: 375, teamWide: true }
	},
	{
		id: 'tuanyuanbing',
		name: '团圆饼',
		desc: '每拥有一个独特的「饼」系Tee：所有「饼」系 Tee 得分 ×1.26；每有 1 颗 4 点，该 Tee 基础分 +375',
		rarity: 'legendary',
		tag: '饼',
		skin: 'Mint Choco',
		effect: { type: 'per_tag', tag: '饼', per: 1.26, as: 'mult', chipsPerFour: 375, teamWide: true }
	},
	{
		id: 'changmingdeng',
		name: '长明灯',
		desc: '每拥有一个独特的「灯」系Tee：所有「灯」系 Tee 得分 ×1.41；每有 1 颗 4 点，该 Tee 基础分 +375',
		rarity: 'legendary',
		tag: '灯',
		skin: 'glow_cammo',
		effect: { type: 'per_tag', tag: '灯', per: 1.41, as: 'mult', chipsPerFour: 375, teamWide: true }
	},
	{
		id: 'taiyin',
		name: '太阴素月',
		desc: '每拥有一个独特的「月」系Tee：所有「月」系 Tee 得分 ×1.36；每有 1 颗 4 点，该 Tee 基础分 +375',
		rarity: 'legendary',
		tag: '月',
		skin: 'IceWitch_Queen',
		effect: { type: 'per_tag', tag: '月', per: 1.36, as: 'mult', chipsPerFour: 375, teamWide: true }
	},
	{
		id: 'qunxianhui',
		name: '群仙会',
		desc: '每拥有一个独特的「仙」系Tee：所有「仙」系 Tee 得分 ×1.56；每有 1 颗 4 点，该 Tee 基础分 +375',
		rarity: 'legendary',
		tag: '仙',
		skin: 'Drag Queen',
		effect: { type: 'per_tag', tag: '仙', per: 1.56, as: 'mult', chipsPerFour: 375, teamWide: true }
	},

	// ==== 丹系协同(仙拆出的第二派,控骰流) ====——
	{
		id: 'dantian',
		name: '丹田',
		desc: '每拥有一个独特的「丹」系Tee：该 Tee 得分 ×1.62；每有 1 颗 4 点，该 Tee 基础分 +150',
		rarity: 'rare',
		tag: '丹',
		skin: 'firecoala',
		effect: { type: 'per_tag', tag: '丹', per: 1.62, as: 'mult', chipsPerFour: 150 }
	},
	{
		id: 'liandanlu',
		name: '炼丹炉',
		desc: '每拥有一个独特的「丹」系Tee：所有「丹」系 Tee 得分 ×1.62；每有 1 颗 4 点，该 Tee 基础分 +375',
		rarity: 'legendary',
		tag: '丹',
		skin: 'iron_pot_o_gold',
		effect: { type: 'per_tag', tag: '丹', per: 1.62, as: 'mult', chipsPerFour: 375, teamWide: true }
	},
	// ==== 主 Tee 流:队友给「我」改骰子规则 ====
	//
	// 稀有度按「凑齐难度」排:1/6 普通、2/3/5 稀有。
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
		desc: '「我」掷出的 2 点视为 4 点；本关「我」每掷出 1 颗 2 点，该 Tee 的基础分 +250',
		rarity: 'rare',
		skin: 'green_stripe',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'map_player_die', from: 2, to: 4 },
				{ type: 'face_count_chips', face: 2, chips: 250 }
			]
		}
	},
	{
		id: 'xinyue',
		name: '朔日',
		desc: '「我」掷出的 3 点视为 4 点；本关「我」每掷出 1 颗 3 点，该 Tee 的基础分 +400',
		rarity: 'legendary',
		skin: 'IceWitch_Snow',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'map_player_die', from: 3, to: 4 },
				{ type: 'face_count_chips', face: 3, chips: 400 }
			]
		}
	},
	{
		id: 'sanxingzhao',
		name: '三星照',
		desc: '「我」掷出的 3 点视为 4 点；本关「我」每掷出 1 颗 3 点，该 Tee 的基础分 +250',
		rarity: 'rare',
		skin: 'sunwateregg',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'map_player_die', from: 3, to: 4 },
				{ type: 'face_count_chips', face: 3, chips: 250 }
			]
		}
	},
	{
		id: 'shangxian',
		name: '上弦',
		desc: '「我」掷出的 5 点视为 4 点；本关「我」每掷出 1 颗 5 点，该 Tee 的基础分 +250',
		rarity: 'rare',
		skin: 'IceWitch_DeerSakura',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'map_player_die', from: 5, to: 4 },
				{ type: 'face_count_chips', face: 5, chips: 250 }
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
	// R6 之后每卖一个都变成永久倍率,所以是典型的后期流派(越晚越强)。
	{
		id: 'yeshi',
		name: '夜市饼摊',
		desc: '集市内若有卖出 Tee：下回合该 Tee 总分得分 ×2',
		rarity: 'rare',
		tag: '饼',
		skin: 'Lan_Pudding',
		effect: { type: 'next_round_sell_mult', mult: 2 }
	},
	{
		id: 'dazhanggui',
		name: '饼铺掌柜',
		desc: '该 Tee 每累计卖出 1 个 Tee：基础分 +75；队伍里没有「我」时，回合结算队伍总分得分 ×2.5',
		rarity: 'legendary',
		tag: '饼',
		skin: 'biscuit',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'sold_chips', per: 75 },
				{ type: 'no_me_team_mult', mult: 2.5 }
			]
		}
	},
	// ==== 重掷流:重掷越多越强,和「多投掷」配装联动 ====
	{
		id: 'kuaiyu',
		name: '快雨',
		desc: '本回合每重掷 1 颗骰子：得分 ×1.26',
		rarity: 'common',
		skin: 'mermydon_glow',
		effect: { type: 'per_reroll', mult: 1.26 }
	},
	{
		id: 'jinchan',
		name: '仙蟾',
		desc: '掷完可发动：该 Tee 总分得分 ×3（冷却 3 关）',
		rarity: 'legendary',
		tag: '仙',
		skin: 'royal_turtle',
		effect: { type: 'active', skill: 'mult', mult: 3, cooldown: 3 }
	},
	{
		id: 'fagui',
		name: '伐桂',
		desc: '右侧 Tee 基础分 +800',
		rarity: 'legendary',
		tag: '桂',
		skin: 'Green person',
		effect: { type: 'neighbor', side: 'right', chips: 800 }
	},
	{
		id: 'shilun',
		name: '九转丹',
		desc: '掷完可发动：本关重新掷过（冷却 4 关）',
		rarity: 'legendary',
		tag: '丹',
		skin: 'lan_coki',
		effect: { type: 'active', skill: 'retry', cooldown: 4 }
	},

	//
	// 卡面文字逐字成立,「掷得越烂越赚」才是真的。
	{
		id: 'kuiyue',
		name: '亏月',
		desc: '基础分替换为（100，每关 +5 − 基础分）；自己掷出的 1 视为 4',
		rarity: 'common',
		tag: '月',
		skin: 'Whitetee Small',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'reverse', base: 100, perRound: 5 },
				{ type: 'self_mods', mods: { map: { 1: 4 } } }
			]
		}
	},
	{
		// 稀有 = 改点型:掷完后必须自己挑一颗骰子改成 2 点(压等级的操作)
		// 逆向的惩罚系数就是 −1(净值整个减掉),三档逆向卡的强弱差在 base / perRound 上
		id: 'queyue',
		name: '缺月',
		desc: '基础分替换为（170，每关 +50 − 基础分）；掷完后把 1 颗未作废的骰子改为 2 点；自己掷出的 6 视为 4',
		rarity: 'rare',
		tag: '月',
		skin: 'darkforce',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'reverse', base: 170, perRound: 50 },
				{ type: 'set_point', count: 1, point: 2 },
				{ type: 'self_mods', mods: { map: { 6: 4 } } }
			]
		}
	},
	{
		// 会把你打成负分,所以给你一颗可以自己挑的骰子去压等级。真正的压制仍然靠
		// 「空四」(自己 4 点作废,便宜普通、能囤)。
		id: 'canyue',
		name: '残月',
		desc: '基础分替换为（320，每关 +100 − 基础分）；掷完后把 1 颗未作废的骰子改为 3 点；自己掷出的 5 视为 4',
		rarity: 'legendary',
		tag: '月',
		skin: 'IceWitch_Halloween',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'reverse', base: 320, perRound: 100 },
				{ type: 'set_point', count: 1, point: 3 },
				{ type: 'self_mods', mods: { map: { 5: 4 } } }
			]
		}
	},
	// 就是自伤卡,所以它刻意做成便宜普通,让玩家前期就能囤起来等后期。
	{
		id: 'kongsi',
		name: '空四',
		desc: '自己掷出的 4 点作废；未作废的每颗骰子：基础分 +25',
		rarity: 'common',
		skin: 'Black Hole',
		effect: {
			type: 'bundle',
			parts: [
				{ type: 'self_mods', mods: { void: [4] } },
				{ type: 'live_die_chips', per: 25 }
			]
		}
	}
];

export const CARD_BY_ID = new Map(CARDS.map((c) => [c.id, c]));

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
