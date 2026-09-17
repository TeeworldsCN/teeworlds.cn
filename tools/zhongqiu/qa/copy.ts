// 文案 ↔ 实现 对账
//
// 背景:之前体检只查「文案里的数字在效果里是否存在」,查不出两种情况:
//   ① 语义错了但数字凑巧对得上(R1 的「每超 1000 分」—— 实现早改成按目标比例,文案没跟上)
//   ② 效果做了 N 件事,文案只写了 1 件(例如 extra_roll 是「+1 次」但文案写「投掷 3 次」,
//      依赖 BASE_ROLLS=2 这个隐含前提,基线一改文案就变成谎话)
//
// 做法:把每个效果翻译成一组「必须提到的主张」(requirement groups,组内是可选说法),
// 再把文案解析成它实际提到的主张集合,双向对账:
//   · 漏说(missing) —— 效果有、文案没写 → 玩家不知道卡在干什么
//   · 多说(extra)   —— 文案写了、效果里找不到 → 幽灵数字/幽灵机制
//
// 用法: bun run tools/zhongqiu/qa/copy.ts
import {
	CARDS,
	type Cond,
	type DiceMods,
	type TeeEffect,
	type Tag
} from '../../../src/lib/teecards';
import { BUFF_CARDS, type BuffEffect } from '../../../src/lib/items';
import { BASE_ROLLS } from '../../../src/lib/game';
import { judgeRoll, ROLL_LEVELS, sampleDice } from '../../../src/lib/midautumn';
import { LEVEL_LADDER } from '../../../src/lib/teecards';

const lvName = (id: string) => ROLL_LEVELS.find((l) => l.id === id)?.name ?? id;

/** 组内任一说法命中即算满足 */
interface Group {
	alts: string[];
	why: string;
}

const partGroups = (chips: number | undefined, mult: number | undefined): Group[] => [
	...(chips !== undefined ? [{ alts: [`add:${chips}`], why: '+chips' }] : []),
	...(mult !== undefined ? [{ alts: [`mul:${mult}`], why: '×mult' }] : [])
];

const modsGroups = (mods: DiceMods): Group[] => {
	const g: Group[] = [];
	if (mods.map)
		for (const [from, to] of Object.entries(mods.map))
			g.push({ alts: [`map:${from}>${to}`], why: '点数映射' });
	if (mods.shift !== undefined) g.push({ alts: [`shift:${mods.shift}`], why: '点数位移' });
	if (mods.void?.length)
		for (const f of mods.void) g.push({ alts: [`void:${f}`], why: '该点数作废' });
	return g;
};

const condAlts = (c: Cond): string[] =>
	c.endsWith('_plus') ? [`level_ge:${c.slice(0, -5)}`] : [`level_is:${c}`];

