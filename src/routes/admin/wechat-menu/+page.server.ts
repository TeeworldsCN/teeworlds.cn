import { WeChat } from '$lib/server/bots/protocol/wechat';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { hasPermission } from '$lib/server/db/users';

export const load = (async ({ locals }) => {
	if (!hasPermission(locals.user, 'SUPER')) {
		return error(404, 'Not Found');
	}

	if (!WeChat) {
		return error(404, 'WeChat protocol is not activated');
	}

	// Get current menu configuration
	const menuResult = await WeChat.getMenu();

	if (menuResult.errcode !== undefined) {
		return error(400, menuResult.errmsg || 'Failed to get menu');
	}

	return {
		menu: menuResult
	};
}) satisfies PageServerLoad;
