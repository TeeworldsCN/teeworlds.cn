import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const name = url.searchParams.get('name');
		if (!name) {
			return error(404);
		}

		const gameInfo = await fetch(`https://info.ddnet.org/info?name=${encodeURIComponent(name)}`);

		return new Response(JSON.stringify((await gameInfo.json()).maps), {
			headers: {
				'content-type': 'application/json',
				'cache-control': 'public, max-age=120'
			}
		});
	} catch {
		return error(500);
	}
};
