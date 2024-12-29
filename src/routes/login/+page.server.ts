import { authenticateByUsername, deleteToken, generateToken } from '$lib/server/db/users';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ locals, url, parent }) => {
	if (locals.user) {
		return redirect(302, '/');
	}

	const registered = url.searchParams.get('registered');
	const errorMessage = url.searchParams.get('error');
	return { registered, error: errorMessage, ...(await parent()) };
}) satisfies PageServerLoad;

export const actions = {
	login: async ({ request, cookies }) => {
		const body = await request.formData();
		if (!body) {
			return error(400, { message: 'Bad Request' });
		}

		const username = body.get('username')?.toString?.();
		const password = body.get('password')?.toString?.();

		if (!username || !password) {
			return error(400, { message: 'Bad Request' });
		}

		const user = authenticateByUsername(username, password);
		if (!user) {
			return redirect(302, `/login?error=${encodeURIComponent('用户名或密码错误')}`);
		}

		cookies.set('token', await generateToken(user.uuid), { path: '/' });
		return redirect(302, '/');
	},

	logout: async ({ cookies }) => {
		// get the token from the cookie
		const token = cookies.get('token');
		if (token) {
			await deleteToken(token);
		}
		cookies.delete('token', { path: '/' });
		return { success: true };
	}
} satisfies Actions;
