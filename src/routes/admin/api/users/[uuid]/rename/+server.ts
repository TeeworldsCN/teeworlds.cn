import { hasPermission, getUserByUuid, renameUser, type UserUUID } from '$lib/server/db/users';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ locals, params, request }) => {
	// Check if user is authenticated and has SUPER permission
	if (!locals.user) {
		return error(404, 'Not Found');
	}

	if (!hasPermission(locals.user, 'SUPER')) {
		return error(404, 'Not Found');
	}

	const { uuid } = params;
	if (!uuid) {
		return error(400, 'Missing user UUID');
	}

	// Get the target user
	const targetUser = getUserByUuid(uuid);
	if (!targetUser) {
		return error(404, 'User not found');
	}

	// Parse request body
	let body;
	try {
		body = await request.json();
	} catch {
		return error(400, 'Invalid JSON');
	}

	const { username } = body;
	if (!username || typeof username !== 'string') {
		return error(400, 'Username is required and must be a string');
	}

	// Validate username
	const trimmedUsername = username.trim();
	if (trimmedUsername.length < 2) {
		return error(400, '用户名长度至少为2个字符');
	}

	if (trimmedUsername.includes(':')) {
		return error(400, '用户名不能包含 ":"');
	}

	// Prevent users from renaming themselves
	if (locals.user.uuid === uuid) {
		return error(400, 'Cannot rename yourself');
	}

	// Attempt to rename the user
	const result = renameUser(uuid as unknown as UserUUID, trimmedUsername);
	if (!result.success) {
		return error(400, result.error || 'Failed to rename user');
	}

	return json({
		success: true,
		oldUsername: targetUser.username,
		newUsername: trimmedUsername
	});
};
