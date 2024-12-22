import type { PageLoad } from './$types';

export const load: PageLoad = async ({ setHeaders, data, url }) => {
	// setHeaders({
	// 	'cache-control': 'public, max-age=600'
	// });

	return data;
};
