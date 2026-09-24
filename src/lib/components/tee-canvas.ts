/**
 * TeeRender 的 canvas 版 —— 把 DDNet 皮肤精灵图按**同一套几何**画到 2D 画布上。
 *
 * 为什么要有这东西:`TeeRender.svelte` 是靠一堆 CSS 背景裁切(8 列 4 行格子、
 * 身体 3×3、脚 2×1、眼睛 1×1,再按百分比摆位置)拼出来的 —— 这套东西在 canvas 上
 * 没有等价物(也没有 `html2canvas` 那种依赖),而海报 / 分享图 / 成绩单这类
 * **canvas → PNG** 的输出又离不开头像。于是把 DOM 那套几何照搬到这里:
 * 皮肤格子按图幅比例算(HD 皮肤 512×256 也照样对),画出来和 `TeeRender` 是同一只 Tee。
 *
 * 口径以 `TeeRender.svelte` 的 CSS 为准 —— 改那边记得同步这里
 * (tools/zhongqiu/qa/tee-canvas.js 有 DOM↔canvas 的像素对照用例)。
 *
 * 用法:
 * ```ts
 * const img = await loadTeeSkin({ name: 'Blit' });   // 拉不到时回退内置 x_spec
 * if (img) drawTee(ctx, img, { x: 0, y: 0, size: 96 });
 * ```
 */

import { browser } from '$app/environment';
import { skinQueue } from '$lib/skin-queue';
import { getSkinUrl } from '$lib/stores/skins';
import { X_SPEC_SKIN } from './tee-skin-data';

/** 一只 Tee 的来源:名字(走 /api/skins 解析)或现成的图片 URL */
export interface TeeSkin {
	name?: string;
	url?: string;
}

export interface TeeDrawOptions {
	/** 身体方框左上角 */
	x: number;
	y: number;
	/** 身体方框边长(整只 Tee 都按它缩放) */
	size: number;
	/** 表情列(0..7,同 TeeRender 的 emote;越界不画眼睛) */
	emote?: number;
	/** 整体不透明度 */
	alpha?: number;
	/** 水平镜像(脸朝左) */
	flip?: boolean;
	/** 绕身体中心旋转(弧度) */
	rotation?: number;
}

/**
 * 皮肤图上的格子(按图幅比例,不写死像素 —— HD 皮肤整张翻倍)。
 *
 * 形状是按 `TeeRender.svelte` 的 CSS 反推的:
 *   · 身体 3×3 格在 (0,0),描边版 3×3 格在 (3,0);
 *   · 脚 2×1 格在 (6,1),脚的描边版在 (6,2);
 *   · 眼睛 1×1 格在 (2 + emote, 3)。
 */
const TILE = {
	body: { col: 0, row: 0, cols: 3, rows: 3 },
	bodyOutline: { col: 3, row: 0, cols: 3, rows: 3 },
	/** 脚(彩色) */
	foot: { col: 6, row: 1, cols: 2, rows: 1 },
	/** 脚(描边):比彩色那只大半圈,先画它当轮廓 */
	footOutline: { col: 6, row: 2, cols: 2, rows: 1 },
	eye: { col: 2, row: 3, cols: 1, rows: 1 }
} as const;

/** 脚/眼睛在身体方框里的位置(比例,同 CSS 的 % 口径) */
const FOOT_BACK_X = -0.12;
const FOOT_FRONT_X = 0.11;
const FOOT_Y = 0.47;

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

const fallbackImage = () => loadImageFromSrc(X_SPEC_SKIN);

const loadImageFromSrc = (src: string) => {
	const cached = imageCache.get(src);
	if (cached) return cached;
	const task = new Promise<HTMLImageElement | null>((resolve) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => resolve(null);
		img.src = src;
	});
	imageCache.set(src, task);
	return task;
};

/**
 * 拉一张皮肤图(带缓存 + 与 TeeRender 共用的皮肤请求队列)。
 * 名字解析不到、或者图片加载失败 → 回退内置的 x_spec 占位图(和 DOM 版同一张)。
 */
export const loadTeeSkin = async (skin: TeeSkin | string): Promise<HTMLImageElement | null> => {
	const { name = '', url = '' } = typeof skin === 'string' ? { name: skin } : skin;
	if (!browser) return null;

	const key = url || name;
	if (key) {
		const hit = imageCache.get(key);
		if (hit) return (await hit) ?? (await fallbackImage());
	}

	let promise: Promise<HTMLImageElement | null> | null = null;
	if (url) {
		promise = loadImageFromSrc(url);
	} else if (name) {
		promise = skinQueue.push(async () => {
			const target = await getSkinUrl(name);
			return target ? await loadImageFromSrc(target) : null;
		});
	}

	if (promise) {
		imageCache.set(key, promise);
		const img = await promise;
		if (img) return img;
	}

	return await fallbackImage();
};

