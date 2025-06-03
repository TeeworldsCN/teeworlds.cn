import { env } from '$env/dynamic/private';
import { ipToNumber } from '$lib/helpers';
import { getDDNetBanList } from '$lib/server/bans';
import { hasPermission } from '$lib/server/db/users.js';
import { error, json } from '@sveltejs/kit';

export const GET = async ({ locals }) => {
	if (!hasPermission(locals.user, 'DDNET_MOD')) {
		return error(403, 'Forbidden');
	}

	const result = await getDDNetBanList();
	if (!result) {
		return error(404, 'Not Found');
	}

	return json(result);
};

export const POST = async ({ locals, request }) => {
	if (!locals.user || !hasPermission(locals.user, 'DDNET_MOD')) {
		return error(403, 'Forbidden');
	}

	const url = env.DDNET_WH;
	if (!url) {
		return error(404, 'Not Found');
	}

	const body = (await request.json()) as {
		op?: 'ban' | 'unban';
		ip?: string;
		ipRangeEnd?: string;
		reason?: string;
		duration?: number;
		name?: string;
	};

	if (!body.op) {
		return error(400, 'Bad Request');
	}

	if (body.op == 'ban') {
		if (!body.ip || !body.reason || !body.duration || !body.name) {
			return error(400, 'Bad Request');
		}

		let ip = body.ip;
		if (body.ipRangeEnd) {
			const start = ipToNumber(body.ip);
			const end = ipToNumber(body.ipRangeEnd);
			const delta = end - start;
			if (isNaN(delta) || delta <= 0) {
				return error(400, 'Invalid IP range');
			} else if (delta > 255) {
				return error(400, 'Range too large');
			}
			ip += `-${body.ipRangeEnd}`;
		}

		if (isNaN(body.duration) || body.duration <= 0) {
			return error(400, 'Invalid duration');
		}

		// can't be longer than 6 months
		if (body.duration > 180 * 24 * 60 * 60) {
			return error(400, 'Duration can not be over 6 months');
		}

		// convert duration seconds to minutes
		const duration = `${Math.round(body.duration / 60)}m`;

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				avatar_url: 'https://teeworlds.cn/shareicon.png',
				username: locals.user.username,
				content: `!ban_chn ${ip} "${body.name.replace(/"/g, `_`)}" ${duration} ${body.reason}`
			})
		});

		if (!response.ok) {
			return error(500, 'Request failed');
		}

		return new Response(JSON.stringify({ success: true }));
	} else if (body.op == 'unban') {
		if (!body.ip) {
			return error(400, 'Bad Request');
		}
		let ip = body.ip;
		if (body.ipRangeEnd) {
			ip += `-${body.ipRangeEnd}`;
		}

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				avatar_url: 'https://teeworlds.cn/shareicon.png',
				username: locals.user.username,
				content: `!unban ${ip}`
			})
		});

		if (!response.ok) {
			return error(500, 'Request failed');
		}

		return new Response(JSON.stringify({ success: true }));
	}

	return error(400, 'Bad Request');
};
