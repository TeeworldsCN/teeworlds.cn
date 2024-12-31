import { deleteToken } from '$lib/server/db/users';
import type { Actions } from './$types';

export const actions = {
	default: async ({ cookies }) => {
		// get the token from the cookie
		const token = cookies.get('token');
		if (token) {
			await deleteToken(token);
		}
		cookies.delete('token', { path: '/' });
		return { success: true };
	}
} satisfies Actions;
