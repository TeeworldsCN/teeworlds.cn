import { hasPermission } from '$lib/server/db/users';
import { WeChat, type WeChatUploadType } from '$lib/server/bots/protocol/wechat';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!hasPermission(locals.user, 'SUPER')) {
		return error(404, 'Not Found');
	}

	if (!WeChat) {
		return error(404, 'WeChat protocol is not activated');
	}

	const mediaId = url.searchParams.get('media_id');
	if (mediaId) {
		return json(await WeChat.getMaterial(mediaId));
	}

	const target = url.searchParams.get('target');
	if (target) {
		return WeChat.passthrough(target);
	}

	return error(400, 'Missing required parameters');
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!hasPermission(locals.user, 'SUPER')) {
		return error(404, 'Not Found');
	}

	if (!WeChat) {
		return error(404, 'WeChat protocol is not activated');
	}

	const formData = await request.formData();
	const type = formData.get('type') as WeChatUploadType;
	const media = formData.get('media') as File;

	if (!type || !media) {
		return error(400, 'Missing required parameters');
	}

	let result;

	// Handle article image upload separately
	if (type === 'article_image') {
		result = await WeChat.uploadArticleImage(media);
	} else {
		// For video, we need title and introduction
		if (type === 'video') {
			const title = formData.get('title') as string;
			const introduction = formData.get('introduction') as string;

			if (!title || !introduction) {
				return error(400, 'Video requires title and introduction');
			}

			result = await WeChat.addMaterial(type, media, { title, introduction });
		} else {
			result = await WeChat.addMaterial(type as 'image' | 'voice' | 'thumb', media);
		}
	}

	if (result.errcode !== undefined) {
		return error(400, result.errmsg || 'Failed to upload material');
	}

	return json(result);
};

export const DELETE: RequestHandler = async ({ locals, request }) => {
	if (!hasPermission(locals.user, 'SUPER')) {
		return error(404, 'Not Found');
	}

	if (!WeChat) {
		return error(404, 'WeChat protocol is not activated');
	}

	const body = await request.json();
	const mediaId = body.media_id;

	if (!mediaId) {
		return error(400, 'Missing media_id parameter');
	}

	const result = await WeChat.deleteMaterial(mediaId);

	if (result.errcode !== undefined) {
		return error(400, result.errmsg || 'Failed to delete material');
	}

	return json(result);
};
