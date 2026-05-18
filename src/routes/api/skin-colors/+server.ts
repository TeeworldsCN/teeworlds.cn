import { type RequestHandler } from '@sveltejs/kit';
import { getSkinColors } from '$lib/server/db/skins';

export const GET: RequestHandler = async () => {
	try {
		const colors = getSkinColors();

		// Convert to map format for efficient lookup
		const colorMap: { [key: string]: { r: number; g: number; b: number } } = {};
		for (const skin of colors) {
			if (skin.r !== null && skin.g !== null && skin.b !== null) {
				colorMap[skin.name] = { r: skin.r, g: skin.g, b: skin.b };
			}
		}

		return new Response(JSON.stringify(colorMap), {
			headers: {
				'content-type': 'application/json',
				'cache-control': 'public, max-age=3600'
			}
		});
	} catch (e) {
		console.error('Failed to fetch skin colors:', e);
		return new Response(JSON.stringify({}), {
			headers: {
				'content-type': 'application/json'
			}
		});
	}
};