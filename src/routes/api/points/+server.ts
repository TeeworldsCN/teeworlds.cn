import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { getPlayer } from '$lib/server/players';

export const GET: RequestHandler = async ({ request, url }) => {
	const name = url.searchParams.get('name');

	if (!name) {
		return error(400);
	}

	const player = await getPlayer(name);
	if (!player) {
		return error(500);
	}

	if (!player.name) {
		return error(404);
	}

	return json({ points: player.points.points });
};