/** 效果 → 必须提到的主张 */
function teeReq(e: TeeEffect): Group[] {
	switch (e.type) {
		case 'chips':
			return [{ alts: [`add:${e.value}`], why: '+chips' }];
		case 'mult':
			return [{ alts: [`mul:${e.value}`], why: '×mult' }];
		case 'chips_mult':
			return partGroups(e.chips, e.mult);
		case 'cond':
			return [
				{ alts: condAlts(e.cond), why: `条件 ${lvName(e.cond.replace('_plus', ''))}` },
				...partGroups(e.chips, e.mult)
			];
		case 'team_mult':
			return [
				{ alts: ['kw:team_total'], why: '全队总分' },
				{ alts: [`mul:${e.value}`], why: '×mult' }
			];
		case 'team_chips':
			return [
				{ alts: ['kw:team'], why: '全队' },
				{ alts: [`add:${e.value}`], why: '+chips' }
			];
		case 'per_team_chips':
			return [
				{ alts: ['kw:per_tee'], why: '队伍人数 ×' },
				{ alts: [`add:${e.value}`], why: '+chips' }
			];
		case 'scaling_mult':
			return [
				{ alts: ['kw:per_round'], why: '每关成长' },
				{ alts: [`mulcharge:${e.per}`], why: '每关 mult 增量' }
			];
		case 'economy':
			return [
				{ alts: ['kw:per_round'], why: '每关' },
				{ alts: [`perround:${e.per}`], why: '每关 +N 月饼币' },
				{ alts: [`coin:${e.per}`], why: '月饼币' }
			];
		case 'interest':
			return [
				{ alts: ['kw:per_round'], why: '每关' },
				{ alts: [`perround:${e.per}`], why: '每关 +N 月饼币' },
				{ alts: [`coinhold:${e.perCoins}`], why: '每 N 币' },
				{ alts: [`coin:${e.per}`], why: '月饼币' }
			];
		case 'extra_roll':
			return [
				{
					alts: [`totalroll:${BASE_ROLLS + e.count}`, `extraroll:${e.count}`],
					why: `多投掷 ${e.count} 次(合计 ${BASE_ROLLS + e.count} 次)`
				}
			];
		case 'set_point':
			return [
				{ alts: [`dice:${e.count}`], why: '改点颗数' },
				{ alts: [`point:${e.point}`], why: '改成几点' }
			];
		case 'set_any':
			return [{ alts: [`dice:${e.count}`], why: '改点颗数' }];
		case 'level_up':
			return [{ alts: [`levelup:${e.count}`], why: '等级提升档数' }];
		case 'self_mods':
			return modsGroups(e.mods);
		case 'copy_right':
			return [
				{ alts: ['kw:copy', 'kw:right'], why: '复制右侧' },
				...(e.mult ? [{ alts: [`mul:${e.mult}`], why: '复制后额外倍率' }] : [])
			];
		case 'reroll_all_on_none':
			return [
				{ alts: ['kw:reroll_all'], why: '自动重掷全部' },
				{ alts: ['level_is:none'], why: '再接再厉时触发' }
			];
		case 'own_face':
			return [
				{ alts: [`ownface:${e.face}`], why: `统计自己的 ${e.face} 点数量` },
				...(e.multByCount ? [{ alts: [`mulbycount:${e.face}`], why: '倍率 = 该点数颗数' }] : []),
				...partGroups(e.chips, e.mult)
			];
		case 'per_reroll':
			return [{ alts: ['kw:per_reroll'], why: '按重掷颗数' }, ...partGroups(e.chips, e.mult)];
		case 'reverse':
			return [
				{ alts: [`reverse:${e.base}`], why: '逆向:基础分减掷骰分' },
				...(e.perRound
					? [
							{ alts: [`perround:${e.perRound}`], why: '基础分每关成长' },
							{ alts: ['kw:per_round'], why: '每关成长' }
						]
					: [])
			];
		case 'straight_ladder':
			return [
				{ alts: ['kw:straight'], why: '连号阶梯' },
				{ alts: ['level_is:yi_xiu', 'level_is:er_ju', 'level_is:si_jin'], why: '3/4/5 颗对应档位' }
			];
		case 'straight_chips':
			return [{ alts: ['kw:straight'], why: '统计连号颗数' }, ...partGroups(e.per, undefined)];
		case 'map_player_die':
			return [
				{ alts: ['kw:me'], why: '只作用于「我」' },
				{ alts: [`map:${e.from}>${e.to}`], why: '「我」的点数映射' }
			];
		case 'sell_scale':
			return [{ alts: [`mul:${e.per}`], why: '每个卖出 Tee 的倍率' }];
		case 'face_ladder':
			return [{ alts: ['kw:faceladder', 'face:4'], why: '点数阶梯:同点 n 颗按 4 点线档位' }];
		case 'team_scale':
			return [
				{ alts: ['kw:per_tee'], why: '按队伍人数' },
				{ alts: [`mul:${e.per}`], why: '队伍人数倍率' },
				...(e.fullBonus ? [{ alts: [`mul:${e.fullBonus}`], why: '满编奖励' }] : [])
			];
		case 'coin_mult':
			return [
				{ alts: [`coinhold:${e.perCoin}`], why: '按月饼币数量' },
				{ alts: [`mul:${e.per}`], why: '月饼币倍率' }
			];
		case 'growth_mult':
			return [
				{ alts: ['kw:per_round'], why: '每过一关' },
				{ alts: [`mul:${1 + e.per}`, `mul:${e.per}`], why: '每关成长倍率' }
			];
		case 'relay_left':
			return [{ alts: ['kw:relay'], why: '接力左侧相邻得分' }];
		case 'sum_mult':
			return [{ alts: [`mul:${e.per}`], why: '和值倍率' }];
		case 'active': {
			const cd = { alts: [`cooldown:${e.cooldown}`], why: '冷却回合' };
			if (e.skill === 'chips')
				return [
					{ alts: [`activechips:${e.value}`, `add:${e.value}`], why: '发动加分' },
					{ alts: ['kw:active'], why: '掷完可发动' },
					cd
				];
			if (e.skill === 'left_chips')
				return [
					{ alts: [`activeleft:${e.value}`, `add:${e.value}`], why: '给左侧加分' },
					{ alts: ['kw:active'], why: '掷完可发动' },
					{ alts: ['kw:left'], why: '左侧 Tee' },
					cd
				];
			return [
				{ alts: ['kw:active_retry', 'kw:team'], why: '本关重新掷过(全队重掷)' },
				{ alts: ['kw:active'], why: '掷完可发动' },
				cd
			];
		}
		case 'sum_chips':
			return [
				{ alts: ['kw:sum'], why: '点数和' },
				{ alts: [`mulcharge:${e.per}`, `mul:${e.per}`], why: '点数和倍率' }
			];
		case 'neighbor':
			return [
				{
					alts: [
						e.side === 'left' ? 'kw:left' : e.side === 'right' ? 'kw:right' : 'kw:both',
						'kw:neighbor'
					],
					why: `相邻(${e.side})`
				},
				...partGroups(e.chips, e.mult)
			];
		case 'per_buff':
			return [
				{ alts: ['kw:per_buff'], why: '每张加成卡' },
				...(e.as === 'chips'
					? [{ alts: [`add:${e.per}`], why: '+chips' }]
					: [{ alts: [`mulcharge:${e.per}`, `mul:${e.per}`], why: '×mult 增量' }])
			];
		case 'per_tag':
			return [
				{ alts: [`kw:per_tag:${e.tag}`], why: `每张 ${e.tag} 流派卡` },
				...(e.as === 'chips'
					? [{ alts: [`add:${e.per}`], why: '+chips' }]
					: [{ alts: [`mulcharge:${e.per}`, `mul:${e.per}`], why: '×mult 增量' }]),
				...(e.chips ? [{ alts: [`add:${e.chips}`], why: '底分' }] : [])
			];
		case 'on_player':
			return [
				{ alts: ['kw:me'], why: '「我」的主 Tee' },
				{ alts: condAlts(e.cond), why: `条件 ${lvName(e.cond.replace('_plus', ''))}` },
				...(e.teamWide ? [{ alts: ['kw:team'], why: '全队生效' }] : []),
				...partGroups(e.chips, e.mult)
			];
		case 'player_die':
			return [
				{ alts: ['kw:me'], why: '「我」的主 Tee' },
				{ alts: [`face:${e.face}`], why: '点数' },
				...partGroups(e.chips, e.mult)
			];
		case 'bundle':
			return e.parts.flatMap(teeReq);
	}
}

