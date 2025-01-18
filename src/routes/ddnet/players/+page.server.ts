import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ranks, regionalRanks } from '$lib/server/fetches/ranks';

export const load = (async ({ parent, url }) => {
	const region = url.searchParams.get('server');

	try {
		// fetch regional ranks if region is provided
		if (region) {
			const fetch = await regionalRanks(region);
			if (!fetch) return error(404);

			const result = await fetch.fetch();
			return { ...result, region: region.toUpperCase(), ...(await parent()) };
		}

		// otherwise just fetch global ranks
		const result = await ranks.fetch();
		return { ...result, region: 'GLOBAL', ...(await parent()) };
	} catch {
		return error(500);
	}
}) satisfies PageServerLoad;
