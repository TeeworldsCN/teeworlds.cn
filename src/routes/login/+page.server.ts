import { authenticateByUsername, generateToken } from '$lib/server/db/users';
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
	default: async ({ request, cookies, url }) => {
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
		const ref = url.searchParams.get('ref') || '/';
		return redirect(302, ref);
	}
} satisfies Actions;
