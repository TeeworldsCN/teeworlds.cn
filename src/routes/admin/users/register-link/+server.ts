import { hasPermission } from '$lib/server/db/users';
import { volatile } from '$lib/server/keyv';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import nodeCrypto from 'crypto';

export const POST: RequestHandler = async ({ locals }) => {
	// Check if user is authenticated and has REGISTER permission
	if (!locals.user) {
		return error(404, 'Not Found');
	}

	if (!hasPermission(locals.user, 'REGISTER')) {
		return error(404, 'Not Found');
	}

	try {
		// Generate register token (same logic as bot handler)
		const registerToken = nodeCrypto.randomBytes(12).toString('base64url');
		await volatile.set(
			`register:${registerToken}`,
			locals.user.data.name || locals.user.uuid.toString() || '管理员',
			12 * 60 * 60 * 1000 // 12 hours
		);

		const registerUrl = `https://teeworlds.cn/login/register?token=${encodeURIComponent(registerToken)}`;

		return json({
			success: true,
			url: registerUrl,
			token: registerToken,
			expiresIn: 12 * 60 * 60 * 1000 // 12 hours in milliseconds
		});
	} catch (err) {
		console.error('Failed to generate register link:', err);
		return error(500, 'Failed to generate register link');
	}
};
