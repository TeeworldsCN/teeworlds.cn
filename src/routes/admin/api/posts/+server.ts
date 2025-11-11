import {
	createPost,
	updatePost,
	deletePost,
	listPosts,
	getPostByUuid,
	type CreatePostData,
	type UpdatePostData
} from '$lib/server/db/posts';
import { hasPermission } from '$lib/server/db/users';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!hasPermission(locals.user, 'SUPER')) {
		return error(404, 'Not Found');
	}

	const posts = listPosts();

	return json(posts);
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!hasPermission(locals.user, 'SUPER')) {
		return error(404, 'Not Found');
	}

	let data: CreatePostData;
	try {
		data = await request.json();
	} catch {
		return error(400, 'Invalid JSON');
	}

	// Validate required fields
	if (!data.key || !data.title || !data.content) {
		return error(400, 'Missing required fields: key, title, content');
	}

	// Validate key format (alphanumeric, hyphens, underscores only)
	if (!/^[a-zA-Z0-9_-]+$/.test(data.key)) {
		return error(400, 'Key must contain only alphanumeric characters, hyphens, and underscores');
	}

	try {
		const post = createPost(data);
		return json(post);
	} catch (err: any) {
		if (err.message?.includes('UNIQUE constraint failed')) {
			return error(409, 'A post with this key already exists');
		}
		console.error('Failed to create post:', err);
		return error(500, 'Failed to create post');
	}
};

export const PATCH: RequestHandler = async ({ locals, request }) => {
	if (!hasPermission(locals.user, 'SUPER')) {
		return error(404, 'Not Found');
	}

	let data: UpdatePostData & { uuid: string };
	try {
		data = await request.json();
	} catch {
		return error(400, 'Invalid JSON');
	}

	if (!data.uuid) {
		return error(400, 'Missing required field: uuid');
	}

	// Validate key format if provided
	if (data.key && !/^[a-zA-Z0-9_-]+$/.test(data.key)) {
		return error(400, 'Key must contain only alphanumeric characters, hyphens, and underscores');
	}

	try {
		const success = updatePost(data.uuid, data);
		if (!success) {
			return error(404, 'Post not found');
		}

		const updatedPost = getPostByUuid(data.uuid);
		return json(updatedPost);
	} catch (err: any) {
		if (err.message?.includes('UNIQUE constraint failed')) {
			return error(409, 'A post with this key already exists');
		}
		console.error('Failed to update post:', err);
		return error(500, 'Failed to update post');
	}
};

export const DELETE: RequestHandler = async ({ locals, request }) => {
	if (!hasPermission(locals.user, 'SUPER')) {
		return error(404, 'Not Found');
	}

	let data: { uuid: string };
	try {
		data = await request.json();
	} catch {
		return error(400, 'Invalid JSON');
	}

	if (!data.uuid) {
		return error(400, 'Missing required field: uuid');
	}

	const success = deletePost(data.uuid);
	if (!success) {
		return error(404, 'Post not found');
	}

	return json({ success: true });
};
