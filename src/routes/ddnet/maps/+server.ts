import { convert } from '$lib/server/imgproxy';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { keyv } from '$lib/server/keyv';

let nextQueryTime = 0;
let minQueryInterval = 60;

export const GET: RequestHandler = async ({ url }) => {
	const json = url.searchParams.get('json');
	if (!json) {
		return new Response('Not Found', { status: 404 });
	}

	// TODO: maybe factor out the cache logic so we don't need to write this everytime
	const now = Date.now();

	// check if the file is updated
	let outdated = false;

	// if somehow not ok or there is no etag, just pretend it's not updated
	let tag: string | null = null;

	if (nextQueryTime < now) {
		const head = await fetch('https://ddnet.org/releases/maps.json', { method: 'HEAD' });
		if (head.ok) {
			tag = head.headers.get('etag') || head.headers.get('last-modified');
			if (tag) {
				const cachedTag = await keyv.get('ddnet:maps:tag');
				outdated = cachedTag != tag;
			}
		}
		nextQueryTime = now + minQueryInterval * 1000;
	}

	let data: string | null = null;
	// if the cache is outdated, fetch the file again
	if (outdated) {
		const result = await (await fetch('https://ddnet.org/releases/maps.json')).json();
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
