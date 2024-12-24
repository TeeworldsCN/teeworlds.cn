import { convert } from '$lib/server/imgproxy';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { keyv } from '$lib/server/keyv';

export const GET: RequestHandler = async () => {
	const cached = await keyv.get('ddnet:maps');
	if (cached) {
		return new Response(cached, {
			headers: {
				'content-type': 'application/json',
				'cache-control': 'public, max-age=600'
			}
		});
	}

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

    // cache for 10 minutes
    const result = JSON.stringify(data);
	await keyv.set('ddnet:maps', result, 600_000);

	return new Response(result, {
		headers: {
			'content-type': 'application/json',
			'cache-control': 'public, max-age=600'
		}
	});
};
