import type { PageLoad } from './$types';

export const ssr = false;

export const load: PageLoad = async ({ params, parent }) => {
	return {
		name: params.name,
		...(await parent())
	};
};