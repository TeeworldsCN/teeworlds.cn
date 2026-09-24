/**
 * 中秋博饼 · 战绩海报(canvas → PNG)。
 *
 * 为什么用 canvas 而不是 DOM 截图:海报要在**用户手机**上生成,不能依赖
 * html2canvas 那类库(体积 + 字体/皮肤/CSS 变体一堆坑);而头像、骰子、二维码
 * 这些东西本来就能画 —— 头像走 `$lib/components/tee-canvas`(和页面上的 TeeRender 同一只),
 * 骰子照抄游戏里那六颗的点阵(`DICE_PIPS`),二维码是静态图。
 *
 * 版面:1080×1620(2:3,长图)——
 *   **上半是月圆夜空**(满月 + 星群),压着「我的战绩」和当局数据;
 *   **下半是暖色插画**(灯笼、月饼、兔子那桌博饼)收尾,而且**整张都露出来**。
 *   二维码白牌钉在总分右边:「来挑战我的记录」就写在码下面,一处号召。
 *
 * 版面是**算出来的**,不是拿眼睛一点点挪的(见下面「版面求解」):
 *   每段高度都有公式 → 段间只留一个行距 → 行距由剩余空间除出来 → 插画吃掉剩下的高度。
 *   增删一段(比如本局没买加成卡)会自己重新配平,不用回头手改每个 Y。
 */

import { drawTee, loadTeeSkin } from '$lib/components/tee-canvas';
import { DICE_PIPS } from '$lib/zhongqiu/midautumn';
import { ZQ_SHARE_URL, ZQ_SHARE_TITLE } from './share';
// 海报标题用的节庆中文子集(马善政毛笔楷书)—— 只给 canvas 用,见文件里的说明
import './poster-font.css';

/** 设计稿尺寸(导出也按这个,乘 scale) */
export const POSTER_W = 1080;
export const POSTER_H = 1620;

/** 海报上的一只 Tee */
export interface PosterTee {
	name: string;
	/** DDNet 皮肤名 */
	skin: string;
	/** 描边色(稀有度色;「我」用琥珀) */
	color: string;
	isSelf?: boolean;
}

/** 本局买得最多的加成卡 */
export interface PosterBuff {
	name: string;
	color: string;
	count: number;
}

export interface PosterData {
	/** 本局总分 */
	score: number;
	/** 倒在了第几关 */
	round: number;
	/** 本关得分 / 本关目标 */
	roundScore: number;
	roundTarget: number;
	/** 历史最高(元存档) */
	bestScore: number;
	bestRound: number;
	isNewBest: boolean;
	/** 局内历时,已格式化(00:12:34) */
	duration: string;
	soldTees: number;
	cardsBought: number;
	earnedMooncakes: number;
	rerolled: number;
	/** 1~6 点各结算过几颗 */
	scoredFaces: number[];
	team: PosterTee[];
	/** 购入最多的前 3 张(没有就空数组) */
	buffs: PosterBuff[];
	/** 局内日期(2026-09-24) */
	date: string;
}

/* ============================ 字体 / 颜色 ============================ */

/**
 * 字体栈:自带的**单色** emoji 子集放最前(海报上的 🥮 🎲 各平台一个样,而且跟着正文颜色走),
 * 文字部分逐字回退到系统中文 sans。
 * 注意它和毛笔体是**同一个文件**里的两套字形,靠 unicode-range 分工 —— 见 poster-font.css:
 * 这里 emoji 那家只吃 emoji 码位,所以「本局总分」这类 sans 标签不会被它画成毛笔字。
 */
