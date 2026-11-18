import { isAutoRecallEnabled, listRecallKeywords, listRecallLogs } from '$lib/server/db/recall';
import { hasPermission } from '$lib/server/db/users';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load = (async ({ locals, parent }) => {
	if (!hasPermission(locals.user, 'SUPER')) {
		return error(404, 'Not Found');
	}

	return {
		keywords: listRecallKeywords(),
		logs: listRecallLogs(),
		enabled: isAutoRecallEnabled(),
		...(await parent())
	};
}) satisfies PageServerLoad;
