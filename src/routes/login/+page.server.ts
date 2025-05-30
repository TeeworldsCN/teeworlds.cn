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

		const ref = url.searchParams.get('ref') || '/';

		const user = await authenticateByUsername(username, password);
		if (!user) {
			return redirect(
				302,
				`/login?error=${encodeURIComponent('用户名或密码错误')}&ref=${encodeURIComponent(ref)}`
			);
		}

		cookies.set('token', await generateToken(user), { path: '/', maxAge: 30 * 24 * 60 * 60 });
		return redirect(302, ref);
	}
} satisfies Actions;
