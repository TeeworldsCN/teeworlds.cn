import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { maps } from '$lib/server/fetches/maps';

export const GET: RequestHandler = async () => {
	try {
		const mapsCache = await maps.fetchAsString();
		return new Response(mapsCache.result, {
			headers: {
				'access-control-allow-origin': '*',
				'access-control-allow-methods': 'GET',
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

export const OPTIONS = async () => {
	return new Response(null, {
		headers: {
			'access-control-allow-origin': '*',
			'access-control-allow-methods': 'GET'
		}
	});
};
