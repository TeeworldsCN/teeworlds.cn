import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { volatile } from '$lib/server/keyv';
import { changePassword, getUserByUsername } from '$lib/server/db/users';

export const load = (async ({ url, parent }) => {
	const resetToken = url.searchParams.get('token');
	if (!resetToken) {
		return error(404, 'Not Found');
	}

	const inviter = await volatile.get(`reset-pw:${resetToken}`);
	if (!inviter) {
		return error(404, 'Not Found');
	}

	const errorMessage = url.searchParams.get('error');

	return { inviter, resetToken, error: errorMessage, ...(await parent()) };
}) satisfies PageServerLoad;

export const actions = {
	default: async ({ request }) => {
		const body = await request.formData();

		if (!body) {
			return error(400, { message: 'Bad Request' });
		}

		const resetToken = body.get('resetToken')?.toString?.();
		const username = body.get('username')?.toString?.();
		const password = body.get('password')?.toString?.();

		if (!resetToken || !username || !password) {
			return error(400, { message: 'Bad Request' });
		}

		const targetUuid = await volatile.get(`reset-pw:${resetToken}`);
		if (!targetUuid) {
			return error(400, { message: 'Bad Request' });
		}

		const user = getUserByUsername(username);
		if (!user || user.uuid != targetUuid) {
			return redirect(
				302,
				`/login/reset?token=${encodeURIComponent(resetToken)}&error=${encodeURIComponent('请检查用户名是否正确')}`
			);
		}

		const result = await changePassword(user.uuid, password);
		if (!result) {
			return redirect(
				302,
				`/login/reset?token=${encodeURIComponent(resetToken)}&error=${encodeURIComponent('未知错误，请联系管理员重试')}`
			);
		}

		await volatile.delete(`reset-pw:${resetToken}`);

		return redirect(302, `/login?registered=${encodeURIComponent('修改成功，请尝试重新登录')}`);
	}
} satisfies Actions;
