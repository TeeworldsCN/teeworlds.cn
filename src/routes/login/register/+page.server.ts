import { error, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { volatile } from '$lib/server/keyv';
import { createUserWithPass } from '$lib/server/db/users';

export const load = (async ({ url, parent }) => {
	const registerToken = url.searchParams.get('token');
	if (!registerToken) {
		return error(404, 'Not Found');
	}

	const inviter = await volatile.get(`register:${registerToken}`);
	if (!inviter) {
		return error(404, 'Not Found');
	}

	const errorMessage = url.searchParams.get('error');

	return { inviter, registerToken, error: errorMessage, ...(await parent()) };
}) satisfies PageServerLoad;

export const actions = {
	default: async ({ request }) => {
		const body = await request.formData();

		if (!body) {
			return error(400, { message: 'Bad Request' });
		}

		const registerToken = body.get('registerToken')?.toString?.();
		const username = body.get('username')?.toString?.();
		const password = body.get('password')?.toString?.();

		if (!registerToken || !username || !password) {
			return error(400, { message: 'Bad Request' });
		}

		const inviter = await volatile.get(`register:${registerToken}`);
		if (!inviter) {
			return error(400, { message: 'Bad Request' });
		}

		if (username.length < 2) {
			return redirect(
				302,
				`/login/register?token=${encodeURIComponent(registerToken)}&error=${encodeURIComponent('用户名长度至少为2个字符')}`
			);
		}

		if (username.includes(':')) {
			return redirect(
				302,
				`/login/register?token=${encodeURIComponent(registerToken)}&error=${encodeURIComponent('很抱歉，用户名不能包含 ":"')}`
			);
		}

		const result = await createUserWithPass(username, password, {});
		if (!result.success) {
			return redirect(
				302,
				`/login/register?token=${encodeURIComponent(registerToken)}&error=${encodeURIComponent(result.error)}`
			);
		}

		await volatile.delete(`register:${registerToken}`);

		return redirect(302, `/login?registered=${encodeURIComponent('注册成功，你现在可以登录了')}`);
	}
} satisfies Actions;
