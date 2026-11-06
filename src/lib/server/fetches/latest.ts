import { FetchCache } from '../fetch-cache';

export type LatestRecord = {
	timestamp: number;
	map: string;
	name: string;
	visible_name: string;
	time: number;
	server: string;
};

const createLatest = (country?: string) =>
	new FetchCache<LatestRecord[]>(
		country
			? `https://ddnet.org/maps/?latest=1&country=${country}`
			: 'https://ddnet.org/maps/?latest=1',
		async (response) => {
			const result = await response.json();
			return result.slice(0, 50) as LatestRecord[];
		},
		{ version: 1, minQueryInterval: 3, skipHead: true, memory: true }
	);

/** global latest finishes */
export const latest = createLatest();

// fetch caches for regional latest finishes, same as ddnet.org/ranks/<region>/
const regionCache = new Map<string, FetchCache<LatestRecord[]>>();
export const regionalLatest = (region: string) => {
	region = region.toUpperCase();

	const existing = regionCache.get(region);
	if (existing) return existing;

	const fetchCache = createLatest(region);
	regionCache.set(region, fetchCache);
	return fetchCache;
};
