import { convert } from '$lib/server/imgproxy';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
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

	return new Response(JSON.stringify(data), {
		headers: {
			'content-type': 'application/json',
			'cache-control': 'public, max-age=600'
		}
	});
};