/** 低压道具:desc 里必须说清「没用掉就归还」 */
const refundGroup = (c: { refund?: boolean }): Group[] =>
	c.refund ? [{ alts: ['kw:refund'], why: '未使用则归还' }] : [];

function buffReq(e: BuffEffect): Group[] {
	switch (e.type) {
		case 'chips':
			return [{ alts: [`add:${e.value}`], why: '+chips' }];
		case 'mult':
			return [{ alts: [`mul:${e.value}`], why: '×mult' }];
		case 'chips_mult':
			return partGroups(e.chips, e.mult);
		case 'level_floor':
			return [{ alts: [`level_ge:${e.levelId}`], why: `保底 ${lvName(e.levelId!)}` }];
		case 'reverse':
			return [
				{ alts: [`reverse:${e.base}`], why: '逆向:基础分减掷骰分' },
				...(e.perRound
					? [
							{ alts: [`perround:${e.perRound}`], why: '基础分每关成长' },
							{ alts: ['kw:per_round'], why: '每关成长' }
						]
					: [])
			];
		case 'own_face':
			return [
				{ alts: [`ownface:${e.face}`], why: `统计该 Tee 的 ${e.face} 点数量` },
				...partGroups(e.chips, e.mult)
			];
		case 'bump_point':
			return [
				{ alts: [`dice:${e.count ?? 1}`], why: '改点颗数' },
				{ alts: ['kw:bump', 'shift:1'], why: '点数 +1' }
			];
		case 'bundle':
			return (e.parts ?? []).flatMap(buffReq);
		case 'cond':
			return [
				{ alts: condAlts(e.cond), why: `条件 ${lvName(e.cond.replace('_plus', ''))}` },
				...partGroups(e.chips, e.mult)
			];
		case 'clear_void':
			return [
				{ alts: ['kw:clear_void'], why: '解除作废' },
				{ alts: ['kw:void'], why: '点数作废' }
			];
		case 'roll':
			return [
				{ alts: [`extraroll:${e.count}`, `totalroll:${BASE_ROLLS + e.count!}`], why: '额外投掷' }
			];
		case 'set_point':
			return [
				{ alts: [`dice:${e.count}`], why: '改点颗数' },
				{ alts: [`point:${e.point}`], why: '改成几点' }
			];
		case 'set_any':
			return [{ alts: [`dice:${e.count}`], why: '改点颗数' }];
		case 'dice_mods':
			return [
				...modsGroups(e.mods!),
				...(e.mods?.void?.length ? [{ alts: ['kw:void'], why: '作废点数' }] : [])
			];
		case 'sum_chips':
			return [
				{ alts: ['kw:sum'], why: '点数和' },
				{ alts: [`mulcharge:${e.per}`, `mul:${e.per}`], why: '点数和倍率' }
			];
	}
}

// ---------- 文案 → 主张 ----------

const LEVEL_IDS = ROLL_LEVELS.map((l) => l.id);
const levelByName = new Map(ROLL_LEVELS.map((l) => [l.name, l.id]));
const TAG_NAMES: Record<Tag, string> = {
	兔: '兔',
	桂: '桂',
	饼: '饼',
	灯: '灯',
	月: '月',
	仙: '仙'
};

const norm = (t: string) =>
	t
		.replace(/[（）]/g, '')
		.replace(/[，、]/g, ',')
		.replace(/[＋]/g, '+')
		.replace(/[×✕x]/g, '×')
		.replace(/\s+/g, '');