const FONT_STACK = `"Zhongqiu Poster Emoji", ui-sans-serif, system-ui, -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;

/**
 * 节庆体(毛笔楷书子集)排在最前,后面才是 emoji 字体和系统 sans ——
 * 子集里没有的字符(玩家名字、网址、数字)逐字回退。
 * 只给标题和段落标签用:数据/数字保持无衬线(手写数字反而不好认)。
 */
const FONT_BRUSH = `"Zhongqiu Brush", ${FONT_STACK}`;

const COLOR = {
	bgTop: '#080d20',
	bgMid: '#131c3d',
	bgBottom: '#1d2a5c',
	amber: '#fbbf24',
	amberDeep: '#f59e0b',
	text: '#e2e8f0',
	textDim: '#94a3b8',
	textFaint: '#64748b',
	plate: '#f8fafc',
	plateText: '#0b1020',
	chip: 'rgba(148, 163, 184, 0.10)',
	chipLine: 'rgba(148, 163, 184, 0.22)',
	dieInk: '#2b2b33',
	dieRed: '#d63232'
} as const;

/** 海报上用到的 emoji —— 必须都在自带的 emoji 字体子集里(见 poster-font.css 的说明) */
const ICON = {
	sold: '🪙',
	cards: '⚡',
	mooncakes: '🥮',
	reroll: '🔄',
	dice: '🎲',
	team: '👥',
	buffs: '🛒',
	record: '🏆'
} as const;

/* ============================== 版面 ============================== */
/*
 * 一、尺寸常量(全是设计稿 px)
 * 二、段高公式:每段的高度只由「字号 / 固定件」决定
 * 三、求解:行距 = 剩余空间 ÷ 段数,插画拿最后剩下的高度
 * 四、铺位:从顶到底依次排,每段只关心自己的 top
 */

const W = POSTER_W;
const H = POSTER_H;
/** 左右留白 */
const M = 56;
/** 内容宽 */
const CW = W - M * 2;
/** 顶边距(顶部徽章那一行的高度) */
const TOP_BAR_H = 64;
const TOP = 28;

/** 段内行距(文字行之间) */
const LINE_GAP = 10;
/** 字号 */
const SIZE = {
	badge: 34,
	date: 28,
	title: 72,
	heroLabel: 30,
	heroScore: 112,
	heroInfo: 32,
	sectionLabel: 30,
	diceCount: 32,
	buff: 28,
	teamName: 26,
	chipValue: 54,
	chipLabel: 24,
	qrCaption: 24
} as const;
/** 固定件尺寸 */
const CHIPS_H = 128;
const DICE_SIZE = 70;
const TEAM_CARD_H = 118;
const TEAM_AVATAR = 64;
const QR_W = 220;
const QR_SIZE = 180;
const QR_PAD = 20;
/** 二维码白牌高度 = 内边距 + 码 + 间隔 + 一行说明 + 内边距 */
const QR_H = QR_PAD + QR_SIZE + 22 + Math.round(SIZE.qrCaption * 1.3) + 14;
/**
 * 底部插画「整张露出来」所需的高度 —— 就是原图比例:
 * static/zhongqiu/poster-banner.jpg(1400×557)。再矮就要裁图了,所以它是插画的下限。
 */
const BANNER_FULL = Math.round((W * 557) / 1400);

/** 一行文字的盒子高(含上下留白) */
const lineBox = (size: number) => Math.round(size * 1.3);
/** 一行文字的基线(相对盒子顶部) */
const lineBase = (size: number) => Math.round(size * 1.02);
/** 纯数字的大字:没有下伸部,盒子能矮一档 */
const numBox = (size: number) => Math.round(size * 1.08);
const numBase = (size: number) => Math.round(size * 0.88);

export interface PosterLayout {
	topBarTop: number;
	titleTop: number;
	titleH: number;
	titleBase: number;
	moon: { x: number; y: number; r: number };
	heroTop: number;
	heroH: number;
	heroLabelBase: number;
	scoreBase: number;
	infoBase: number;
	qrTop: number;
	chipsTop: number;
	diceLabelBase: number;
	diceTop: number;
	diceCountBase: number;
	buffsBase: number;
	teamLabelBase: number;
	teamTop: number;
	bannerTop: number;
	bannerH: number;
	/** 本局有没有加成卡(没有就不占段) */
	hasBuffs: boolean;
}

/**
 * 版面求解。段高全部由公式给出,段间只留一个行距 `gap`,
 * `gap` 由「剩余空间 ÷ 段数」解出来(夹在 24..60 之间,极端数据下也不会挤死);
 * 剩下的高度全给底部插画,所以插画永远是**整张**。
 */
export const computeLayout = (data: Pick<PosterData, 'buffs'>): PosterLayout => {
	const hasBuffs = data.buffs.length > 0;

	// ① 各段高度
	const hTitle = Math.round(SIZE.title * 1.24);
	const heroStack =
		lineBox(SIZE.heroLabel) + LINE_GAP + numBox(SIZE.heroScore) + LINE_GAP + lineBox(SIZE.heroInfo);
	const hHero = Math.max(heroStack, QR_H);
	const hDice =
		lineBox(SIZE.sectionLabel) + LINE_GAP + DICE_SIZE + LINE_GAP + lineBox(SIZE.diceCount);
	const hBuffs = hasBuffs ? lineBox(SIZE.buff) : 0;
	const hTeam = lineBox(SIZE.sectionLabel) + LINE_GAP + TEAM_CARD_H;
	const blocks = [TOP_BAR_H, hTitle, hHero, CHIPS_H, hDice, hBuffs, hTeam].filter((h) => h > 0);

	// ② 行距 = 剩余空间 ÷ 段数(每段后面各留一个行距,插画在最后一个行距之后)。
	//    取整:版面全是整数,画出来不会有半像素的毛边;多出来的一两像素归插画。
	const gap = Math.round(
		Math.min(
			60,
			Math.max(24, (H - TOP - blocks.reduce((a, b) => a + b, 0) - BANNER_FULL) / blocks.length)
		)
	);

	// ③ 从上往下铺
	let y = TOP;
	const place = (h: number) => {
		const top = y;
		y += h + gap;
		return top;
	};

	const topBarTop = place(TOP_BAR_H);
	const titleTop = place(hTitle);
	const heroTop = place(hHero);
	const chipsTop = place(CHIPS_H);
	const diceTop = place(hDice);
	const buffsTop = hasBuffs ? place(hBuffs) : 0;
	const teamTop = place(hTeam);
	// 每段后面各留一个行距,插画接在最后一个行距之后、铺到画布底边
	const bannerTop = y;

	// ④ 段内:同一套盒子往下排
	//    总分那三段在 hero 段里**垂直居中**(和右边的二维码白牌对齐成一条带)
	const heroInnerTop = heroTop + Math.round((hHero - heroStack) / 2);
	const heroLabelTop = heroInnerTop;
	const scoreTop = heroLabelTop + lineBox(SIZE.heroLabel) + LINE_GAP;
	const infoTop = scoreTop + numBox(SIZE.heroScore) + LINE_GAP;
	//    骰子段:标题 + 骰子 + 次数
	const diceLabelTop = diceTop;

	return {
		topBarTop,
		titleTop,
		titleH: hTitle,
		titleBase: titleTop + lineBase(SIZE.title),
		moon: {
			// 月亮挂在夜空右半边、顶部徽章与标题之间 —— 位置也是按块算的
			x: Math.round(W * 0.71),
			y: topBarTop + Math.round((titleTop - topBarTop) / 2) + 10,
			r: 62
		},
		heroTop,
		heroH: hHero,
		heroLabelBase: heroLabelTop + lineBase(SIZE.heroLabel),
		scoreBase: scoreTop + numBase(SIZE.heroScore),
		infoBase: infoTop + lineBase(SIZE.heroInfo),
		qrTop: heroTop + Math.round((hHero - QR_H) / 2),
		chipsTop,
		diceLabelBase: diceLabelTop + lineBase(SIZE.sectionLabel),
		diceTop: diceLabelTop + lineBox(SIZE.sectionLabel) + LINE_GAP,
		diceCountBase:
			diceLabelTop +
			lineBox(SIZE.sectionLabel) +
			LINE_GAP +
			DICE_SIZE +
			LINE_GAP +
			lineBase(SIZE.diceCount),
		buffsBase: hasBuffs ? buffsTop + lineBase(SIZE.buff) : 0,
		teamLabelBase: teamTop + lineBase(SIZE.sectionLabel),
		teamTop: teamTop + lineBox(SIZE.sectionLabel) + LINE_GAP,
		bannerTop,
		bannerH: H - bannerTop,
		hasBuffs
	};
};

/* ============================ 小工具 ============================ */

const font = (weight: number | string, px: number, family: string = FONT_STACK) =>
	`${weight} ${px}px ${family}`;

const roundRectPath = (
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number
) => {
	const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
	ctx.beginPath();
	ctx.moveTo(x + rr, y);
	ctx.arcTo(x + w, y, x + w, y + h, rr);
	ctx.arcTo(x + w, y + h, x, y + h, rr);
	ctx.arcTo(x, y + h, x, y, rr);
	ctx.arcTo(x, y, x + w, y, rr);
	ctx.closePath();
};

interface TextOptions {
	weight?: number | string;
	size: number;
	color: string;
	align?: CanvasTextAlign;
	baseline?: CanvasTextBaseline;
	maxWidth?: number;
	/** 超出 maxWidth 时截断,默认不截(宁可挤也不要出现「…」的地方就不传) */
	clip?: boolean;
	shadow?: string;
	letterSpacing?: number;
	/** 换字体栈(默认中文 sans;节庆体传 FONT_BRUSH) */
	family?: string;
	/**
	 * 描边同色(假粗体)。毛笔字只有一档字重,小字号下笔画显细 ——
	 * 拿同色描边把笔画垫粗一圈,比换字体省事,也不会像合成粗体那样糊。
	 */
	stroke?: number;
}

const paintText = (
	ctx: CanvasRenderingContext2D,
	str: string,
	x: number,
	y: number,
	opts: TextOptions
) => {
	const {
		weight = 400,
		size,
		color,
		align = 'left',
		baseline = 'alphabetic',
		maxWidth,
		clip = false,
		shadow,
		letterSpacing,
		family,
		stroke
	} = opts;
	ctx.save();
	ctx.font = font(weight, size, family);
	ctx.fillStyle = color;
	ctx.textAlign = align;
	ctx.textBaseline = baseline;
	if (shadow) {
		ctx.shadowColor = shadow;
		ctx.shadowBlur = size * 0.5;
	}
	let out = str;
	if (maxWidth && clip) out = clipText(ctx, str, maxWidth);
	if (letterSpacing && 'letterSpacing' in ctx) {
		(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
			`${letterSpacing}px`;
	}
	if (stroke) {
		ctx.strokeStyle = color;
		ctx.lineWidth = stroke;
		ctx.lineJoin = 'round';
		ctx.miterLimit = 2;
		ctx.strokeText(out, x, y, maxWidth && !clip ? maxWidth : undefined);
	}
	ctx.fillText(out, x, y, maxWidth && !clip ? maxWidth : undefined);
	ctx.restore();
};

/** 按当前 font 截断到 maxWidth(尾部加 …) */
const clipText = (ctx: CanvasRenderingContext2D, str: string, maxWidth: number) => {
	if (ctx.measureText(str).width <= maxWidth) return str;
	let out = str;
	while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
	return `${out}…`;
};

/** 量一段文字的宽度(用同一套 font 口径,免得量一次画一次对不上) */
const measure = (
	ctx: CanvasRenderingContext2D,
	str: string,
	size: number,
	weight: number | string = 400,
	family?: string
) => {
	ctx.save();
	ctx.font = font(weight, size, family);
	const w = ctx.measureText(str).width;
	ctx.restore();
	return w;
};

/**
 * 挑一个能塞进 maxWidth 的字号(从想要的大小往下试)。
 * 分数/关数这些是玩家数据,位数没上限 —— 与其截成「12,345 / 2,…」不如整体降一档字号。
 */
const fittedSize = (
	ctx: CanvasRenderingContext2D,
	str: string,
	maxWidth: number,
	size: number,
	minSize: number,
	weight: number | string = 400,
	family?: string
) => {
	let s = size;
	while (s > minSize && measure(ctx, str, s, weight, family) > maxWidth) s -= 2;
	return s;
};

/** 渐变文字(标题用) */
const paintGradientText = (
	ctx: CanvasRenderingContext2D,
	str: string,
	x: number,
	y: number,
	size: number,
	from: string,
	to: string
) => {
	ctx.save();
	ctx.font = font(400, size, FONT_BRUSH);
	ctx.textBaseline = 'alphabetic';
	const grad = ctx.createLinearGradient(0, y - size, 0, y + size * 0.2);
	grad.addColorStop(0, from);
	grad.addColorStop(1, to);
	ctx.fillStyle = grad;
	ctx.shadowColor = 'rgba(251, 191, 36, 0.35)';
	ctx.shadowBlur = 26;
	ctx.fillText(str, x, y);
	ctx.restore();
};

/** 首页那套「百分比宽度 + 固定字体子集」的骰面:白面 + 深色点(4 点红) */
const drawDie = (
	ctx: CanvasRenderingContext2D,
	value: number,
	x: number,
	y: number,
	size: number
) => {
	ctx.save();
	ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
	ctx.shadowBlur = size * 0.18;
	ctx.shadowOffsetY = size * 0.07;
	roundRectPath(ctx, x, y, size, size, size * 0.22);
	const grad = ctx.createLinearGradient(x, y, x + size, y + size);
	grad.addColorStop(0, '#fdfbf5');
	grad.addColorStop(1, '#ece4d0');
	ctx.fillStyle = grad;
	ctx.fill();
	ctx.restore();

	// 点阵:3×3 网格(和页面里那颗 24×24 的 SVG 同一个点位),4 点画红
	const pipR = size * (2.6 / 24);
	ctx.fillStyle = value === 4 ? COLOR.dieRed : COLOR.dieInk;
	for (let pos = 1; pos <= 9; pos++) {
		if (!(DICE_PIPS[value] ?? []).includes(pos)) continue;
		const col = (pos - 1) % 3;
		const row = Math.floor((pos - 1) / 3);
		const cx = x + size * (1 / 6 + col / 3);
		const cy = y + size * (1 / 6 + row / 3);
		ctx.beginPath();
		ctx.arc(cx, cy, pipR, 0, Math.PI * 2);
		ctx.fill();
	}
};

/**
 * 月圆夜空:星星 + 一轮满月(带光晕/月斑,再飘两条淡淡的云)。
 * 星点用确定性随机 —— 同一份数据永远画同一张图,QA 截图不会自己抖。
 */
const drawSky = (ctx: CanvasRenderingContext2D, L: PosterLayout, seedOffset: number) => {
	let seed = 0x9e3779b9 ^ seedOffset;
	const rnd = () => {
		seed = (seed + 0x6d2b79f5) >>> 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};

	// 星:细碎的那些压在夜空上半,越靠近插画越稀(下半部要留给数据)
	for (let i = 0; i < 240; i++) {
		const x = rnd() * W;
		const y = rnd() * (L.bannerTop - 40);
		const r = 0.6 + rnd() * 1.7;
		ctx.globalAlpha = (0.12 + rnd() * 0.45) * (1 - y / L.bannerTop / 1.6);
		ctx.fillStyle = '#e2e8f0';
		ctx.beginPath();
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.globalAlpha = 1;

	// 月亮
	const { x: mx, y: my, r: mr } = L.moon;
	const halo = ctx.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 3.4);
	halo.addColorStop(0, 'rgba(253, 230, 138, 0.32)');
	halo.addColorStop(0.45, 'rgba(251, 191, 36, 0.10)');
	halo.addColorStop(1, 'rgba(251, 191, 36, 0)');
	ctx.fillStyle = halo;
	ctx.beginPath();
	ctx.arc(mx, my, mr * 3.4, 0, Math.PI * 2);
	ctx.fill();

	const disc = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.35, mr * 0.2, mx, my, mr);
	disc.addColorStop(0, '#fffdf5');
	disc.addColorStop(0.7, '#fdf1cf');
	disc.addColorStop(1, '#f3ddae');
	ctx.fillStyle = disc;
	ctx.beginPath();
	ctx.arc(mx, my, mr, 0, Math.PI * 2);
	ctx.fill();

	// 月斑(玉兔/桂树总得有个意思):几块低透明度的暖灰,各自独立路径 ——
	// 连着画会变成一条带连线的怪形状(踩过)
	ctx.globalAlpha = 0.12;
	ctx.fillStyle = '#b08a4a';
	const craters: [number, number, number][] = [
		[-0.3, 0.12, 0.24],
		[0.3, -0.26, 0.16],
		[0.08, 0.4, 0.11]
	];
	for (const [dx, dy, cr] of craters) {
		ctx.beginPath();
		ctx.arc(mx + dx * mr, my + dy * mr, cr * mr, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.globalAlpha = 1;

	// 飘过月亮的淡淡云带
	ctx.save();
	ctx.globalAlpha = 0.16;
	ctx.fillStyle = '#dbe4f5';
	ctx.beginPath();
	ctx.ellipse(mx - mr * 1.6, my + mr * 0.55, mr * 1.5, mr * 0.24, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.beginPath();
	ctx.ellipse(mx + mr * 1.2, my - mr * 0.75, mr * 1.1, mr * 0.18, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();

	// 四角星(夜空的点睛:几颗大一点的带光晕的星)
	for (let i = 0; i < 9; i++) {
		const x = 90 + rnd() * (W - 180);
		const y = 30 + rnd() * (L.bannerTop - 300);
		const s = 3 + rnd() * 4;
		ctx.save();
		ctx.globalAlpha = 0.5 + rnd() * 0.4;
		ctx.fillStyle = '#fef3c7';
		ctx.shadowColor = 'rgba(253, 230, 138, 0.9)';
		ctx.shadowBlur = 12;
		ctx.beginPath();
		ctx.moveTo(x, y - s);
		ctx.quadraticCurveTo(x + s * 0.18, y - s * 0.18, x + s, y);
		ctx.quadraticCurveTo(x + s * 0.18, y + s * 0.18, x, y + s);
		ctx.quadraticCurveTo(x - s * 0.18, y + s * 0.18, x - s, y);
		ctx.quadraticCurveTo(x - s * 0.18, y - s * 0.18, x, y - s);
		ctx.fill();
		ctx.restore();
	}
};

/* ============================ 贴图加载 ============================ */

const assetCache = new Map<string, Promise<HTMLImageElement | null>>();

const loadAsset = (src: string) => {
	const hit = assetCache.get(src);
	if (hit) return hit;
	const task = new Promise<HTMLImageElement | null>((resolve) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => resolve(null);
		img.src = src;
	});
	assetCache.set(src, task);
	return task;
};

/**
 * 插画的源链:AVIF 优先,老内核退回 JPEG,都拉不到再退回纯渐变(见 drawBanner)。
 *
 * 同一张 1080×430 的图,AVIF q70 = 41KB / PSNR 41.5dB,JPEG q90 = 101KB / 37.1dB ——
 * 尺寸和清晰度都是 AVIF 赢,所以它走前面;JPEG 只是给不认识 AVIF 的浏览器兜底
 * (真正下载的只有第一个能解出来的那个)。生成脚本:tools/zhongqiu/make-poster-assets.mjs
 */
const BANNER_SOURCES = ['/zhongqiu/poster-banner.avif', '/zhongqiu/poster-banner.jpg'];

/** 按源链依次试,返回第一张能解码的插画 */
const loadBanner = async () => {
	for (const src of BANNER_SOURCES) {
		const img = await loadAsset(src);
		if (img) return img;
	}
	return null;
};

/** 海报用到的汉字 + emoji 都在自带子集里,先把它们拉下来再画(否则第一帧是豆腐块) */
const BRUSH_PROBE = '我的战绩中秋博饼大会来挑战记录队伍点数骰子的结算次本局购买加成卡';
const ensureFonts = async () => {
	if (typeof document === 'undefined' || !document.fonts) return;
	try {
		await document.fonts.ready;
		await Promise.all([
			document.fonts.load(`64px "Zhongqiu Poster Emoji"`, Object.values(ICON).join('')),
			document.fonts.load(`64px "Zhongqiu Brush"`, BRUSH_PROBE)
		]);
	} catch {
		// 字体拉不到就退回系统字体,不挡着出图
	}
};

/* ============================ 各段落 ============================ */

/**
 * 顶部一行:🌕 中秋博饼大会(左) + 日期(右),整行在 TOP_BAR_H 里垂直居中。
 * 徽章是小字号毛笔字,笔画偏细 —— 同色描边垫粗一圈,才压得住这张深蓝底。
 */
const drawTopBar = (ctx: CanvasRenderingContext2D, L: PosterLayout, date: string) => {
	// 徽章里那颗月亮是**画的**,不是 emoji:单色 emoji 的月亮是细圈,放大到徽章尺寸反而发虚,
	// 自己画一颗金月盘(和夜空那轮同一个色)更精神
	const badgeText = ZQ_SHARE_TITLE;
	const size = SIZE.badge;
	const moonR = 13;
	const moonGap = 14;
	const bw = moonR * 2 + moonGap + measure(ctx, badgeText, size, 400, FONT_BRUSH) + 34;
	const bh = Math.round(TOP_BAR_H * 0.86);
	const by = L.topBarTop + Math.round((TOP_BAR_H - bh) / 2);
	roundRectPath(ctx, M, by, bw, bh, bh / 2);
	ctx.fillStyle = 'rgba(8, 13, 32, 0.45)';
	ctx.fill();
	ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
	ctx.lineWidth = 1.5;
	ctx.stroke();
	const cy = L.topBarTop + TOP_BAR_H / 2;
	const mx = M + 22 + moonR;
	ctx.save();
	ctx.shadowColor = 'rgba(253, 230, 138, 0.75)';
	ctx.shadowBlur = 14;
	const moonGrad = ctx.createRadialGradient(mx - moonR * 0.3, cy - moonR * 0.35, 1, mx, cy, moonR);
	moonGrad.addColorStop(0, '#fffdf5');
	moonGrad.addColorStop(0.7, '#fdf1cf');
	moonGrad.addColorStop(1, '#f3ddae');
	ctx.fillStyle = moonGrad;
	ctx.beginPath();
	ctx.arc(mx, cy, moonR, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
	paintText(ctx, badgeText, mx + moonR + moonGap, cy + 3, {
		size,
		family: FONT_BRUSH,
		color: '#fde68a',
		baseline: 'middle',
		stroke: 1.4
	});
	// 日期(右上,和徽章同一条中线)
	paintText(ctx, date, W - M, L.topBarTop + TOP_BAR_H / 2 + 1, {
		size: SIZE.date,
		weight: 600,
		color: 'rgba(226, 232, 240, 0.85)',
		align: 'right',
		baseline: 'middle'
	});
};

const drawTitle = (ctx: CanvasRenderingContext2D, L: PosterLayout, data: PosterData) => {
	paintGradientText(ctx, '我的战绩', M, L.titleBase, SIZE.title, '#fde68a', COLOR.amberDeep);

	// 右上:新纪录金牌 / 历史最高(两者不并存,免得自相矛盾)。
	// 徽章/最高纪录的中心线和标题那一段的中心线对齐 —— 不靠手调,靠段高算。
	const midY = L.titleTop + Math.round(L.titleH / 2);
	if (data.isNewBest) {
		const label = `${ICON.record} 新纪录`;
		const size = 30;
		const bw = measure(ctx, label, size, 400, FONT_BRUSH) + 46;
		const bh = 56;
		const bx = W - M - bw;
		const by = midY - bh / 2;
		roundRectPath(ctx, bx, by, bw, bh, bh / 2);
		const g = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
		g.addColorStop(0, '#fcd34d');
		g.addColorStop(1, COLOR.amberDeep);
		ctx.fillStyle = g;
		ctx.shadowColor = 'rgba(251, 191, 36, 0.5)';
		ctx.shadowBlur = 22;
		ctx.fill();
		ctx.shadowBlur = 0;
		paintText(ctx, label, bx + bw / 2, by + bh / 2 + 3, {
			size,
			family: FONT_BRUSH,
			color: '#3b2408',
			align: 'center',
			baseline: 'middle',
			stroke: 1
		});
	} else if (data.bestScore > 0) {
		paintText(
			ctx,
			`历史最高 ${data.bestScore.toLocaleString('zh-CN')} · 第 ${data.bestRound} 关`,
			W - M,
			midY + 10,
			{ size: 28, color: COLOR.textFaint, align: 'right', baseline: 'middle' }
		);
	}
};

const drawHero = (
	ctx: CanvasRenderingContext2D,
	L: PosterLayout,
	data: PosterData,
	qr: HTMLImageElement | null
) => {
	// 左:本局总分(标签紧贴大字,中间不留空档)
	paintText(ctx, '本局总分', M, L.heroLabelBase, {
		size: SIZE.heroLabel,
		weight: 500,
		color: COLOR.textDim,
		letterSpacing: 6
	});
	// 分数可能很长(百万级):先量再挑字号,填不下就降一档 —— 直接交给 fillText 的
	// maxWidth 会把字横着压扁,数字会显得又瘦又怪。
	const scoreText = data.score.toLocaleString('zh-CN');
	const scoreMaxW = W - M - QR_W - 24 - M;
	const scoreSize = fittedSize(ctx, scoreText, scoreMaxW, SIZE.heroScore, 64, 700);
	paintText(ctx, scoreText, M, L.scoreBase, {
		size: scoreSize,
		weight: 700,
		color: COLOR.amber,
		shadow: 'rgba(251, 191, 36, 0.35)'
	});

	// 左下的数据行:关卡 / 本关 / 历时。本关那条后期可能变长,所以整行按可用宽度降字号
	const info = `倒在了第 ${data.round} 关 · 本关 ${data.roundScore.toLocaleString('zh-CN')} / ${data.roundTarget.toLocaleString('zh-CN')} · 历时 ${data.duration}`;
	const infoMaxW = W - M - QR_W - 24 - M;
	paintText(ctx, info, M, L.infoBase, {
		size: fittedSize(ctx, info, infoMaxW, SIZE.heroInfo, 22),
		color: COLOR.textDim
	});

	// 右:二维码白牌 —— 行动号召就在码下面,一行 sans,宽度和码差不多
	const x = W - M - QR_W;
	const y = L.qrTop;
	ctx.save();
	ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
	ctx.shadowBlur = 28;
	ctx.shadowOffsetY = 10;
	roundRectPath(ctx, x, y, QR_W, QR_H, 22);
	ctx.fillStyle = COLOR.plate;
	ctx.fill();
	ctx.restore();

	if (qr) {
		ctx.drawImage(qr, x + QR_PAD, y + QR_PAD, QR_SIZE, QR_SIZE);
	} else {
		paintText(ctx, '二维码', x + QR_W / 2, y + QR_PAD + QR_SIZE / 2, {
			size: 26,
			color: COLOR.plateText,
			align: 'center',
			baseline: 'middle'
		});
	}
	paintText(
		ctx,
		'来挑战我的记录',
		x + QR_W / 2,
		y + QR_PAD + QR_SIZE + 22 + lineBase(SIZE.qrCaption),
		{
			size: SIZE.qrCaption,
			weight: 700,
			color: COLOR.plateText,
			align: 'center'
		}
	);
};

const drawChips = (ctx: CanvasRenderingContext2D, L: PosterLayout, data: PosterData) => {
	const items = [
		{ icon: ICON.sold, label: '卖出 Tee', value: `${data.soldTees}`, color: COLOR.text },
		{ icon: ICON.cards, label: '买下加成卡', value: `${data.cardsBought}`, color: COLOR.text },
		{
			icon: ICON.mooncakes,
			label: '赚到月饼币',
			value: `${data.earnedMooncakes}`,
			color: COLOR.amber
		},
		{ icon: ICON.reroll, label: '重掷骰子', value: `${data.rerolled}`, color: COLOR.text }
	];
	const gap = 20;
	const cw = (CW - gap * (items.length - 1)) / items.length;
	items.forEach((item, i) => {
		const x = M + i * (cw + gap);
		const y = L.chipsTop;
		roundRectPath(ctx, x, y, cw, CHIPS_H, 20);
		ctx.fillStyle = COLOR.chip;
		ctx.fill();
		ctx.strokeStyle = COLOR.chipLine;
		ctx.lineWidth = 1;
		ctx.stroke();

		// 数值在卡片上半、标签贴底;两者之间的空档要留够(数字和说明贴太近会显得挤),
		// 但**卡片高度一个字都不改** —— 版面求解那边按 CHIPS_H 算的,动了就全乱。
		paintText(ctx, item.value, x + cw / 2, y + Math.round(CHIPS_H * 0.4), {
			size: SIZE.chipValue,
			weight: 700,
			color: item.color,
			align: 'center',
			baseline: 'middle'
		});
		// 单色 emoji 跟着标签一个颜色(不给它单独上色)—— 图标与文字就是同一段
		paintText(ctx, `${item.icon} ${item.label}`, x + cw / 2, y + CHIPS_H - 20, {
			size: SIZE.chipLabel,
			color: COLOR.textDim,
			align: 'center'
		});
	});
};

/** 骰子标题 */
const drawDiceLabel = (ctx: CanvasRenderingContext2D, L: PosterLayout) => {
	paintText(ctx, `${ICON.dice} 点数骰子的结算次数`, M, L.diceLabelBase, {
		size: SIZE.sectionLabel,
		family: FONT_BRUSH,
		color: COLOR.text,
		stroke: 0.9
	});
};

const drawDice = (ctx: CanvasRenderingContext2D, L: PosterLayout, data: PosterData) => {
	const n = 6;
	const step = CW / n;
	for (let i = 0; i < n; i++) {
		const cellX = M + i * step;
		const dieX = cellX + (step - DICE_SIZE) / 2;
		drawDie(ctx, i + 1, dieX, L.diceTop, DICE_SIZE);
		// 结算次数写在骰子正下方(写在右边容易被当成「点数」读)
		paintText(ctx, `${data.scoredFaces[i] ?? 0}`, dieX + DICE_SIZE / 2, L.diceCountBase, {
			size: SIZE.diceCount,
			weight: 700,
			color: COLOR.text,
			align: 'center'
		});
	}
};

/** 本局购入最多的加成卡(单独一行,左对齐;放不下就降字号) */
const drawBuffs = (ctx: CanvasRenderingContext2D, L: PosterLayout, data: PosterData) => {
	if (!L.hasBuffs) return;
	const y = L.buffsBase;
	const prefix = `${ICON.buffs} 本局购买加成卡：`;
	const sep = '  ·  ';
	const parts = data.buffs.map((b) => `${b.name} ×${b.count}`);
	let size = SIZE.buff;
	const width = () =>
		measure(ctx, prefix, size, 600) +
		parts.reduce((n, p) => n + measure(ctx, p, size, 600), 0) +
		measure(ctx, sep, size) * (parts.length - 1);
	while (width() > CW && size > 20) size -= 2;
	paintText(ctx, prefix, M, y, { size, weight: 600, color: COLOR.textDim });
	let x = M + measure(ctx, prefix, size, 600);
	parts.forEach((p, i) => {
		if (i > 0) {
			paintText(ctx, sep, x, y, { size, color: COLOR.textFaint });
			x += measure(ctx, sep, size);
		}
		paintText(ctx, p, x, y, {
			size,
			weight: 600,
			color: data.buffs[i].color,
			maxWidth: CW,
			clip: true
		});
		x += measure(ctx, p, size, 600);
	});
};

const drawTeam = async (ctx: CanvasRenderingContext2D, L: PosterLayout, data: PosterData) => {
	paintText(ctx, `${ICON.team} 队伍`, M, L.teamLabelBase, {
		size: SIZE.sectionLabel,
		family: FONT_BRUSH,
		color: COLOR.text,
		stroke: 0.9
	});

	const list = data.team.slice(0, 6);
	if (!list.length) return;
	const gap = 14;
	// 队伍不满 6 只(卖掉了 Tee)时不要拉得比 6 只还宽:封顶后整排居中
	const cw = Math.min(158, (CW - gap * (list.length - 1)) / list.length);
	const rowW = cw * list.length + gap * (list.length - 1);
	const startX = M + (CW - rowW) / 2;

	const images = await Promise.all(list.map((t) => loadTeeSkin({ name: t.skin })));

	list.forEach((tee, i) => {
		const x = startX + i * (cw + gap);
		const y = L.teamTop;
		roundRectPath(ctx, x, y, cw, TEAM_CARD_H, 18);
		ctx.fillStyle = tee.isSelf ? 'rgba(251, 191, 36, 0.12)' : COLOR.chip;
		ctx.fill();
		ctx.strokeStyle = tee.color;
		ctx.lineWidth = 2;
		ctx.stroke();

		// 头像在上、名字贴底(卡片高度变了也照比例走)
		const img = images[i];
		const avatarY = y + Math.round((TEAM_CARD_H - TEAM_AVATAR - 26) / 2);
		if (img) drawTee(ctx, img, { x: x + (cw - TEAM_AVATAR) / 2, y: avatarY, size: TEAM_AVATAR });
		paintText(ctx, tee.isSelf ? '我' : tee.name, x + cw / 2, y + TEAM_CARD_H - 16, {
			size: SIZE.teamName,
			weight: 700,
			color: tee.isSelf ? COLOR.amber : COLOR.text,
			align: 'center',
			clip: true,
			maxWidth: cw - 14
		});
	});
};

/**
 * 底部的暖色插画:铺满整宽,上沿渐入夜色(不然会切出一条硬边)。
 * 高度由版面求解给出 —— 恰好是原图比例时**整张都看得见**,更高时才会裁左右。
 */
const drawBanner = (
	ctx: CanvasRenderingContext2D,
	L: PosterLayout,
	img: HTMLImageElement | null
) => {
	const y = L.bannerTop;
	const h = L.bannerH;
	if (img) {
		const scale = Math.max(W / img.naturalWidth, h / img.naturalHeight);
		const sw = W / scale;
		const sh = h / scale;
		const sx = (img.naturalWidth - sw) / 2;
		const sy = Math.max(0, (img.naturalHeight - sh) / 2);
		ctx.drawImage(img, sx, sy, sw, sh, 0, y, W, h);

		const fadeH = Math.min(h * 0.28, 120);
		const fade = ctx.createLinearGradient(0, y, 0, y + fadeH);
		fade.addColorStop(0, COLOR.bgMid);
		fade.addColorStop(0.5, 'rgba(24, 34, 70, 0.5)');
		fade.addColorStop(1, 'rgba(24, 34, 70, 0)');
		ctx.fillStyle = fade;
		ctx.fillRect(0, y, W, fadeH);
	} else {
		// 图没拉到时别开天窗:一块暖色渐变顶着
		const g = ctx.createLinearGradient(0, y, 0, y + h);
		g.addColorStop(0, COLOR.bgMid);
		g.addColorStop(1, '#5a3a1c');
		ctx.fillStyle = g;
		ctx.fillRect(0, y, W, h);
	}
};

/* ============================= 出口 ============================= */

export interface RenderPosterOptions {
	/** 导出倍率(默认 1 → 1080×1620;要缩略图给 0.5) */
	scale?: number;
}

/**
 * 画一张战绩海报。返回的 canvas 直接可以 `toBlob()` / `toDataURL()`。
 * 出场人物的皮肤 + 插画 + 二维码并行拉;皮肤拉不到的自动回退内置占位图。
 */
export const renderPoster = async (
	data: PosterData,
	opts: RenderPosterOptions = {}
): Promise<HTMLCanvasElement> => {
	const scale = opts.scale ?? 1;
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(W * scale);
	canvas.height = Math.round(H * scale);
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('拿不到 2d 上下文');

	await ensureFonts();
	const [banner, qr] = await Promise.all([loadBanner(), loadAsset('/zhongqiu/poster-qr.png')]);

	const L = computeLayout(data);

	ctx.save();
	ctx.scale(scale, scale);

	// 夜空:整块底色(上深下浅)+ 星星 + 满月
	const bg = ctx.createLinearGradient(0, 0, 0, L.bannerTop);
	bg.addColorStop(0, COLOR.bgTop);
	bg.addColorStop(0.5, COLOR.bgMid);
	bg.addColorStop(1, COLOR.bgBottom);
	ctx.fillStyle = COLOR.bgTop;
	ctx.fillRect(0, 0, W, H);
	ctx.fillStyle = bg;
	ctx.fillRect(0, 0, W, L.bannerTop);
	drawSky(ctx, L, data.score);

	// 底部的暖色插画:先铺它,数据/标题那几段随后压在夜空上
	drawBanner(ctx, L, banner);
	drawTopBar(ctx, L, data.date);
	drawTitle(ctx, L, data);
	drawHero(ctx, L, data, qr);
	drawChips(ctx, L, data);
	drawDiceLabel(ctx, L);
	drawDice(ctx, L, data);
	drawBuffs(ctx, L, data);
	await drawTeam(ctx, L, data);

	ctx.restore();
	return canvas;
};

/** 海报文件名:带上总分和关卡,一个玩家的多张不会互相覆盖 */
export const posterFilename = (data: PosterData) =>
	`中秋博饼-${data.score}-第${data.round}关-${data.date}.png`;
