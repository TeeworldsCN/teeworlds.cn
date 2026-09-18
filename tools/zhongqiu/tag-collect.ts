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
import { CARDS, drawCards, type Tag, type TeeCard } from '../../src/lib/zhongqiu/teecards';
import { TARGETS } from '../../src/lib/zhongqiu/game';

// ---- 假设模式(只用于试算,不写回数据) ----
// DROP_COMMON=月,灯  把这两系的普通卡当作「不带 tag」(仍在牌池里,只是不算派系)
// BUMP_COMMON=月,灯  把这两系的普通卡当作「稀有」
const DROP = new Set((process.env.DROP_COMMON ?? '').split(',').filter(Boolean));
// KEEP_COMMON=月:2,灯:5 —— 只丢一部分普通卡(每系留几张还带 tag)
const KEEP = Object.fromEntries(
	(process.env.KEEP_COMMON ?? '')
		.split(',')
		.filter(Boolean)
		.map((x) => x.split(':') as [string, string])
);
// DROP_RARE=月:4 —— 再丢几张稀有(稀缺档不够时用)
const DROP_RARE = Object.fromEntries(
	(process.env.DROP_RARE ?? '')
		.split(',')
		.filter(Boolean)
		.map((x) => x.split(':') as [string, string])
);
const droppedRare = new Map<string, Set<string>>();
for (const c of CARDS) {
	const n = Number(DROP_RARE[c.tag ?? ''] ?? 0);
	const key = c.tag ?? '';
	const set = droppedRare.get(key) ?? new Set<string>();
	if (c.rarity === 'rare' && c.tag && set.size < n) set.add(c.id);
	droppedRare.set(key, set);
}
const BUMP = new Set((process.env.BUMP_COMMON ?? '').split(',').filter(Boolean));
const HYPOTHETICAL = DROP.size > 0 || BUMP.size > 0 || Object.keys(KEEP).length > 0;
const W = { common: 7, rare: 3, legendary: 1 } as const;
// 一次性算出「哪些普通卡还留着 tag」(取每系前 N 张)——
// 不能边抽边数:tagOf 每次抽卡都会被调用,计数器一下就爆了(踩过)。
const keptCommon = new Set<string>();
{
	const seen = new Map<string, number>();
	for (const c of CARDS) {
		if (c.rarity !== 'common' || !c.tag) continue;
		const keep = KEEP[c.tag] !== undefined ? Number(KEEP[c.tag]) : DROP.has(c.tag) ? 0 : 99;
		const n = seen.get(c.tag) ?? 0;
		if (n < keep) keptCommon.add(c.id);
		seen.set(c.tag, n + 1);
	}
}
const tagOf = (c: TeeCard): Tag | undefined => {
	if (!c.tag) return undefined;
	if (c.rarity === 'rare' && droppedRare.get(c.tag)?.has(c.id)) return undefined;
	if (c.rarity === 'common' && !keptCommon.has(c.id)) return undefined;
	return c.tag;
};
const rarityOf = (c: TeeCard) =>
	c.tag && BUMP.has(c.tag) && c.rarity === 'common' ? ('rare' as const) : c.rarity;

/** 假设模式下的等价抽卡(和 drawCards 同一套权重,只是牌池/稀有度换了) */
const hypDraw = (n: number, exclude: Set<string>): TeeCard[] => {
	const pool = CARDS.filter((c) => !exclude.has(c.id));
	const out: TeeCard[] = [];
	while (out.length < n && pool.length) {
		const total = pool.reduce((s, c) => s + W[rarityOf(c)], 0);
		let r = Math.random() * total;
		let i = 0;
		while (i < pool.length - 1 && (r -= W[rarityOf(pool[i])]) > 0) i++;
		out.push(pool[i]);
		pool.splice(i, 1);
	}
	return out;
};
const drawN = (n: number, exclude: Set<string>): TeeCard[] =>
	HYPOTHETICAL ? hypDraw(n, exclude) : drawCards(n, exclude);

const TAGS: Tag[] = ['月', '灯', '仙', '桂', '饼', '兔'];
const TEAM_LIMIT = 6;
const START_SLOTS = 3; // 开局 3 人成队(「我」+ 5 选 2)
const rar = { common: 0, rare: 1, legendary: 2 } as const;
const byId = new Map(CARDS.map((c) => [c.id, c]));
const rank = (id: string) => rar[rarityOf(byId.get(id)!)];

type Policy = 'chase' | 'neutral';

/** 跑一局,返回队伍里该系 tag 卡的去重张数 */
const runOne = (tag: Tag, policy: Policy): number => {
	const team: string[] = [];
	// 开局 5 选 2
	const start = [...drawN(5, new Set())].sort(
		(a, b) => Number(tagOf(b) === tag) - Number(tagOf(a) === tag) || rank(b.id) - rank(a.id)
	);
	for (const c of start.slice(0, START_SLOTS - 1)) team.push(c.id);

	for (let r = 0; r < TARGETS.length; r++) {
		const owned = new Set(team);
		const pool = drawN(3, owned).filter((c) => !owned.has(c.id));
		if (!pool.length) continue;
		const take =
			policy === 'chase'
				? (pool.find((c) => tagOf(c) === tag) ??
					[...pool].sort((a, b) => rank(b.id) - rank(a.id))[0])
				: [...pool].sort((a, b) => rank(b.id) - rank(a.id))[0];
		// 冲系政策:非本系的卡不占位(满员且拿不到本系时就跳过)
		if (policy === 'chase' && tagOf(take) !== tag) {
			if (team.length < TEAM_LIMIT) team.push(take.id);
			continue;
		}
		if (team.length < TEAM_LIMIT) team.push(take.id);
		else {
			const idx = team.findIndex((id) => {
				const c = byId.get(id)!;
				return policy === 'chase' ? tagOf(c) !== tag : rank(id) <= rank(take.id);
			});
			if (idx >= 0) team[idx] = take.id;
		}
	}
	return new Set(team.filter((id) => tagOf(byId.get(id)!) === tag)).size;
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
			const mine = CARDS.filter((c) => tagOf(c) === tag);
			const pool = mine.length;
			// 抽卡权重(和 drawCards 里的 7/3/1 一致)—— 牌池张数一样但权重可能差几倍,
			// 「仙 16 张比桂 11 张还难凑」这种反直觉就是权重造成的。
			const weight = mine.reduce((s, c) => s + W[rarityOf(c)], 0);
			const totalW = CARDS.reduce((s, c) => s + W[rarityOf(c)], 0);
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
