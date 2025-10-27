import { FetchCache } from '$lib/server/fetch-cache';
import { convert } from '$lib/server/imgproxy';
import { volatile } from '../keyv';

export type MapList = {
	name: string;
	website: string;
	thumbnail: string;
	web_preview: string;
	type: string;
	points: number;
	difficulty: number;
	mapper?: string;
	release?: string;
	width: number;
	height: number;
	tiles: string[];
}[];

const fetchDDStats = async () => {
	const result = await fetch(`https://ddstats.tw/maps/json`);

	if (!result.ok) {
		throw new Error(`Failed to fetch data: ${result.status} ${result.statusText}`);
	}

	const json = (await result.json()) as {
		map: string;
		server: string;
		points: number;
		stars: number;
		mapper: string;
		timestamp?: string;
	}[];

	const map = new Map<string, (typeof json)['0']>();

	for (const item of json) {
		map.set(item.map, item);
	}

	return map;
};

export const maps = new FetchCache<MapList>(
	'https://ddnet.org/releases/maps.json',
	async (response) => {
		const result = await response.json();
		const databaseMaps = await fetchDDStats();
		if (result[0]) {
			const converts: Promise<void>[] = [];
			for (const map of result) {
				converts.push(
					(async () => {
						if (map.thumbnail) {
							map.thumbnail = await convert(map.thumbnail);
						}
						delete map.website;
						delete map.web_preview;
					})()
				);

				// correct map info from database data
				const databaseMap = databaseMaps.get(map.name);

				if (databaseMap) {
					if (databaseMap.server) map.type = databaseMap.server;
					if (databaseMap.points) map.points = databaseMap.points;
					if (databaseMap.stars) map.difficulty = databaseMap.stars;
					if (databaseMap.mapper) map.mapper = databaseMap.mapper;
					if (databaseMap.timestamp) map.release = databaseMap.timestamp;
				}
			}

			await Promise.allSettled(converts);
		}
		return result;
	},
	{
		version: 8
	}
);
