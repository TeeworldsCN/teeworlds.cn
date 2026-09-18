/**
 * 导出所有 Tee 卡 + 加成卡的 CSV(tools/zhongqiu/cards.csv)
 *
 * 用法:bun run tools/zhongqiu/export-csv.ts     (纯数据导出,秒出)
 *
 * 只导「卡 + 说明」。要估值看 balance.ts(自 EV / 队伍影响 / 稀有度区间体检)。
 */
import { CARDS, RARITY_INFO } from '../../src/lib/zhongqiu/teecards';
import { BUFF_CARDS } from '../../src/lib/zhongqiu/items';

const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const rows: string[][] = [
	['类型', '稀有度', 'id', '名字', '标签', '皮肤', '价格', '持续关数', '描述']
];

for (const c of CARDS) {
	rows.push([
		'Tee 卡',
		c.rarity,
		c.id,
		c.name,
		c.tag ?? '',
		c.skin,
		String(RARITY_INFO[c.rarity].sell), // Tee 卡这里是「卖出价」
		'',
		c.desc
	]);
}

for (const b of BUFF_CARDS) {
	rows.push([
		'加成卡',
		b.rarity,
		b.id,
		b.name,
		'',
		b.skin,
		String(b.price), // 加成卡是「买入价」
		String(b.turns),
		b.desc + (b.refund ? '(未使用则归还)' : '')
	]);
}

// 排序:类型 → 稀有度(传说/稀有/普通)→ id
const ORDER: Record<string, number> = { legendary: 0, rare: 1, common: 2 };
const [header, ...body] = rows;
body.sort((a, b) => {
	if (a[0] !== b[0]) return a[0] === 'Tee 卡' ? -1 : 1;
	if (a[1] !== b[1]) return (ORDER[a[1]] ?? 9) - (ORDER[b[1]] ?? 9);
	return a[2].localeCompare(b[2]);
});

await Bun.write(
	'tools/zhongqiu/cards.csv',
	[header, ...body].map((r) => r.map(q).join(',')).join('\n') + '\n'
);
console.log(
	`写出 ${body.length} 行(Tee 卡 ${CARDS.length} + 加成卡 ${BUFF_CARDS.length})→ tools/zhongqiu/cards.csv`
);
