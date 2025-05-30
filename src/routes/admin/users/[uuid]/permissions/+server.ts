import { hasPermission, getUserByUuid, updateUserData, PERMISSION_LIST } from '$lib/server/db/users';
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

	const { permissions } = body;
	if (!Array.isArray(permissions)) {
		return error(400, 'Permissions must be an array');
	}

	// Validate permissions
	for (const permission of permissions) {
		if (typeof permission !== 'string' || !PERMISSION_LIST.includes(permission)) {
			return error(400, `Invalid permission: ${permission}`);
		}
	}

	// Prevent users from removing their own SUPER permission
	if (locals.user.uuid === uuid && 
		locals.user.data.permissions?.includes('SUPER') && 
		!permissions.includes('SUPER')) {
		return error(400, 'Cannot remove your own SUPER permission');
	}

	// Update user permissions
	const updatedData = {
		...targetUser.data,
		permissions: permissions.length > 0 ? permissions : undefined
	};

	const success = updateUserData(uuid, updatedData);
	if (!success) {
		return error(500, 'Failed to update user permissions');
	}

	return json({ success: true });
};
