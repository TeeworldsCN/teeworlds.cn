import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { convert } from '$lib/server/imgproxy';

// turn off SSR for this route, this can make sure the huge json data is cached on first load
// caching is 10 minutes which should be a reasonable enough time for a user to browse maps uninterrupted
export const ssr = false;

export const load: PageServerLoad = async ({ setHeaders, parent }) => {
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

	setHeaders({
		'cache-control': 'public, max-age=600'
	});

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
		}[],
		...(await parent())
	};
};
