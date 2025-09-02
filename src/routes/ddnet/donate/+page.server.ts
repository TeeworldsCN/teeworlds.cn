import type { PageServerLoad } from './$types';
import { donate } from '$lib/server/fetches/donate';

export const load: PageServerLoad = async () => {
	try {
		const donateData = await donate.fetchCache();
		
		return {
			donateInfo: donateData.result
		};
	} catch (error) {
		console.error('Failed to load donate data:', error);
		return {
			donateInfo: null
		};
	}
};
