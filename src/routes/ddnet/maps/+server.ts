import { convert } from '$lib/server/imgproxy';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { FetchCache } from '$lib/server/fetch-cache';

export type MapList = {
	name: string;
	website: string;
	thumbnail: string;
	web_preview: string;
	type: string;
	points: number;
	difficulty: number;
	mapper: string;
	release: string;
	width: number;
	height: number;
	tiles: string[];
}[];

const map = new FetchCache('https://ddnet.org/releases/maps.json', async (response) => {
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
	return JSON.stringify(result);
});

export const GET: RequestHandler = async ({ url }) => {
	const json = url.searchParams.get('json');
	if (!json) {
		return new Response('Not Found', { status: 404 });
	}

	try {
		const data = await map.fetch();
		return new Response(data, {
			headers: {
				'content-type': 'application/json',
				'cache-control': 'public, max-age=600'
			}
		});
	} catch {
		return error(404);
	}
};
