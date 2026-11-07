import type { MapList } from '$lib/server/fetches/maps';

/**
 * 全部地图数据(和 /ddnet/maps 页同一份 /api/maps 数据,约 900 KB)。
 *
 * 放在模块级缓存里,一次浏览只会请求一次:地图列表页 → 排位页 → 再回地图页
 * 都复用同一个 Promise。失败时清掉缓存,调用方可以直接重试。
 */
let mapListPromise: Promise<MapList> | null = null;

export const loadMapList = (): Promise<MapList> => {
	if (!mapListPromise) {
		mapListPromise = (async () => {
			const response = await fetch('/api/maps');
			if (!response.ok) {
				throw new Error(response.statusText || `加载地图列表失败(${response.status})`);
			}
			return (await response.json()) as MapList;
		})().catch((error) => {
			mapListPromise = null;
			throw error;
		});
	}
	return mapListPromise;
};

/** 某类型最新发布的几张地图(按发布时间倒序;没有 release 的当作最旧) */
export const newestMapsOfType = (maps: MapList, type: string, count: number) => {
	const lower = type.toLowerCase();
	return maps
		.filter((map) => map.type.toLowerCase() === lower)
		.sort((a, b) => (b.release ?? 0) - (a.release ?? 0))
		.slice(0, count);
};
