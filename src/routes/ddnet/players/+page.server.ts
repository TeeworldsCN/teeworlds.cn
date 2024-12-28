import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ranks } from '$lib/server/fetches/ranks';

export const load: PageServerLoad = async ({ parent }) => {
	try {
		const result = await ranks.fetch();
		return { ...result, ...(await parent()) };
	} catch {
		return error(500);
	}
};
