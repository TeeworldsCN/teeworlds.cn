// 各流派「能收集到几张」的概率探针
//
// 用法: bun tools/zhongqiu/tag-collect.ts [每系局数,默认 4000]
//
// 全程用**真实**的抽卡/商店函数,不自己造牌池:
//   · 开局 5 选 2 —— drawCards(5)
//   · 每关奖励 3 选 1 —— drawCards(3),排除已拥有的 id(真人不会拿重复卡)
//   · 集市每次 6 件 —— drawShopItems(6 个空锁位)
// 选牌政策 = 冲单系:同系必拿,否则拿稀有度最高的;满 6 张时换掉非本系的。
// 月饼币按 run.ts 的近似(每关 10 + 4×关数)。
//
// ⚠️ 加成卡没有 tag,这里按「名字里的流派字」归类(和 qa/copy.ts 的同一条规则),
//    所以「含加成卡」那一列是**玩家视角**的收集数,不是 per_tag 的计数。
import { CARDS, drawCards, type Tag } from '../../src/lib/zhongqiu/teecards';
import { BUFF_CARDS, drawShopItems } from '../../src/lib/zhongqiu/items';
import { TARGETS } from '../../src/lib/zhongqiu/game';

const TAGS: Tag[] = ['月', '桂', '仙', '饼', '兔', '灯'];
const TEAM_LIMIT = 6;
const START_SLOTS = 3; // 开局 3 人成队(「我」+ 5 选 2)
const rar = { common: 0, rare: 1, legendary: 2 } as const;
const rank = (id: string) => rar[CARDS.find((c) => c.id === id)!.rarity];

/** 加成卡的派系字(最多一个,见 qa/copy.ts) */
const buffFaction = (name: string): Tag | null => TAGS.find((t) => name.includes(t)) ?? null;

const main = () => {
	const trials = Number(process.argv[2] ?? 4000);

	console.log(`每系 ${trials} 局 · 真实 drawCards/drawShopItems · ${TARGETS.length} 关\n`);
	console.log(
		'系    Tee卡:  ≥2      ≥3      ≥4      ≥5     |  含派系加成卡: ≥2      ≥3      ≥4      ≥5      (加成卡中位/上限)'
	);
	console.log('─'.repeat(122));

	for (const tag of TAGS) {
		// 累计:达到每个档位的局数
		const tee = [0, 0, 0, 0, 0, 0];
		const teeBuff = [0, 0, 0, 0, 0, 0];
		let buffMed: number[] = [];

		for (let t = 0; t < trials; t++) {
			// ---- 开局:5 选 2 ----
			const team: string[] = [];
			const start = drawCards(5);
			const startPick = start
				.filter((c) => c.id !== '')
				.sort((a, b) => rank(b.id) - rank(a.id))
				.sort((a, b) => Number(b.tag === tag) - Number(a.tag === tag))
				.slice(0, START_SLOTS - 1);
			for (const c of startPick) team.push(c.id);

			const bag = new Set<string>(); // 买到的加成卡 id
			let coins = 0;

			for (let r = 0; r < TARGETS.length; r++) {
				coins += 10 + 4 * r;

				// ---- 奖励 3 选 1 ----
				const owned = new Set(team);
				const opts = drawCards(3, owned).filter((c) => !owned.has(c.id));
				const pool = opts.length ? opts : drawCards(3);
				const take =
					pool.find((c) => c.tag === tag) ?? [...pool].sort((a, b) => rank(b.id) - rank(a.id))[0];
				if (take) {
					if (team.length < TEAM_LIMIT) team.push(take.id);
					else if (take.tag === tag) {
						// 满员:换掉最差的非本系卡
						const idx = team.findIndex((id) => {
							const c = CARDS.find((x) => x.id === id);
							return c && c.tag !== tag;
						});
						if (idx >= 0) team[idx] = take.id;
					}
				}

				// ---- 集市:6 件随机,只买本系的 ----
				const shelf = drawShopItems([null, null, null, null, null, null]);
				for (const b of shelf) {
					if (buffFaction(b.name) !== tag || bag.has(b.id) || b.price > coins) continue;
					coins -= b.price;
					bag.add(b.id);
				}
			}

			const teeN = new Set(team.filter((id) => CARDS.find((c) => c.id === id)?.tag === tag)).size;
			const allN = teeN + bag.size;
			for (let n = 2; n <= 5; n++) {
				if (teeN >= n) tee[n]++;
				if (allN >= n) teeBuff[n]++;
			}
			buffMed.push(bag.size);
		}
		const pct = (x: number) => ((x / trials) * 100).toFixed(1).padStart(5) + '%';
		buffMed.sort((a, b) => a - b);
		const med = buffMed[Math.floor(buffMed.length / 2)] ?? 0;
		const max = buffMed[buffMed.length - 1] ?? 0;
		console.log(
			`${tag}    ` +
				[2, 3, 4, 5].map((n) => pct(tee[n])).join('  ') +
				'   |  ' +
				[2, 3, 4, 5].map((n) => pct(teeBuff[n])).join('  ') +
				`        (${med} / ${max})`
		);
	}

	// 参考:各系牌池大小
	console.log('\n牌池:');
	for (const tag of TAGS) {
		const tee = CARDS.filter((c) => c.tag === tag).length;
		const buf = BUFF_CARDS.filter((b) => buffFaction(b.name) === tag).length;
		console.log(
			`  ${tag} 系:Tee ${String(tee).padStart(3)} 张 + 派系加成卡 ${String(buf).padStart(2)} 张 = ${tee + buf}`
		);
	}
};

main();
