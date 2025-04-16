import { getSkins } from '$lib/stores/skins';
import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';

// skin browser is pure javascript
export const ssr = false;

export const load = (async ({ fetch }) => {
	try {
		const skins = await getSkins();
		if (!skins) {
			return error(500, 'Failed to load skins data');
		}
		return { skins };
	} catch (err) {
		console.error('Error loading skins:', err);
		return error(500, 'Failed to load skins data');
	}
}) satisfies PageLoad;
