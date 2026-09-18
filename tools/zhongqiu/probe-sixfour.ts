// 一次性探针:凑齐「六博红」那套 build 要几关、多大概率?
//
// 模型 = 游戏真实的抽卡流程(和 run.ts 同一套假设):
//   · 开局:5 张**普通**卡里挑 2 张(强制挑满)
//   · 之后每关奖励:drawCards(3) 三选一 —— 这里用真实的 drawCards,所以稀有度权重一致
//   · 卡位一共 5 个(主 Tee「我」没有卡,见 confirmDraft),满了就得「换人」= 卖卡
// 玩家策略取"完美贪心":见转换卡就拿,其次是倍率卡 —— 所以结果是**上界**。
import { CARDS, drawCards } from '../../src/lib/zhongqiu/teecards';

/** 五张「我掷出的 X 视为 4」集齐 = 100% 六博红(teecards.ts:1159 的注释)*/
const CONV_FACE: Record<string, number> = {
	xiaoyue: 1, // 破晓 common
	meiyue: 2, // 柳眉 rare
	xinyue: 3, // 朔日 legendary
	sanxingzhao: 3, // 三星照 rare(3 点有两条路)
	shangxian: 5, // 上弦 rare
	wangshu: 6 // 望舒 common
};
/** 截图里那两张大倍率 */
const MULT = ['dazhanggui', 'yuelao']; // 饼铺掌柜(每累计卖出 ×2,叠乘) + 月老(复制右邻 ×2)

function mulberry32(a: number) {
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const rand = mulberry32(Number(process.env.SEED ?? 1));
Math.random = rand;

const commons = CARDS.filter((c) => c.rarity === 'common');
const TRIALS = Number(process.env.TRIALS ?? 60000);
const ROUNDS = 16;
const SLOTS = 5; // 主 Tee 之外能带卡的位置

type Acc = Record<string, number[]>;
const hits: Acc = {
	k3: [], // ≥3 张转换
	k4: [], // ≥4 张
	k5: [], // 5 张齐(每次掷骰必然六博红)
	mults: [], // 饼铺掌柜 + 月老都在
	screen: [], // 截图那套:≥3 张转换 + 饼铺掌柜 + 月老
	k4mult: [] // ≥4 张转换 + 饼铺掌柜(5 个卡位刚好)
};
for (const key of Object.keys(hits)) hits[key] = new Array(ROUNDS + 2).fill(0);

for (let t = 0; t < TRIALS; t++) {
	const faces = new Set<number>();
	const owned = new Set<string>();
	let mults = 0;
	const take = (id: string, swapOut?: string) => {
		owned.add(id);
		if (swapOut) owned.delete(swapOut);
	};
	// ---- 开局:5 张普通里挑 2 张(优先转换卡,能凑不同点数最好)----
	const draft = [...commons].sort(() => rand() - 0.5).slice(0, 5);
	draft.sort((a, b) => (CONV_FACE[b.id] ?? 9) - (CONV_FACE[a.id] ?? 9));
	for (const c of draft.slice(0, 2)) {
		const f = CONV_FACE[c.id];
		if (f !== undefined && !faces.has(f)) {
			faces.add(f);
			take(c.id);
		} else {
			take(c.id); // 挑不到转换卡就随便拿(占位,后面会被换掉)
		}
	}
	// ---- 每关奖励 ----
	for (let r = 1; r <= ROUNDS; r++) {
		const opts = drawCards(3, new Set());
		let took = false;
		// ① 优先:还没凑到的点数
		for (const o of opts) {
			const f = CONV_FACE[o.id];
			if (f === undefined || faces.has(f)) continue;
			faces.add(f);
			if (owned.size < SLOTS) take(o.id);
			else {
				// 卡位满了:把"最不值钱的"换出去(优先换掉占位的非目标卡)
				const junk = [...owned].find((id) => CONV_FACE[id] === undefined && !MULT.includes(id));
				if (junk) take(o.id, junk);
				else if (mults === 2 && owned.size >= SLOTS) {
					// 五张转换 + 两张倍率放不下:放弃一张倍率(月老)
					take(o.id, 'yuelao');
					mults = 1;
				}
			}
			took = true;
			break;
		}
		// ② 其次:倍率卡(饼铺掌柜优先)
		if (!took) {
			for (const id of MULT) {
				if (!opts.some((o) => o.id === id) || owned.has(id)) continue;
				if (owned.size < SLOTS) take(id);
				else {
					const junk = [...owned].find((x) => CONV_FACE[x] === undefined && !MULT.includes(x));
					if (junk) take(id, junk);
				}
				mults = MULT.filter((x) => owned.has(x)).length;
				break;
			}
		}
		const k = faces.size;
		const has1 = owned.has('dazhanggui');
		const has2 = owned.has('yuelao');
		const rec = (key: string, cond: boolean) => {
			if (cond) hits[key][r] += 1;
		};
		rec('k3', k >= 3);
		rec('k4', k >= 4);
		rec('k5', k >= 5);
		rec('mults', has1 && has2);
		rec('screen', k >= 3 && has1 && has2);
		rec('k4mult', k >= 4 && has1);
	}
}

const pct = (n: number) => ((100 * n) / TRIALS).toFixed(n / TRIALS < 0.01 ? 2 : 1) + '%';
console.log(`六博红 build 收齐进度 · ${TRIALS} 局 · 卡位 ${SLOTS} 个(主 Tee 无卡)\n`);
const cols = ['k3', 'k4', 'k5', 'mults', 'screen', 'k4mult'];
const label: Record<string, string> = {
	k3: '≥3 张转换',
	k4: '≥4 张转换',
	k5: '5 张齐(必六博红)',
	mults: '饼铺掌柜+月老',
	screen: '截图那套(≥3转换+两倍率)',
	k4mult: '≥4 转换+饼铺掌柜'
};
console.log('关  ' + cols.map((c) => label[c].padStart(22)).join(''));
for (const r of [1, 2, 3, 4, 5, 6, 8, 10, 12, 16]) {
	console.log(
		`R${String(r).padStart(2)} ` + cols.map((c) => pct(hits[c][r]).padStart(22)).join('')
	);
}
console.log('\n(每关奖励三选一,只统计"到第 r 关时已凑齐"的累计比例)');