/** 解析文案实际提到的主张 */
function textClaims(raw: string): Set<string> {
	const t = norm(raw);
	const out = new Set<string>();

	// +N / ×N(+N 后面跟量词时不是 +chips,如「+1 档」「+3 月饼币」)
	const UNITS = '档|次|颗|关|人|张|个月饼币|月饼币|币|倍|点|个';
	for (const m of t.matchAll(new RegExp(`\\+(\\d+(?:\\.\\d+)?)(?!\\s*(?:${UNITS}))`, 'g'))) {
		if (/倍率$/.test(t.slice(0, m.index))) continue; // 「倍率 +1」不是 +chips
		if (/点数$/.test(t.slice(0, m.index))) continue; // 「点数 +1」是改点(shift),不是 +chips
		if (/每关$/.test(t.slice(0, m.index))) continue; // 「每关 +N」是成长增量(perround)
		out.add(`add:${+m[1]}`);
	}
	// 「每关 +N」是成长/逆向的每关增量,不是一次性 +chips
	for (const m of t.matchAll(/每关\+(\d+)/g)) out.add(`perround:${+m[1]}`);
	// 负分:「得分 −20」/「得分 -20」
	for (const m of t.matchAll(/得分\s*[−-]\s*(\d+(?:\.\d+)?)/g)) out.add(`add:${-+m[1]}`);
	// 点数线蓝卡:倍率 = 该点数颗数
	for (const m of t.matchAll(/(?:总分|得分)再?×(\d)点数量/g)) out.add(`mulbycount:${+m[1]}`);
	for (const m of t.matchAll(/×(\d+(?:\.\d+)?)/g)) {
		const before = t.slice(Math.max(0, m.index! - 5), m.index!);
		if (/队伍人数|倍率\+?/.test(before)) continue; // 「人数×12」「倍率+2」不是 ×mult
		if (/点数量/.test(t.slice(m.index! + m[0].length, m.index! + m[0].length + 4))) continue; // 「×1 点数量」是颗数倍率
		out.add(`mul:${+m[1]}`);
	}

	// 增量写法:只认「倍率 +N」/「×+N」
	for (const m of t.matchAll(/倍率[+＋](\d+(?:\.\d+)?)|×\+(\d+(?:\.\d+)?)/g))
		out.add(`mulcharge:${+(m[1] ?? m[2])}`);

	// 等级名(及其「及以上」)
	for (const [name, id] of levelByName) {
		for (let i = t.indexOf(name); i >= 0; i = t.indexOf(name, i + 1)) {
			const before = t.slice(Math.max(0, i - 6), i);
			const after = t.slice(i + name.length, i + name.length + 4);
			const floor = /最低|至少|保底/.test(before);
			const isCond = floor || /掷出|判定|中$/.test(before) || /及以上|时|^[:：,]/.test(after);
			const isUpgrade = /提升|判定等级/.test(before + after) && /档/.test(after);
			if (isUpgrade) continue; // 「判定等级 +1 档」不是条件
			if (isCond)
				out.add(
					/及以上|最低|至少|保底/.test(after + before) || floor
						? `level_ge:${id}`
						: `level_is:${id}`
				);
		}
	}
	// 等级提升档数 / 保底
	for (const m of t.matchAll(/等级[^0-9]{0,6}(\d+)档|提升(\d+)档/g))
		out.add(`levelup:${+(m[1] ?? m[2])}`);

	// 投掷次数
	for (const m of t.matchAll(/投掷(\d+)次|掷(\d+)次/g)) {
		//「多/额外/再投掷 N 次」和「少掷 N 次」都不是「总共投掷 N 次」
		if (/多$|额外$|再$|少$/.test(t.slice(Math.max(0, m.index! - 1), m.index!))) continue;
		out.add(`totalroll:${+(m[1] ?? m[2])}`);
	}
	for (const m of t.matchAll(/多投掷(\d+)次|额外投掷(\d+)次|再投掷(\d+)次/g))
		out.add(`extraroll:${+(m[1] ?? m[2] ?? m[3])}`);

	// 点数映射 / 位移
	const mapped: number[] = []; // 「视为」用掉的数字位置,避免再被当成点数
	for (const m of t.matchAll(/(?:^|[^0-9])((\d)点?视为(\d)点?)/g)) {
		out.add(`map:${+m[2]}>${+m[3]}`);
		mapped.push(m.index!);
	}
	if (mapped.length === 0) for (const m of t.matchAll(/视为(\d+)/g)) out.add(`map:4>${+m[1]}`);
	for (const m of t.matchAll(/点数([+-])(\d+)/g)) out.add(`shift:${m[1] === '-' ? -1 : 1 * +m[2]}`);

	// 点数统计:「每有 1 颗 6」/「自己的 6 每颗」/「每颗 3 点」
	for (let f = 1; f <= 6; f++) {
		if (new RegExp(`每有1?颗${f}|每颗${f}|${f}点每颗|自己的${f}点(?!视为)`).test(t))
			out.add(`ownface:${f}`);
	}
	// 重掷流
	if (/每重掷1颗|重掷1颗骰子/.test(t)) out.add('kw:per_reroll');
	// 低压道具:未使用则归还
	if (/没用掉就归还|未使用则归还|未使用就归还|归还库存/.test(t)) out.add('kw:refund');

	// 点数 +1(月牙尺)
	if (/它的点数\s*\+\s*1|点数\+1/.test(t)) out.add('kw:bump');

	// 充能技能
	if (/掷完可发动|可发动/.test(t)) out.add('kw:active');
	if (/本关重新掷过|全队重掷/.test(t)) out.add('kw:active_retry');
	if (/左侧/.test(t)) out.add('kw:left');
	for (const m of t.matchAll(/冷却(\d+)关/g)) out.add(`cooldown:${+m[1]}`);
	for (const m of t.matchAll(/本Tee\+(\d+)|左侧Tee\+(\d+)/g))
		out.add(m[1] ? `activechips:${+m[1]}` : `activeleft:${+m[2]}`);

	// 连号流:「连号」+ 每颗加分
	if (/连号/.test(t)) out.add('kw:straight');
	if (/每卖出/.test(t)) out.add('kw:sellscale');
	// 点数阶梯 / 接力
	if (/点数阶梯|同点.*档位/.test(t)) out.add('kw:faceladder');
	if (/加到本Tee|相邻得分的\d+%/.test(t)) out.add('kw:relay');

	// 逆向:得分 = N − 本次掷骰分
	for (const m of t.matchAll(/得分=(\d+)(?:\+每关\+\d+)?[−-]/g)) out.add(`reverse:${+m[1]}`);

	// 解除作废(月食卡)
	if (/不受点数作废|解除作废|作废的点数照常|不再作废/.test(t)) out.add('kw:clear_void');
	if (/作废/.test(t)) out.add('kw:void');

	// 作废点数:「掷出的 6 作废」/「6 无效」
	for (let f = 1; f <= 6; f++)
		if (new RegExp(`(掷出的)?${f}(点)?(本关)?(作废|无效)`).test(t)) out.add(`void:${f}`);
	// 同点组合整档不作数(暗月)
	if (/同点组合[^。]{0,4}不作数|凑不成同点|无法凑同点/.test(t)) out.add('kw:no_same_face');

	// 等级封顶(血月)
	for (const [name, id] of levelByName)
		if (new RegExp(`封顶到${name}|最高只算${name}|最高算到${name}`).test(t)) out.add(`cap:${id}`);

	// 投掷次数减少(疾月)
	for (const m of t.matchAll(/少掷(\d+)次|投掷次数-(\d)/g)) out.add(`rollminus:${+(m[1] ?? m[2])}`);

	// 骰子颗数 / 点名(「每有 1 颗 6」「每重掷 1 颗」是计数对象,不是改点颗数)
	for (const m of t.matchAll(/(\d+)颗/g)) {
		const before = t.slice(Math.max(0, m.index! - 4), m.index!);
		if (/每有|每$|重掷|颗$|连号/.test(before)) continue;
		// 「连号 3 颗算一秀」里的颗数是档位说明,不是改点颗数
		if (/^算/.test(t.slice(m.index! + m[0].length))) continue;
		out.add(`dice:${+m[1]}`);
	}
	for (const m of t.matchAll(/为(\d)点/g)) {
		if (/视$/.test(t.slice(Math.max(0, m.index! - 1), m.index!))) continue; // 「视为 N 点」
		if (+m[1] >= 1 && +m[1] <= 6) out.add(`point:${+m[1]}`);
	}
	// 点面:「N 点」且不是「改为 N 点」/「视为 N 点」
	for (const m of t.matchAll(/(\d)点/g)) {
		const at = m.index!;
		const around = t.slice(Math.max(0, at - 4), at + 8);
		if (/为|成|视为/.test(around)) continue;
		if (+m[1] >= 1 && +m[1] <= 6) out.add(`face:${+m[1]}`);
	}
	for (const m of t.matchAll(/每个(\d)|掷出(\d)/g)) out.add(`face:${+(m[1] ?? m[2])}`);

	// 月饼币
	for (const m of t.matchAll(/每(?:持有)?(\d+)月饼币|每(?:持有)?(\d+)币/g))
		out.add(`coinhold:${+(m[1] ?? m[2])}`);
	for (const m of t.matchAll(/每关\+?(\d+)月饼币|每回合\+?(\d+)月饼币/g))
		out.add(`coin:${+(m[1] ?? m[2])}`);

	// 关键词
	if (/全队总分|总分/.test(t)) out.add('kw:team_total');
	else if (/全队/.test(t)) out.add('kw:team');
	if (/每多1(?:个|人|名)Tee|每多1人|队伍每多|队伍人数×|队伍人数\*/.test(t)) out.add('kw:per_tee');
	if (/队伍人数×|队伍人数\*/.test(t)) {
		const m = t.match(/队伍人数[×*](\d+(?:\.\d+)?)/);
		if (m) out.add(`add:${+m[1]}`);
	}
	if (/每关|每过一关|每回合结束|每层/.test(t)) out.add('kw:per_round');
	if (/复制右侧|复制右方/.test(t)) out.add('kw:copy');
	if (/自动重掷|重掷全部/.test(t)) out.add('kw:reroll_all');
	if (/点数和/.test(t)) out.add('kw:sum');
	if (/每张加成卡|每张道具卡/.test(t)) out.add('kw:per_buff');
	if (/左侧|左边/.test(t)) out.add('kw:left');
	if (/右侧|右边/.test(t)) out.add('kw:right');
	if (/左右|相邻|两边/.test(t)) out.add('kw:both');
	if (/相邻/.test(t)) out.add('kw:neighbor');
	if (/我掷出|「我」|我的骰子|我每/.test(t)) out.add('kw:me');
	for (const tag of Object.keys(TAG_NAMES) as Tag[])
		if (new RegExp(`每张[^,]{0,6}${tag}|${tag}流派|每张${tag}卡`).test(t))
			out.add(`kw:per_tag:${tag}`);

	return out;
}

