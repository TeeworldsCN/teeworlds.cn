import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { KNOWN_REGIONS } from '$lib/ddnet/helpers';
import { latest, regionalLatest } from '$lib/server/fetches/latest';

export const GET: RequestHandler = async ({ url }) => {
	// ?region=chn for a specific server region, no region for the whole world
	const region = url.searchParams.get('region')?.toUpperCase();

	if (region && !Object.hasOwn(KNOWN_REGIONS, region)) {
		return error(404, 'Unknown region');
	}

	const cache = await (region ? regionalLatest(region) : latest).fetchAsString();
	return new Response(cache.result, {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, max-age=3'
		}
	});
};
