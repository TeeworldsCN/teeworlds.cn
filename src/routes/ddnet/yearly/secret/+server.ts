import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { RateLimiter } from '$lib/server/bots/utils/rate-limiter';
import { getYearlyData } from '$lib/server/db/yearly';
import { decode } from 'msgpackr';
import type { YearlyData } from '../event/+server';

const limiter = new RateLimiter('yearly-secret', { threshold: 30, interval: 6, cooldown: 12 });

export const POST: RequestHandler = async ({ url, request, locals }) => {
	const body = await request.json();

	const year = parseInt(body.year);

	if (!body.code || !body.name || !year || isNaN(year)) {
		return error(400);
	}

	if ((await limiter.isLimited(locals.ip)).limited) {
		return error(429);
	}

	const yearly = getYearlyData(body.name, year);
	if (!yearly) {
		return error(404);
	}

	const data = decode(yearly) as Partial<YearlyData>;
	if (data.z == null) {
		return error(404);
	}

	if (data.z[0] != body.code) {
		return error(403);
	}

	return new Response(JSON.stringify({ payload: data.z[1] }), {
		headers: {
			'Content-Type': 'application/json'
		}
	});
};