// ---------- 对账 ----------

const ALT_LEVEL_TAGS = new Set(['kw:both', 'kw:neighbor']); // 「左右相邻」一个词满足 two 个主张

function audit(label: string, desc: string, reqs: Group[]) {
	const claims = textClaims(desc);
	const missing: string[] = [];
	const usedAlts = new Set<string>();

	for (const g of reqs) {
		const hit = g.alts.find((a) => claims.has(a));
		if (hit) usedAlts.add(hit);
		else if (
			g.alts.some((a) => ALT_LEVEL_TAGS.has(a)) &&
			[...claims].some((c) => ALT_LEVEL_TAGS.has(c))
		)
			usedAlts.add(g.alts[0]);
		else missing.push(`${g.why} (需 ${g.alts.join(' 或 ')})`);
	}

	// 文案里出现、但效果里找不到解释的数字/机制
	const explained = new Set<string>([...reqs.flatMap((g) => g.alts), ...usedAlts]);
	// 「N 作废」里的 N 是牌面,不算幽灵主张
	for (const g of reqs)
		for (const a of g.alts) if (a.startsWith('void:')) explained.add(`face:${a.slice(5)}`);
	// 「每有 1 颗 6」里的 6 是统计对象,不算幽灵牌面
	for (const g of reqs)
		for (const a of g.alts) if (a.startsWith('ownface:')) explained.add(`face:${a.slice(8)}`);
	const extra = [...claims].filter((c) => {
		if (explained.has(c)) return false;
		// 数值等价的说法互换(总投掷数 ↔ 额外次数)
		const n = c.split(':')[1];
		if (c.startsWith('totalroll:')) return !explained.has(`extraroll:${+n - BASE_ROLLS}`);
		if (c.startsWith('extraroll:')) return !explained.has(`totalroll:${+n + BASE_ROLLS}`);
		// 等级「及以上」与精确等级互为解释
		if (c.startsWith('level_ge:')) return !explained.has(`level_is:${c.split(':')[1]}`);
		if (c.startsWith('levelup:')) return !explained.has(`levelup:${n}`);
		return true;
	});

	if (missing.length || extra.length) {
		console.log(`\n✗ ${label}`);
		console.log(`   文案: ${desc}`);
		if (missing.length) console.log(`   漏说: ${missing.join(' | ')}`);
		if (extra.length) console.log(`   多说: ${extra.join(' ')}`);
		return 1;
	}
	return 0;
}

