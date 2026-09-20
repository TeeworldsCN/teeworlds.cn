import { CARDS } from './teecards';
import { BUFF_CARDS } from './items';

/**
 * 图鉴解锁 —— 跨局元进度(和最高分/局数那种元存档一个性质,不随重开清掉)。
 *
 * ## 存储:位数组 + base64,单独一项 localStorage
 *
 * 一张卡 1 bit。Tee 109 张 + 加成卡 65 张 = 22 字节,base64 之后 32 个字符。
 * 真按 id 列表存 JSON 得 ~2.6KB,而图鉴只关心「有没有」,位数组正合适。
 *
 * **两个数组分开存**(而不是拼成一条),是为了「加卡不串位」:
 * 将来往 CARDS 里追加新卡,只会让 Tee 那条变长,不会连累加成卡的解锁记录。
 * 变长时旧存档照样读得回来 —— 长出来的 bit 天然是 0(未解锁)。
 * 只有在**中间插入**卡片才会整体错位一位,属于可接受的降级:
 * 最多误报几张已解锁,不会丢存档、不会崩。
 *
 * ## 什么时候解锁
 *
 * - Tee 卡:在 3 选 1 界面**刷出来过**就算(不用真的选它)
 * - 加成卡:在中秋集市货架上**摆出来过**就算;另外新进仓库的那张也解锁
 *   (旧的元存档 / 商店之外拿到的卡,保证「用过就该解锁」)
 *
 * 解锁条目只要有变化就立刻写盘。
 */

const TEE_INDEX = new Map(CARDS.map((c, i) => [c.id, i]));
const BUFF_INDEX = new Map(BUFF_CARDS.map((c, i) => [c.id, i]));

/** 存 bit 要几个字节 */
const bytesOf = (n: number) => (n + 7) >> 3;

const TEE_BYTES = bytesOf(CARDS.length);
const BUFF_BYTES = bytesOf(BUFF_CARDS.length);

export const CODEX_KEY = 'midautumn:codex';

/** TS 5.7 起 Uint8Array 带 buffer 泛型:`new Uint8Array(n)` 是 `Uint8Array<ArrayBuffer>`,
 * 而裸写的 `Uint8Array` 是 `Uint8Array<ArrayBufferLike>` —— 统一显式标注,免得来回不兼容 */
type Bits = Uint8Array<ArrayBuffer>;

let teeBits: Bits = new Uint8Array(TEE_BYTES);
let buffBits: Bits = new Uint8Array(BUFF_BYTES);

/**
 * 修订号:每次解锁/清空都 +1。
 * UI 在读解锁状态时顺手读一下它,就能在解锁变化时自动重算(见下面各处的 `codexVersion()`)。
 * 位数组本身是 Uint8Array,Svelte 的 $state 代理不了它,所以用修订号当信号。
 */
let version = $state(0);

/** 修订号:供 UI 订阅解锁变化 */
export const codexVersion = () => version;

// ---- base64:位数组 ⇄ 字符串 ----

const toB64 = (a: Bits): string => {
	let s = '';
	// 数组很小(几十字节),不做分块
	for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
	return btoa(s);
};

/** 读回 n 字节:短了补 0(卡片列表变长),长了截断(变短) */
const fromB64 = (s: unknown, n: number): Bits => {
	const out: Bits = new Uint8Array(n);
	if (typeof s !== 'string') return out;
	try {
		const bin = atob(s);
		for (let i = 0; i < n && i < bin.length; i++) out[i] = bin.charCodeAt(i);
	} catch {
		// 坏数据当作全未解锁
	}
	return out;
};

const load = () => {
	try {
		const raw = localStorage.getItem(CODEX_KEY);
		if (!raw) return;
		const d = JSON.parse(raw) as { t?: string; b?: string };
		teeBits = fromB64(d.t, TEE_BYTES);
		buffBits = fromB64(d.b, BUFF_BYTES);
	} catch {
		// 隐私模式 / 坏数据:当作全未解锁
	}
};

const persist = () => {
	try {
		localStorage.setItem(CODEX_KEY, JSON.stringify({ t: toB64(teeBits), b: toB64(buffBits) }));
	} catch {
		// 存不了就算了,不能因此崩游戏
	}
};

load();

// ---- 位操作 ----

const has = (a: Bits, i: number): boolean =>
	i >= 0 && i < a.length * 8 && (a[i >> 3] & (1 << (i & 7))) !== 0;

/** 置位;返回是否真的从 0 变 1 —— 用来判断「解锁条目有变化」 */
const put = (a: Bits, i: number): boolean => {
	if (i < 0 || i >= a.length * 8) return false;
	const m = 1 << (i & 7);
	if (a[i >> 3] & m) return false;
	a[i >> 3] |= m;
	return true;
};

const countBits = (a: Bits, n: number): number => {
	let c = 0;
	for (let i = 0; i < n; i++) if (has(a, i)) c++;
	return c;
};

// ---- 查询 ----

/** 未登记的 id(理论上不会有)按未解锁处理 */
export const isTeeUnlocked = (id: string): boolean => {
	codexVersion(); // 订阅:解锁变化时让调用方的 $derived 重算
	const i = TEE_INDEX.get(id);
	return i === undefined ? false : has(teeBits, i);
};

export const isBuffUnlocked = (id: string): boolean => {
	codexVersion();
	const i = BUFF_INDEX.get(id);
	return i === undefined ? false : has(buffBits, i);
};

/** 已解锁数量(图鉴页眉的 n/total) */
export const teeUnlockedCount = (): number => {
	codexVersion();
	return countBits(teeBits, CARDS.length);
};

export const buffUnlockedCount = (): number => {
	codexVersion();
	return countBits(buffBits, BUFF_CARDS.length);
};

// ---- 解锁 ----

/** 有变化才写盘;返回是否解锁了新条目 */
const apply = (cards: { id: string }[], bits: Bits, index: Map<string, number>): boolean => {
	let changed = false;
	for (const c of cards) {
		const i = index.get(c.id);
		if (i !== undefined && put(bits, i)) changed = true;
	}
	if (changed) {
		persist();
		version++;
	}
	return changed;
};

/** 3 选 1 刷出来的 Tee 卡 → 解锁 */
export const unlockTees = (cards: { id: string }[]): boolean => apply(cards, teeBits, TEE_INDEX);

/** 货架上摆出来的 / 新进仓库的加成卡 → 解锁 */
export const unlockBuffs = (cards: { id: string }[]): boolean => apply(cards, buffBits, BUFF_INDEX);

/** 按 id 解锁(读档时把仓库里的卡补登记,老存档也能对上) */
export const unlockBuffIds = (ids: string[]): boolean =>
	apply(
		ids.map((id) => ({ id })),
		buffBits,
		BUFF_INDEX
	);

// ---- 作弊/QA 入口 ----

export const codexUnlockAll = () => {
	teeBits.fill(0xff);
	buffBits.fill(0xff);
	persist();
	version++;
};

export const codexReset = () => {
	teeBits = new Uint8Array(TEE_BYTES);
	buffBits = new Uint8Array(BUFF_BYTES);
	persist();
	version++;
};

/** 原始存储内容 —— QA 用来验「就是位数组 + base64」 */
export const codexRaw = (): string | null => {
	try {
		return localStorage.getItem(CODEX_KEY);
	} catch {
		return null;
	}
};
