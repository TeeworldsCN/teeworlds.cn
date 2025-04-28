import { WeChat } from '$lib/server/bots/protocol/wechat';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { hasPermission } from '$lib/server/db/users';

export const load = (async ({ locals, url }) => {
	if (!hasPermission(locals.user, 'SUPER')) {
		return error(404, 'Not Found');
	}

	if (!WeChat) {
		return error(404, 'WeChat protocol is not activated');
	}

	// Get material counts
	const countResult = await WeChat.getMaterialCount();
	console.log(countResult);
	if (countResult.errcode !== undefined) {
		return error(400, countResult.errmsg || 'Failed to get material count');
	}

	// Get material type from query parameter or default to 'image'
	const type = url.searchParams.get('type') || 'image';
	const offset = parseInt(url.searchParams.get('offset') || '0');

	if (type === 'news') {
		const materialsResult = await WeChat.getMaterialList('news', offset, 20);
		if (materialsResult.errcode !== undefined) {
			return error(400, materialsResult.errmsg || 'Failed to get materials');
		}

		return {
			counts: countResult,
			materials: materialsResult,
			type: 'news' as const,
			offset
		};
	} else {
		const validTypes = ['image', 'video', 'voice'] as const;
		if (!(validTypes as unknown as string[]).includes(type)) {
			return error(400, 'Invalid material type');
		}

		const normalType = type as (typeof validTypes)[number];
		const materialsResult = await WeChat.getMaterialList(normalType, offset, 20);
		if (materialsResult.errcode !== undefined) {
			return error(400, materialsResult.errmsg || 'Failed to get materials');
		}

		return {
			counts: countResult,
			materials: materialsResult,
			type: normalType,
			offset
		};
	}
}) satisfies PageServerLoad;
