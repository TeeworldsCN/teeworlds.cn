import { hasPermission } from '$lib/server/db/users';
import { WeChat, type WeChatMenu } from '$lib/server/bots/protocol/wechat';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!hasPermission(locals.user, 'SUPER')) {
		return error(404, 'Not Found');
	}

	if (!WeChat) {
		return error(404, 'WeChat protocol is not activated');
	}

	const result = await WeChat.getMenu();
	if (result.errcode !== undefined) {
		return error(400, result.errmsg || 'Failed to get menu');
	}

	return json(result);
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!hasPermission(locals.user, 'SUPER')) {
		return error(404, 'Not Found');
	}

	if (!WeChat) {
		return error(404, 'WeChat protocol is not activated');
	}

	const body = (await request.json()) as WeChatMenu;
	const result = await WeChat.createMenu(body);

	if (result.errcode !== undefined) {
		return error(400, result.errmsg || 'Failed to create menu');
	}

	return json(result);
};

export const DELETE: RequestHandler = async ({ locals }) => {
	if (!hasPermission(locals.user, 'SUPER')) {
		return error(404, 'Not Found');
	}

	if (!WeChat) {
		return error(404, 'WeChat protocol is not activated');
	}

	const result = await WeChat.deleteMenu();

	if (result.errcode !== undefined) {
		return error(400, result.errmsg || 'Failed to delete menu');
	}

	return json(result);
};
