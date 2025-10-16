import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ request, url }) => {
	const name = url.searchParams.get('name');

	if (!name) {
		return error(400);
	}

	const response = await fetch(`https://ddnet.org/players/?json2=${encodeURIComponent(name)}`);
	if (!response || !response.ok) {
		return error(500);
	}

	const player = await response.json();

	if (!player.player) {
		return error(404);
	}

	return json({ points: player.points.points });
};