let bad = 0;

// 卡池重名检查:卡名是玩家唯一的检索线索,重名会让两张不同的卡看起来像同一张。
// (踩过一次:新加的充能卡撞了老卡的名字)
const byName = new Map<string, string[]>();
for (const c of [...CARDS, ...BUFF_CARDS])
	byName.set(c.name, [...(byName.get(c.name) ?? []), c.rarity]);
const dups = [...byName.entries()].filter(([, rs]) => rs.length > 1);
console.log(`=== 卡名唯一性 (${byName.size} 个名字) ===`);
if (dups.length === 0) console.log('全部通过 ✓');
else for (const [n, rs] of dups) console.log(`✗ 重名 「${n}」:${rs.join(' / ')}`);
bad += dups.length;

// id 唯一性:id 是 cardOf()/growth/复制 等一切查表的键,重复会让「选中的卡」和
// 「入队的卡」变成两张不同的卡(踩过一次:集市选拾月,进队伍的是孤月,皮肤名字全变)
const byId = new Map<string, string[]>();
for (const c of [...CARDS, ...BUFF_CARDS]) byId.set(c.id, [...(byId.get(c.id) ?? []), c.name]);
const dupIds = [...byId.entries()].filter(([, ns]) => ns.length > 1);
console.log(`\n=== id 唯一性 (${byId.size} 个 id) ===`);
if (dupIds.length === 0) console.log('全部通过 ✓');
else for (const [id, ns] of dupIds) console.log(`✗ id 重复 「${id}」:${ns.join(' / ')}`);
bad += dupIds.length;

console.log(`\n=== Tee 卡 (${CARDS.length}) ===`);
for (const c of CARDS) bad += audit(`${c.id} 「${c.name}」`, c.desc, teeReq(c.effect));
console.log(`\n=== 加成卡 (${BUFF_CARDS.length}) ===`);
for (const c of BUFF_CARDS)
	bad += audit(`${c.id} 「${c.name}」`, c.desc, [...buffReq(c.effect), ...refundGroup(c)]);

