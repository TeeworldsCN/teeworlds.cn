import { convert } from '$lib/server/imgproxy';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { keyv } from '$lib/server/keyv';

export const GET: RequestHandler = async () => {
	const head = await fetch('https://ddnet.org/releases/maps.json', { method: 'HEAD' });

	// check if the file is updated
	let outdated = false;

	// if somehow not ok or there is no etag, just pretend it's not updated
	let tag: string | null = null;
	if (head.ok) {
		tag = head.headers.get('last-modified') || head.headers.get('etag');
		console.log(tag);
		if (tag) {
			const cachedTag = await keyv.get('ddnet:maps:tag');
			outdated = cachedTag != tag;
		}
	}

	let data: string | null = null;
	// if the cache is outdated, fetch the file again
	if (outdated) {
		const result = await (await fetch('https://ddnet.org/releases/maps.json')).json();
		if (result[0]) {
			const converts = [];
			for (const map of result) {
				converts.push(
					(async () => {
						if (map.thumbnail) {
							map.thumbnail = (await convert(map.thumbnail)).toString();
						}
					})()
				);
			}

			await Promise.allSettled(converts);

			data = JSON.stringify(result);

			if (tag) {
				// only cache if the tag is valid
				await keyv.set('ddnet:maps', data);
				await keyv.set('ddnet:maps:tag', tag);
			}
		}
	} else {
		// not outdated, just fetch the cache
		data = (await keyv.get('ddnet:maps')) as string;
	}

	if (!data) {
		return error(404);
	}

	return new Response(data, {
		headers: {
			'content-type': 'application/json',
			'cache-control': 'public, max-age=600'
		}
	});
};
