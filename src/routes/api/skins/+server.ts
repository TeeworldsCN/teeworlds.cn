import { error, type RequestHandler } from '@sveltejs/kit';
import { skins } from '$lib/server/fetches/skins';

export const GET: RequestHandler = async () => {
	try {
		const skinsCache = await skins.fetchAsString();
		return new Response(skinsCache.result, {
			headers: {
				'content-type': 'application/json',
				'cache-control': 'public, max-age=1200',
				'x-twcn-cache-hit': skinsCache.hit ? 'hit' : 'miss',
				'last-modified': new Date(skinsCache.timestamp).toUTCString()
			}
		});
	} catch {
		return error(500);
	}
};
