import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ranks, regionalRanks } from '$lib/server/fetches/ranks';

export const load = (async ({ parent, url }) => {
	const region = url.searchParams.get('server');

	if (region && region.toLowerCase() != region) {
		return error(404);
	}

	try {
		// fetch regional ranks if region is provided
		if (region) {
			const fetch = await regionalRanks(region);
			if (!fetch) return error(404);

			const result = (await fetch.fetch()).result;
			return { ...result, region: region.toUpperCase(), ...(await parent()) };
		}

		// otherwise just fetch global ranks
		const result = (await ranks.fetch()).result;
		return { ...result, region: 'GLOBAL', ...(await parent()) };
	} catch {
		return error(500);
	}
}) satisfies PageServerLoad;
