import { error } from '@sveltejs/kit';
import { getMapThumbnails } from '$lib/server/fetches/maps';
import {
	getWatchableTvDemos,
	type WatchableEntry,
	type WatchablePartition
} from '$lib/server/fetches/watchable';
import type { PageServerLoad } from './$types';

/** 一页 6 张播放卡片(两行三列,手机上是一列) */
const PAGE_SIZE = 6;

/** 只把卡片要用的字段发到客户端,别把整份 watchable 数据塞进 HTML */
export type TvCard = {
	uuid: string;
	map: string;
	/** 完赛时间,秒 */
	time: number;
	/** 完赛时间戳,秒 */
	ts: number;
	/** 'team' | 'solo' */
	kind: string;
	rank: number;
	names: string[];
	finishers: number[];
	cid: number;
	/** 地图缩略图(卡片背景);不在官方地图列表里的图没有 */
	thumbnail: string | null;
};

const toCard = (entry: WatchableEntry, thumbnails: Map<string, string>): TvCard => ({
	uuid: entry.uuid,
	map: entry.map,
	time: parseFloat(entry.time),
	ts: entry.ts,
	kind: entry.kind,
	rank: entry.rank,
	names: entry.names,
	finishers: entry.finishers,
	cid: entry.cid,
	thumbnail: thumbnails.get(entry.map.toLowerCase()) ?? null
});

export const load: PageServerLoad = async ({ url, setHeaders }) => {
	// 隐藏参数:?invalid=1 看的是 `kept: true` 的历史回放(名次已经不在的那种)
	const invalid = url.searchParams.get('invalid') === '1';
	const partition: WatchablePartition = invalid ? 'invalid' : 'runs';

	let demos: WatchableEntry[];
	try {
		demos = await getWatchableTvDemos(partition);
	} catch {
		return error(502, '回放清单暂时拉不到,稍后再试');
	}

	// 缩略图来自官方地图列表;拉不到(或者这张图不在官方列表里)就退回渐变背景
	let thumbnails = new Map<string, string>();
	try {
		thumbnails = await getMapThumbnails();
	} catch {
		// 只是少一张背景图,不要影响看电视
	}

	const pageCount = Math.max(1, Math.ceil(demos.length / PAGE_SIZE));
	const requested = Number(url.searchParams.get('page') ?? '1');
	const page = Math.min(
		pageCount,
		Math.max(1, Number.isFinite(requested) ? Math.floor(requested) : 1)
	);
	const offset = (page - 1) * PAGE_SIZE;

	// 清单本身在上游更新后才会变,这里只跟着缓存走
	setHeaders({ 'cache-control': 'public, max-age=60' });

	return {
		invalid,
		page,
		pageCount,
		total: demos.length,
		items: demos.slice(offset, offset + PAGE_SIZE).map((entry) => toCard(entry, thumbnails))
	};
};
