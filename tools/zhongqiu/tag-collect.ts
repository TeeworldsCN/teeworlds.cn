// 各流派「能收集到几张」的概率探针 —— **只算带 tag 的 Tee 卡**
//
// 用法: bun tools/zhongqiu/tag-collect.ts [每系局数,默认 6000]
//
// 加成卡没有 tag(见 items.ts BuffCard),既不参与 per_tag 计数,也不属于任何派系,
// 所以这里完全不碰加成卡与集市 —— 派系收集只取决于 Tee 卡的抽卡与三选一。
//
// 抽卡全部用真实函数:
//   · 开局 5 选 2 —— drawCards(5)
//   · 每关奖励 3 选 1 —— drawCards(3),排除已拥有的 id(真人不会拿重复卡)
// 两种选牌政策各跑一遍:
//   · 冲单系  —— 同系必拿,否则拿稀有度最高的
//   · 不刻意  —— 只看稀有度(不冲任何系,作为对照)
// 满 6 张时:冲系政策会换掉非本系卡,不刻意政策换掉稀有度最低的。
import { CARDS, drawCards, type Tag } from '../../src/lib/zhongqiu/teecards';
import { TARGETS } from '../../src/lib/zhongqiu/game';

const TAGS: Tag[] = ['月', '灯', '仙', '桂', '饼', '兔'];
const TEAM_LIMIT = 6;
const START_SLOTS = 3; // 开局 3 人成队(「我」+ 5 选 2)
const rar = { common: 0, rare: 1, legendary: 2 } as const;
const byId = new Map(CARDS.map((c) => [c.id, c]));
const rank = (id: string) => rar[byId.get(id)!.rarity];

type Policy = 'chase' | 'neutral';

/** 跑一局,返回队伍里该系 tag 卡的去重张数 */
const runOne = (tag: Tag, policy: Policy): number => {
	const team: string[] = [];
	// 开局 5 选 2
	const start = [...drawCards(5)].sort(
		(a, b) => Number(b.tag === tag) - Number(a.tag === tag) || rank(b.id) - rank(a.id)
	);
	for (const c of start.slice(0, START_SLOTS - 1)) team.push(c.id);

	for (let r = 0; r < TARGETS.length; r++) {
		const owned = new Set(team);
		const pool = drawCards(3, owned).filter((c) => !owned.has(c.id));
		if (!pool.length) continue;
		const take =
			policy === 'chase'
				? (pool.find((c) => c.tag === tag) ?? [...pool].sort((a, b) => rank(b.id) - rank(a.id))[0])
				: [...pool].sort((a, b) => rank(b.id) - rank(a.id))[0];
		// 冲系政策:非本系的卡不占位(满员且拿不到本系时就跳过)
		if (policy === 'chase' && take.tag !== tag) {
			if (team.length < TEAM_LIMIT) team.push(take.id);
			continue;
		}
		if (team.length < TEAM_LIMIT) team.push(take.id);
		else {
			const idx = team.findIndex((id) => {
				const c = byId.get(id)!;
				return policy === 'chase' ? c.tag !== tag : rank(id) <= rank(take.id);
			});
			if (idx >= 0) team[idx] = take.id;
		}
	}
	return new Set(team.filter((id) => byId.get(id)?.tag === tag)).size;
};

const main = () => {
	const trials = Number(process.argv[2] ?? 6000);
	const pct = (x: number) => `${((x / trials) * 100).toFixed(1)}%`.padStart(6);

	for (const policy of ['chase', 'neutral'] as Policy[]) {
		console.log(
			`\n=== ${policy === 'chase' ? '冲单系(同系必拿)' : '不刻意(只看稀有度)'} · 每系 ${trials} 局 · ${TARGETS.length} 关 ===`
		);
		console.log('系   牌池  抽卡权重(占比)   P(≥2)   P(≥3)   P(≥4)   P(≥5)    中位/上限');
		console.log('─'.repeat(74));
		for (const tag of TAGS) {
			const mine = CARDS.filter((c) => c.tag === tag);
			const pool = mine.length;
			// 抽卡权重(和 drawCards 里的 7/3/1 一致)—— 牌池张数一样但权重可能差几倍,
			// 「仙 16 张比桂 11 张还难凑」这种反直觉就是权重造成的。
			const W = { common: 7, rare: 3, legendary: 1 } as const;
			const weight = mine.reduce((s, c) => s + W[c.rarity], 0);
			const totalW = CARDS.reduce((s, c) => s + W[c.rarity], 0);
			const cnt = new Array(10).fill(0);
			for (let t = 0; t < trials; t++) cnt[runOne(tag, policy)]++;
			const p = (n: number) => cnt.slice(n).reduce((a, b) => a + b, 0);
			let acc = 0;
			let med = 0;
			for (let n = 0; n < 10; n++) {
				acc += cnt[n];
				if (med === 0 && acc >= trials / 2) med = n;
			}
			const max = cnt.reduce((best, c, n) => (c > 0 ? n : best), 0);
			console.log(
				`${tag}   ${String(pool).padStart(3)}   ${String(weight).padStart(4)} (${((weight / totalW) * 100).toFixed(1)}%)    ` +
					[2, 3, 4, 5].map((n) => pct(p(n))).join('  ') +
					`   ${String(med).padStart(2)} / ${max}`
			);
		}
	}
};

main();
