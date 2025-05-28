import { env } from '$env/dynamic/private';
import { verify } from 'jsonwebtoken';
import type { RequestHandler } from './$types';
import { createUser, getUserByUsername } from '$lib/server/db/users';
import { error } from '@sveltejs/kit';
import { updateUserData } from '$lib/server/db/users';

export const POST: RequestHandler = async ({ request, url, cookies }) => {
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
			const result = await createUser(payload.uid, { name: name });
			if (!result.success) {
				return error(500, 'Failed to create user');
			}
		} else {
			user.data.name = name;
			updateUserData(user.uuid, user.data);
		}

		return new Response('OK');
	} catch {
		return new Response('Forbidden', { status: 403 });
	}
};
