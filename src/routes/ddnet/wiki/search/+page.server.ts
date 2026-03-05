import { error } from '@sveltejs/kit';

export const load = async ({ url }) => {
	const query = url.searchParams.get('q');
	if (!query) {
		return {
			results: [],
			query: ''
		};
	}

	try {
		const res = await fetch(`https://wiki.ddnet.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=1`);
		if (!res.ok) {
			error(res.status, 'Failed to fetch search results');
		}

		const data = await res.json();
		if (data.error) {
			error(500, data.error.info || 'Wiki API error');
		}

		return {
			results: data.query?.search || [],
			query
		};
	} catch (e: any) {
		console.error('Wiki search error:', e);
		error(e.status || 500, e.message || 'Internal server error');
	}
};
