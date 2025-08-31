import { listPosts } from '$lib/server/db/posts';
import { hasPermission } from '$lib/server/db/users';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load = (async ({ locals, parent }) => {
	if (!hasPermission(locals.user, 'SUPER')) {
		return error(404, 'Not Found');
	}

	const posts = listPosts();

	return { posts, ...(await parent()) };
}) satisfies PageServerLoad;
