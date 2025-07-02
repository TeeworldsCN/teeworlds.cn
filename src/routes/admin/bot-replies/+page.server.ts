import { listBotReplies } from '$lib/server/db/botreply';
import { hasPermission } from '$lib/server/db/users';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load = (async ({ locals, parent }) => {
	if (!hasPermission(locals.user, 'SUPER')) {
		return error(404, 'Not Found');
	}

	const replies = listBotReplies();

	return { replies, ...(await parent()) };
}) satisfies PageServerLoad;
