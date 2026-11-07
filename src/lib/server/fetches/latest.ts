import { FetchCache } from '../fetch-cache';

export type LatestRecord = {
	timestamp: number;
	map: string;
	name: string;
	visible_name: string;
	time: number;
	server: string;
};

/** 官方 latest 接口的 server 参数用类型名(大小写固定,和 maps.json 的 type 一致) */
const SERVER_TYPE_NAMES: Record<string, string> = {
	novice: 'Novice',
	moderate: 'Moderate',
	brutal: 'Brutal',
	insane: 'Insane',
	dummy: 'Dummy',
	'ddmax.easy': 'DDmaX.Easy',
	'ddmax.next': 'DDmaX.Next',
	'ddmax.pro': 'DDmaX.Pro',
	'ddmax.nut': 'DDmaX.Nut',
	oldschool: 'Oldschool',
	solo: 'Solo',
	race: 'Race',
	fun: 'Fun',
	event: 'Event'
};

const caches = new Map<string, FetchCache<LatestRecord[]>>();

/**
 * 某地区 / 类型的最新完成记录。
 *
 * 上游就是 ddnet.org/maps/?latest=1,可以用 country 和 server(类型) 组合过滤。
 * 类型名不认识时返回 null(调用方给 404)。
 */
export const latestFinishes = (region?: string | null, type?: string | null) => {
	const country = region ? region.toUpperCase() : null;
	const server = type ? SERVER_TYPE_NAMES[type.toLowerCase()] : null;
	if (type && !server) return null;

	const key = `${country ?? ''}/${server ?? ''}`;
	let cache = caches.get(key);
	if (!cache) {
		const params = new URLSearchParams({ latest: '1' });
		if (country) params.set('country', country);
		if (server) params.set('server', server);

		cache = new FetchCache<LatestRecord[]>(
			`https://ddnet.org/maps/?${params.toString()}`,
			async (response) => {
				const result = await response.json();
				return result.slice(0, 50) as LatestRecord[];
			},
			{ version: 1, minQueryInterval: 3, skipHead: true, memory: true }
		);
		caches.set(key, cache);
	}
	return cache;
};
