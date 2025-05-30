import { json } from '@sveltejs/kit';
import { volatile } from '$lib/server/keyv';
import crypto from 'node:crypto';
import { RateLimiter } from '$lib/server/bots/utils/rate-limiter';
import type { RequestHandler } from './$types';

// Rate limiter: 12 attempts per 3 hours, with 3 hour cooldown
const verifyLimiter = new RateLimiter('verify', {
	threshold: 12,
	interval: 3 * 60 * 60,
	cooldown: 3 * 60 * 60
});

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Check rate limiting first
		const { limited } = await verifyLimiter.isLimited(locals.ip);
		if (limited) {
			return json({ success: false, error: '验证尝试过于频繁，请3小时后再试' }, { status: 429 });
		}

		const { code } = await request.json();

		if (!code) {
			return json({ success: false, error: '请输入验证码' }, { status: 400 });
		}

		// Get the verification info from the code
		const info = await volatile.get<{ platform: string; uid: string; valid_until: number }>(
			`verify-code:${code}`
		);

		if (!info) {
			return json({ success: false, error: '验证码无效或已过期' }, { status: 400 });
		}

		if (info.valid_until < Date.now()) {
			return json({ success: false, error: '验证码已过期' }, { status: 400 });
		}

		// Generate a ticket token (similar to the report handler)
		const bytes = crypto.randomBytes(20);
		const token = bytes.toString('hex');

		// Store the token with the platform and uid info
		await volatile.set(
			`ticket-token:${token}`,
			{
				platform: info.platform,
				uid: info.uid,
				valid_until: Date.now() + 10 * 60 * 1000 // 10 minutes validity
			},
			10 * 60 * 1000
		);

		// Clean up the used verification code
		await volatile.delete(`verify-code:${code}`);

		return json({ success: true, token });
	} catch (error) {
		console.error('Verification error:', error);
		return json({ success: false, error: '服务器错误，请稍后重试' }, { status: 500 });
	}
};