// ---------- Boss 描述 ----------
import {
	BOSSES,
	BASE_ROLLS as BR,
	overflowReward,
	isBossRound,
	TEAM_LIMIT
} from '../../../src/lib/game';
import { readFileSync } from 'node:fs';

function bossReq(b: (typeof BOSSES)[number]): Group[] {
	const g: Group[] = [];
	// ×1 等于没改,不要求文案里写出来
	if (b.targetMult && b.targetMult !== 1)
		g.push({ alts: [`mul:${b.targetMult}`], why: '目标分数倍率' });
	if (b.mods?.map)
		for (const [from, to] of Object.entries(b.mods.map))
			g.push({ alts: [`map:${from}>${to}`], why: '点数映射' });
	if (b.mods?.shift !== undefined) g.push({ alts: [`shift:${b.mods.shift}`], why: '点数位移' });
	// 作废点数:Boss 描述必须点名是哪几个点数作废
	if (b.mods?.void?.length)
		for (const f of b.mods.void) g.push({ alts: [`void:${f}`, 'kw:void'], why: `${f} 点作废` });
	if (b.mods?.noSameFace) g.push({ alts: ['kw:no_same_face'], why: '同点组合不作数' });
	if (b.mods?.levelCap) {
		g.push({ alts: [`cap:${b.mods.levelCap}`], why: '等级封顶' });
		// 「封顶到 X」天然意味着「X 以上都不算」,把这一档也标成已解释
		const i = LEVEL_LADDER.indexOf(b.mods.levelCap as (typeof LEVEL_LADDER)[number]);
		const above = i >= 0 ? LEVEL_LADDER[i + 1] : undefined;
		if (above)
			g.push({ alts: [`level_ge:${above}`, `cap:${b.mods.levelCap}`], why: '封顶以上不算' });
	}
	if (b.rollsBonus && b.rollsBonus < 0)
		g.push({ alts: [`rollminus:${-b.rollsBonus}`], why: '少掷次数' });
	if (b.rollsBonus && b.rollsBonus > 0)
		g.push({ alts: [`extraroll:${b.rollsBonus}`], why: '多投掷次数' });
	return g;
}

console.log(`\n=== Boss (${BOSSES.length}) ===`);
bad = 0;
for (const b of BOSSES) bad += audit(`boss:${b.id} 「${b.name}」`, b.desc, bossReq(b));
if (bad === 0) console.log('全部通过 ✓');

// ---------- 页面文案 ↔ 代码常量 ----------
const page = readFileSync(
	new URL('../../../src/routes/zhongqiu/+page.svelte', import.meta.url),
	'utf8'
);
const txt = (s: string) =>
	s
		.replace(/<[^>]+>/g, '')
		.replace(/&[a-z]+;/g, '')
		.replace(/\s+/g, '');
const rules = txt((page.match(/①[\s\S]*?⑦[^<]*/) ?? [''])[0]);
const ladder = txt((page.match(/博饼等级:[\s\S]*?状元插金花\s*\d+/) ?? [''])[0]);

const problems: string[] = [];
const check = (label: string, ok: boolean, detail: string) => {
	if (!ok) problems.push(`${label} —— ${detail}`);
};