const srcRect = (
	img: HTMLImageElement,
	tile: { col: number; row: number; cols: number; rows: number }
) => {
	const w = img.naturalWidth || img.width;
	const h = img.naturalHeight || img.height;
	const tw = w / 8;
	const th = h / 4;
	return [tile.col * tw, tile.row * th, tile.cols * tw, tile.rows * th] as const;
};

/**
 * 把一只 Tee 画到画布上。绘制顺序照抄 TeeRender 的 DOM 次序
 * (描边脚 → 身体描边 → 前面的描边脚 → 后脚 → 身体 → 前脚 → 眼睛),
 * 前脚压在身体下缘之上、眼睛最后画 —— 顺序错了会看出「脚长在身体后面」。
 */
export const drawTee = (
	ctx: CanvasRenderingContext2D,
	img: HTMLImageElement,
	{ x, y, size, emote = 0, alpha = 1, flip = false, rotation = 0 }: TeeDrawOptions
) => {
	if (size <= 0) return;
	ctx.save();
	ctx.globalAlpha *= alpha;
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	if (rotation) {
		const cx = x + size / 2;
		const cy = y + size / 2;
		ctx.translate(cx, cy);
		ctx.rotate(rotation);
		ctx.translate(-cx, -cy);
	}
	if (flip) {
		const cx = x + size / 2;
		ctx.translate(2 * cx, 0);
		ctx.scale(-1, 1);
	}

	const body = srcRect(img, TILE.body);
	const bodyOutline = srcRect(img, TILE.bodyOutline);
	const foot = srcRect(img, TILE.foot);
	const footOutline = srcRect(img, TILE.footOutline);

	// 脚:元素框 = 身体宽 × 半高,里面装的是「2 格宽 × 1 格高」的脚图
	const footW = size;
	const footH = size / 2;
	const footY = y + FOOT_Y * size;
	const drawFoot = (rect: readonly [number, number, number, number], left: number) =>
		ctx.drawImage(img, ...rect, x + left * size, footY, footW, footH);

	drawFoot(footOutline, FOOT_BACK_X);
	ctx.drawImage(img, ...bodyOutline, x, y, size, size);
	drawFoot(footOutline, FOOT_FRONT_X);
	drawFoot(foot, FOOT_BACK_X);
	ctx.drawImage(img, ...body, x, y, size, size);
	drawFoot(foot, FOOT_FRONT_X);

	// 眼睛:40% 方框,左右各偏 16.25% 框宽;右眼是镜像的那一份
	if (emote >= 0 && emote < 8) {
		const eye = srcRect(img, { ...TILE.eye, col: TILE.eye.col + emote });
		const ew = size * 0.4;
		const ey = y + size * 0.25;
		const eyeLeft = x + size * 0.36;
		const eyeRight = x + size * 0.49;
		ctx.drawImage(img, ...eye, eyeLeft, ey, ew, ew);
		ctx.save();
		ctx.translate(eyeRight + ew, ey);
		ctx.scale(-1, 1);
		ctx.drawImage(img, ...eye, 0, 0, ew, ew);
		ctx.restore();
	}

	ctx.restore();
};

/**
 * 单只 Tee 的离屏画布(想直接拿去 `toDataURL()` / 当纹理用的话)。
 * 默认留 14% 边距:脚的贴图比身体框宽(左右各 12%),不留边会切掉脚。
 * 皮肤拉不到时返回 null(调用方自己画个占位)。
 */
export const renderTeeAvatar = async (
	skin: TeeSkin | string,
	size: number,
	opts: Omit<TeeDrawOptions, 'x' | 'y' | 'size'> & { padding?: number } = {}
): Promise<HTMLCanvasElement | null> => {
	const img = await loadTeeSkin(skin);
	if (!img) return null;
	const { padding = Math.round(size * 0.14), ...rest } = opts;
	const canvas = document.createElement('canvas');
	canvas.width = size + padding * 2;
	canvas.height = size + padding * 2;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	drawTee(ctx, img, { ...rest, x: padding, y: padding, size });
	return canvas;
};
