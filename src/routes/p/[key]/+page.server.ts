import { getPostByKey } from '$lib/server/db/posts';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load = (async ({ params }) => {
	const post = getPostByKey(params.key);

	if (!post) {
		return error(404, 'Post not found');
	}

	return { post };
}) satisfies PageServerLoad;
