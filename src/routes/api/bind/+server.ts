import { env } from '$env/dynamic/private';
import { verify } from 'jsonwebtoken';
import type { RequestHandler } from './$types';
import { createUser, getUserByUsername, updateUserBindName } from '$lib/server/db/users';
import { error } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ url, cookies }) => {
	const name = url.searchParams.get('name');
	if (!name) {
		return new Response('Bad Request', { status: 400 });
	}

	const jwt = cookies.get('ticket-token');
	if (!jwt) {
		return new Response('Forbidden', { status: 403 });
	}

	try {
		const payload = verify(jwt, env.SECRET) as { platform: string; uid: string };
		const user = getUserByUsername(payload.uid);
		if (!user) {
			const result = await createUser(payload.uid, {}, name);
			if (!result.success) {
				return error(500, 'Failed to create user');
			}
		} else {
			updateUserBindName(user.uuid, name);
		}

		return new Response('OK');
	} catch {
		return new Response('Forbidden', { status: 403 });
	}
};
