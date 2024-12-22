import { error } from '@sveltejs/kit';
import type { PageServerData } from './$types';
import { convert } from '$lib/server/imgproxy';

export const load: PageServerData = async ({ setHeaders }) => {
	setHeaders({
		'cache-control': 'public, max-age=600'
	});

	const data = await (await fetch('https://ddnet.org/releases/maps.json')).json();
	if (!data[0]) {
		return error(404);
	}

	const converts = [];

	for (const map of data) {
		converts.push(
			(async () => {
				if (map.thumbnail) {
					map.thumbnail = (await convert(map.thumbnail)).toString();
				}
			})()
		);
	}

	await Promise.allSettled(converts);

	return {
		maps: data as {
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
		}[]
	};
};
