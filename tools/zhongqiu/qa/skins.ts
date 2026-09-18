// 皮肤查重 / 选皮辅助
//
// 用法:
//   bun tools/zhongqiu/qa/skins.ts                  # 体检:未选数量 + 重复 + 失效皮肤
//   bun tools/zhongqiu/qa/skins.ts bunny moon       # 按关键词找「还没被占用」的候选皮肤
//
// 「未选」= 还是占位皮肤 x_spec(DDNet 的默认皮肤,也是 TeeCard 组件的兜底)。
// 重复检查只在非占位皮肤之间做 —— 169 张卡在挑选过程中必然有大量 x_spec,那不是重名。
import { BUFF_CARDS } from '../../../src/lib/zhongqiu/items';
import { CARDS } from '../../../src/lib/zhongqiu/teecards';

const PLACEHOLDER = 'x_spec';

type Row = { kind: 'Tee' | '加成'; id: string; name: string; skin: string };
const rows: Row[] = [
	...CARDS.map((c) => ({ kind: 'Tee' as const, id: c.id, name: c.name, skin: c.skin })),
	...BUFF_CARDS.map((c) => ({ kind: '加成' as const, id: c.id, name: c.name, skin: c.skin }))
];

/** 皮肤表:本地缓存优先(省一次网络),否则打本地 3100 的 /api/skins */
const loadSkinNames = async (): Promise<Set<string>> => {
	const urls = [process.env.SKINS_JSON, '/tmp/skins.json', 'http://127.0.0.1:3100/api/skins'];
	for (const u of urls) {
		if (!u) continue;
		try {
			const text = u.startsWith('http') ? await (await fetch(u)).text() : await Bun.file(u).text();
			const json = JSON.parse(text) as { skins: { name: string }[] };
			return new Set(json.skins.map((s) => s.name));
		} catch {
			/* 試下一个来源 */
		}
	}
	return new Set();
};

const kw = process.argv.slice(2);
const available = await loadSkinNames();
const used = new Map<string, Row[]>();
for (const r of rows) {
	if (r.skin === PLACEHOLDER) continue;
	used.set(r.skin, [...(used.get(r.skin) ?? []), r]);
}

if (kw.length) {
	// 找候选:名字包含任一关键词、且没被占用、且在皮肤表里存在
	const taken = new Set([...used.keys()]);
	const picked = [...available]
		.filter((n) => kw.some((k) => n.toLowerCase().includes(k.toLowerCase())))
		.filter((n) => !taken.has(n));
	console.log(`关键词 ${kw.join(' / ')} → 可用候选 ${picked.length} 个:\n`);
	console.log(picked.slice(0, 80).join('  '));
	if (picked.length > 80) console.log(`… 还有 ${picked.length - 80} 个`);
	process.exit(0);
}

const unassigned = rows.filter((r) => r.skin === PLACEHOLDER);
const dups = [...used.entries()].filter(([, rs]) => rs.length > 1);
const invalid = available.size
	? rows.filter((r) => r.skin !== PLACEHOLDER && !available.has(r.skin))
	: [];

console.log(`皮肤体检 · 共 ${rows.length} 张卡(Tee ${CARDS.length} / 加成 ${BUFF_CARDS.length})`);
console.log(`  未选(还是 ${PLACEHOLDER}): ${unassigned.length}`);
console.log(`  已选且唯一: ${[...used.values()].filter((rs) => rs.length === 1).length}`);
console.log(`  重复: ${dups.length} 组`);
for (const [skin, rs] of dups)
	console.log(`    ✗ ${skin} ← ${rs.map((r) => `${r.name}(${r.kind})`).join(' / ')}`);
if (available.size)
	console.log(
		`  皮肤表里不存在的: ${invalid.length}` +
			(invalid.length ? ' → ' + invalid.map((r) => `${r.name}:${r.skin}`).join(', ') : '')
	);
else console.log('  (没读到皮肤表,跳过存在性检查)');

if (unassigned.length && process.env.LIST === '1') {
	console.log('\n未选的卡:');
	for (const r of unassigned) console.log(`    ${r.kind} ${r.id} 「${r.name}」`);
}

const ok = dups.length === 0 && invalid.length === 0;
console.log(`\n${ok ? '查重通过 ✓' : `发现 ${dups.length + invalid.length} 处问题`}`);
process.exit(ok ? 0 : 1);
