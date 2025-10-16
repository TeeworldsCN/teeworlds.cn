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

	const json = await result.json();
	if (!json.ok) {
		throw new Error(`Failed to fetch data: ${json.error}`);
	}
	return json as {
		map: string;
		server: string;
		points: number;
		stars: number;
		mapper: string;
		timestamp?: string;
	}[];
};

let databaseUpdating = false;

const updateDatabaseMaps = async () => {
	databaseUpdating = true;
	const maps: Record<
		string,
		{
			type: string;
			points: number;
			difficulty: number;
			mapper?: string;
			release?: string;
		}
	> = {};

	try {
		const result = await fetchDDStats();
		for (const item of result) {
			maps[item.map] = {
				type: item.server,
				points: item.points,
				difficulty: item.stars,
				mapper: item.mapper,
				release: item.timestamp == null ? undefined : item.timestamp
			};
		}

		await volatile.set('ddnet:cache:dbmaps', {
			maps,
			updated: Date.now()
		});
		await volatile.delete('dd:cache:https://ddnet.org/releases/maps.json');
	} catch (e) {
		console.error('Failed to update database maps:', e);
	}

	databaseUpdating = false;
};

const getDatabaseMaps = async () => {
	const volatileMaps = await volatile.get<{ maps: any; updated: number }>('ddnet:cache:dbmaps');

	// if the data is over a month old, update it
	if (
		!databaseUpdating &&
		(!volatileMaps || Date.now() - volatileMaps.updated > 30 * 24 * 60 * 60 * 1000)
	) {
		// don't wait for the update to finish
		updateDatabaseMaps();
	}

	return volatileMaps ? volatileMaps.maps : {};
};

export const maps = new FetchCache<MapList>(
	'https://ddnet.org/releases/maps.json',
	async (response) => {
		const result = await response.json();
		const databaseMaps = await getDatabaseMaps();
		if (result[0]) {
			const converts: Promise<void>[] = [];
			for (const map of result) {
				converts.push(
					(async () => {
						if (map.thumbnail) {
							map.thumbnail = (await convert(map.thumbnail)).toString();
						}
						delete map.website;
						delete map.web_preview;
					})()
				);

				// correct map info from database data
				const databaseMap = databaseMaps[map.name];

				if (databaseMap) {
					if (databaseMap.type) map.type = databaseMap.type;
					if (databaseMap.points) map.points = databaseMap.points;
					if (databaseMap.difficulty) map.difficulty = databaseMap.difficulty;
					if (databaseMap.mapper) map.mapper = databaseMap.mapper;
					if (databaseMap.release) map.release = databaseMap.release;
				}
			}

			await Promise.allSettled(converts);
		}
		return result;
	},
	{
		version: 4
	}
);
