import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { KNOWN_REGIONS } from '$lib/ddnet/helpers';
import { latestFinishes } from '$lib/server/fetches/latest';

export const GET: RequestHandler = async ({ url }) => {
	// ?region=chn&type=novice;两个参数都可以省略
	const region = url.searchParams.get('region')?.toUpperCase() || null;
	const type = url.searchParams.get('type') || null;

	if (region && !Object.hasOwn(KNOWN_REGIONS, region)) {
		return error(404, 'Unknown region');
	}

	const cache = latestFinishes(region, type);
	if (!cache) return error(404, 'Unknown map type');

	const result = await cache.fetchAsString();
	return new Response(result.result, {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, max-age=3'
		}
	});
};
