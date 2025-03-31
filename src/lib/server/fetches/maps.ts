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

const fetchDDStats = async (sql: string) => {
	sql = sql.replace(/\n/g, ' ');
	const result = await fetch(`https://db.ddstats.org/ddnet.json?sql=${encodeURIComponent(sql)}`);

	if (!result.ok) {
		throw new Error(`Failed to fetch data: ${result.status} ${result.statusText}`);
	}

	const json = await result.json();
	if (!json.ok) {
		throw new Error(`Failed to fetch data: ${json.error}`);
	}
	return json;
};

let databaseUpdating = false;

const updateDatabaseMaps = async () => {
	databaseUpdating = true;
	let offset = 0;
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

	while (true) {
		const sql = `select Map, Server, Points, Stars, Mapper, datetime(Timestamp, "+01:00") as Release from maps limit ${offset}, 1001;`;
		const result = await fetchDDStats(sql);
		for (const row of result.rows) {
			maps[row[0]] = {
				type: row[1],
				points: row[2],
				difficulty: row[3],
				mapper: row[4],
				release: row[5] == '1970-01-01 01:00:00' ? undefined : row[5]
			};
		}
		if (!result?.truncated) {
			break;
		}
		offset += result.rows.length;
	}
	await volatile.set('ddnet:cache:dbmaps', {
		maps,
		updated: Date.now()
	});
	await volatile.delete('dd:cache:https://ddnet.org/releases/maps.json');
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
		version: 2
	}
);
