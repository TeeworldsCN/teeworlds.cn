import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ranks } from '$lib/server/fetches/ranks';

export const load = (async ({ parent }) => {
	try {
		const result = await ranks.fetch();
		return { ...result, ...(await parent()) };
	} catch {
		return error(500);
	}
}) satisfies PageServerLoad;
