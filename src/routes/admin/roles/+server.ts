import { hasPermission } from '$lib/server/db/users';
import { BOT } from '$lib/server/bots/protocol/qq';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!hasPermission(locals.user, 'SUPER')) {
		return error(404, 'Not Found');
	}

	const guildId = url.searchParams.get('guild_id');
	if (!guildId) {
		return error(400, 'Missing guild_id parameter');
	}

	if (!BOT) {
		return error(404, 'Bot not found');
	}

	const result = await BOT.getRoles(guildId);
	if (result.error) {
		return error(result.code, result.message);
	}

	return json(result.data);
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!hasPermission(locals.user, 'SUPER')) {
		return error(404, 'Not Found');
	}

	const body = await request.json();

	if (!body.guild_id) {
		return error(400, 'Missing guild_id parameter');
	}

	if (!BOT) {
		return error(404, 'Bot not found');
	}

	const result = await BOT.createRole(
		body.guild_id,
		body.name,
		body.color,
		body.hoist
	);

	if (result.error) {
		return error(result.code, result.message);
	}

	return json(result.data);
};

export const PATCH: RequestHandler = async ({ locals, request }) => {
	if (!hasPermission(locals.user, 'SUPER')) {
		return error(404, 'Not Found');
	}

	const body = await request.json();

	if (!body.guild_id || !body.role_id) {
		return error(400, 'Missing guild_id or role_id parameter');
	}

	if (!BOT) {
		return error(404, 'Bot not found');
	}

	const result = await BOT.updateRole(
		body.guild_id,
		body.role_id,
		body.name,
		body.color,
		body.hoist
	);

	if (result.error) {
		return error(result.code, result.message);
	}

	return json(result.data);
};

export const DELETE: RequestHandler = async ({ locals, request }) => {
	if (!hasPermission(locals.user, 'SUPER')) {
		return error(404, 'Not Found');
	}

	const body = await request.json();

	if (!body.guild_id || !body.role_id) {
		return error(400, 'Missing guild_id or role_id parameter');
	}

	if (!BOT) {
		return error(404, 'Bot not found');
	}

	const result = await BOT.deleteRole(body.guild_id, body.role_id);

	// If result.code is 204, the operation succeeded despite result.error being true
	if (result.error && result.code !== 204) {
		console.log(result);
		return error(result.code, result.message);
	}

	return new Response(null, { status: 204 });
};
