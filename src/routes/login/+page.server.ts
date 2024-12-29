import { authenticate, deleteToken, generateToken } from '$lib/server/users';
import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions = {
	login: async ({ request, cookies }) => {
		const body = await request.formData();
		if (!body) {
			return fail(400, { message: 'Bad Request' });
		}

		const username = body.get('username')?.toString?.();
		const password = body.get('password')?.toString?.();

		if (!username || !password) {
			return fail(400, { message: 'Bad Request' });
		}

		const user = await authenticate(username, password);
		if (!user) {
			return fail(403, { message: 'Unauthorized' });
		}

		cookies.set('token', await generateToken(user.uid), { path: '/' });
		return { success: true };
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
