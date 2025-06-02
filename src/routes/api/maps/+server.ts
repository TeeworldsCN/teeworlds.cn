import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { maps } from '$lib/server/fetches/maps';

export const GET: RequestHandler = async () => {
	try {
		const mapsCache = await maps.fetchAsString();
		return new Response(mapsCache.result, {
			headers: {
				'content-type': 'application/json',
				'cache-control': 'public, max-age=600',
				'x-twcn-cache-hit': mapsCache.hit ? 'hit' : 'miss',
				'last-modified': new Date(mapsCache.timestamp).toUTCString()
			}
		});
	} catch {
		return error(404);
	}
};
