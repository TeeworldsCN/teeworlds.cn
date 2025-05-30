import {
	searchUsers,
	getUserCountBySearch,
	hasPermission,
	getUsersWithPassword,
	getUsersWithPasswordCount,
	getUsersWithoutPassword,
	getUsersWithoutPasswordCount,
	getUsersWithoutPasswordByPlatform,
	getUsersWithoutPasswordByPlatformCount
} from '$lib/server/db/users';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load = (async ({ locals, url, setHeaders }) => {
	if (!locals.user) {
		return error(404, 'Not Found');
	}

	if (!hasPermission(locals.user, 'SUPER')) {
		return error(404, 'Not Found');
	}

	const limit = parseInt(url.searchParams.get('limit') || '50');
	const offset = parseInt(url.searchParams.get('offset') || '0');
	const search = url.searchParams.get('search') || '';
	const platform = url.searchParams.get('platform') || '';
	const userType = url.searchParams.get('type') || 'with-password'; // Default to admin users with password

	let users;
	let totalCount;

	if (search) {
		// When searching, ignore all filters and search across all users
		users = searchUsers(search, limit, offset);
		totalCount = getUserCountBySearch(search);
	} else {
		// When not searching, apply filters as before
		if (userType === 'with-password') {
			// Admin users (with passwords)
			users = getUsersWithPassword(limit, offset);
			totalCount = getUsersWithPasswordCount();
		} else {
			// Regular users (without passwords)
			if (platform) {
				// Server-side platform filtering for users without passwords
				users = getUsersWithoutPasswordByPlatform(platform, limit, offset);
				totalCount = getUsersWithoutPasswordByPlatformCount(platform);
			} else {
				// No platform filter
				users = getUsersWithoutPassword(limit, offset);
				totalCount = getUsersWithoutPasswordCount();
			}
		}
	}

	setHeaders({
		'cache-control': 'private, no-store'
	});

	return {
		users,
		totalCount,
		limit,
		offset,
		search,
		platform,
		userType
	};
}) satisfies PageServerLoad;
