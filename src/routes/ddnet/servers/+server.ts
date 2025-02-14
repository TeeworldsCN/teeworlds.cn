import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { gameInfo, servers } from '$lib/server/fetches/servers';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const serversData = await servers.fetch();
		const gameInfoData = await gameInfo.fetch();

		return new Response(
			JSON.stringify({
				servers: serversData.servers,
				gameInfo: gameInfoData
			}),
			{
				headers: {
					'content-type': 'application/json',
					'cache-control': 'public, max-age=10'
				}
			}
		);
	} catch {
		return error(500);
	}
};