// ① 开局选卡:文案的「N 张里挑 M 张」对代码里的池子大小与上限
const draftPool = +(page.match(/draftChoices = shuffle\([\s\S]{0,200}?\.slice\(0, (\d+)\)/) ?? [
	0,
	'?'
])[1];
const draftPick = +(page.match(/draftPicked\.length < (\d+)/) ?? [0, '?'])[1];
{
	const m = rules.match(/开局从(\d+)张普通Tee卡里挑(\d+)张/);
	check(
		'规则①开局选卡',
		!!m && +m[1] === draftPool && +m[2] === draftPick,
		`文案「${m ? `${m[1]} 选 ${m[2]}` : '未找到'}」,代码「${draftPool} 选 ${draftPick}」`
	);
}
{
	const m = txt(page).match(/挑(\d+)张Tee卡开局/);
	check(
		'选卡界面标题',
		!!m && +m[1] === draftPick,
		`标题「${m?.[1] ?? '?'} 张」,代码 ${draftPick}`
	);
}
// ② 每回合投掷次数
{
	const m = rules.match(/每回合可投掷(\d+)次/);
	check('规则②投掷次数', !!m && +m[1] === BR, `文案「${m?.[1] ?? '?'} 次」,BASE_ROLLS=${BR}`);
}
// ④ 集市免费 N 选 M
{
	const m = rules.match(/免费(\d+)选(\d+)/);
	const draws = +(page.match(/drawCards\((\d+)\)/) ?? [0, '?'])[1];
	check(
		'规则④免费选卡',
		!!m && +m[1] === draws && +m[2] === 1,
		`文案「${m?.[1]} 选 ${m?.[2]}」,drawCards(${draws})`
	);
}
// ⑤ 加成卡持续回合数
{
	const m = rules.match(/持续(\d+)~(\d+)关/);
	const turns = BUFF_CARDS.map((c) => c.turns);
	check(
		'规则⑤加成卡持续',
		!!m && +m[1] === Math.min(...turns) && +m[2] === Math.max(...turns),
		`文案「${m?.[1]}~${m?.[2]} 关」,实际 ${Math.min(...turns)}~${Math.max(...turns)}`
	);
}
// ⑥ Boss 间隔
{
	const m = rules.match(/每(\d+)关出现/);
	check(
		'规则⑥Boss 间隔',
		!!m && isBossRound(+m[1]) && !isBossRound(+m[1] - 1),
		`文案「每 ${m?.[1] ?? '?'} 关」,isBossRound 周期需为 ${m?.[1]}`
	);
}
// ⑦ 队伍上限(文案用的是模板表达式,只能查代码里是否真用了 TEAM_LIMIT)
check(
	'规则⑦队伍上限',
	/队伍最多\s*\{TEAM_LIMIT\}/.test(page) || rules.includes('队伍最多'),
	'文案未引用 TEAM_LIMIT'
);
check('TEAM_LIMIT 合理', TEAM_LIMIT >= 3 && TEAM_LIMIT <= 8, `TEAM_LIMIT=${TEAM_LIMIT}`);

// 等级分阶梯:文案里的「名称 分数」序列必须与 ROLL_LEVELS 完全一致
{
	const pairs = [...ladder.matchAll(/([\u4e00-\u9fa5]+?)(\d+)分?/g)].map(
		(m) => [m[1], +m[2]] as const
	);
	const expect = ROLL_LEVELS.filter((l) => l.id !== 'none').map((l) => [l.name, l.score] as const);
	const seq = pairs.filter(([n]) => expect.some(([en]) => en === n));
	const asc = [...expect].reverse(); // 文案按分数升序写
	const wrong = asc.filter(([n, s], i) => !(seq[i]?.[0] === n && seq[i]?.[1] === s));
	check(
		'等级分阶梯',
		wrong.length === 0 && seq.length === expect.length,
		`文案 ${seq.map(([n, s]) => `${n}${s}`).join('/')} vs 实际 ${asc.map(([n, s]) => `${n}${s}`).join('/')}`
	);
}
// 溢出奖励:文案阈值必须能在实现里复现
{
	// 卡面文案已统一成全角标点,匹配前先归一化(只看数字是否与实现一致)
	const norm = (t: string) =>
		t.replace(/（/g, '(').replace(/）/g, ')').replace(/，/g, ',').replace(/\s+/g, '');
	const m = norm(txt(page)).match(/溢出奖励\(每超出目标(\d+)%\+(\d+),上限(\d+)\)/);
	if (!m) check('溢出奖励文案', false, '未找到');
	else {
		const [, pct, gain, cap] = m.map(Number);
		const t = 1000;
		const step = (pct / 100) * t; // 每超出「目标的 pct%」应 +gain
		const ok =
			overflowReward(t + step, t) === gain &&
			overflowReward(t + step * gain, t) === gain * gain &&
			overflowReward(t + step - 1, t) === 0 &&
			overflowReward(t * 100, t) === cap;
		check(
			'溢出奖励文案',
			ok,
			`文案「每超目标 ${pct}% +${gain},上限 ${cap}」,实测 step=${step}: +${overflowReward(t + step, t)} / 双倍 +${overflowReward(t + step * gain, t)} / 差 1 分 +${overflowReward(t + step - 1, t)} / 封顶 ${overflowReward(t * 100, t)}`
		);
	}
}

// ---- 等级示例自检(两条断言) ----
// ① 示例里的核心骰子**单独**判定就该是它自己(X 是无关散牌,拿掉不影响)
// ② 带 X 的示例能补全出一手真实手牌(sampleDice,作弊引擎塞「已掷完」结果要用)
// 踩过:一秀的示例写成 [4,2,3,5,6,1] —— 那是 1-2-3-4-5-6,实际判定是对堂。
const coreDice = (l: (typeof ROLL_LEVELS)[number]) =>
	l.example.filter((v): v is number => v !== 'X');
const badExamples = ROLL_LEVELS.filter(
	(l) => judgeRoll(coreDice(l)).id !== l.id || judgeRoll(sampleDice(l)).id !== l.id
);
if (badExamples.length) {
	bad++;
	console.log('\n✗ 等级示例与判定不符:');
	for (const l of badExamples)
		console.log(
			`   ${l.name}: 示例 [${l.example.join(',')}] → 核心 [${coreDice(l).join(',')}] 判定 ${judgeRoll(coreDice(l)).name};` +
				` 补全 [${sampleDice(l).join(',')}] 判定 ${judgeRoll(sampleDice(l)).name}`
		);
} else
	console.log(
		`\n等级示例自检 ✓(核心骰子单独判定即等于该等级 · X 可补全 · ${ROLL_LEVELS.length} 个等级)`
	);

console.log('\n=== 页面文案 ↔ 代码常量 ===');
if (problems.length === 0) console.log('全部通过 ✓');
else for (const p of problems) console.log(`✗ ${p}`);

console.log(
	`\n${bad + problems.length === 0 ? '全部通过 ✓' : `发现 ${bad + problems.length} 处文案与实现不一致`}`
);
process.exit(bad + problems.length === 0 ? 0 : 1);
