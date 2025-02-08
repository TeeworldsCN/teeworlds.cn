import { FetchCache } from '$lib/server/fetch-cache';
import { convert } from '$lib/server/imgproxy';

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

export const maps = new FetchCache<MapList>(
	'https://ddnet.org/releases/maps.json',
	async (response) => {
		const result = await response.json();
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
			}

			await Promise.allSettled(converts);
		}
		return result;
	}
);
