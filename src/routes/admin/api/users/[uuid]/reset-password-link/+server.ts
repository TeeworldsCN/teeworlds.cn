import { hasPermission, getUserByUuid } from '$lib/server/db/users';
import { volatile } from '$lib/server/keyv';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import nodeCrypto from 'crypto';

export const POST: RequestHandler = async ({ locals, params }) => {
	// Check if user is authenticated and has REGISTER permission
	if (!locals.user) {
		return error(404, 'Not Found');
	}

	if (!hasPermission(locals.user, 'REGISTER')) {
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

	try {
		// Generate reset token (same logic as bot handler)
		const resetToken = nodeCrypto.randomBytes(12).toString('base64url');
		await volatile.set(
			`reset-pw:${resetToken}`,
			targetUser.uuid,
			12 * 60 * 60 * 1000 // 12 hours
		);

		const resetUrl = `https://teeworlds.cn/login/reset?token=${encodeURIComponent(resetToken)}`;

		return json({
			success: true,
			url: resetUrl,
			token: resetToken,
			username: targetUser.username,
			expiresIn: 12 * 60 * 60 * 1000 // 12 hours in milliseconds
		});
	} catch (err) {
		console.error('Failed to generate reset password link:', err);
		return error(500, 'Failed to generate reset password link');
	}
};
