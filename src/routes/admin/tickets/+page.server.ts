import {
	getAvailableTickets,
	getAvailableTicketCount,
	getUserSubscribedTickets,
	TICKET_EXPIRE_TIME
} from '$lib/server/db/tickets';
import { getConnectionStats } from '$lib/server/realtime/tickets';
import { hasPermission } from '$lib/server/db/users';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load = (async ({ locals, url, setHeaders }) => {
	if (!locals.user) {
		return error(404, 'Not Found');
	}

	if (!hasPermission(locals.user, 'TICKETS')) {
		return error(404, 'Not Found');
	}

	const limit = parseInt(url.searchParams.get('limit') || '50');
	const offset = parseInt(url.searchParams.get('offset') || '0');

	const cutoffTime = Date.now() - TICKET_EXPIRE_TIME;

	const tickets = getAvailableTickets(cutoffTime, limit, offset);
	const totalCount = getAvailableTicketCount(cutoffTime);
	const userSubscribedTickets = getUserSubscribedTickets(locals.user.uuid);
	const connectionStats = getConnectionStats();

	setHeaders({
		'cache-control': 'private, no-store'
	});

	return {
		tickets,
		totalCount,
		limit,
		offset,
		userSubscribedTickets,
		connectedAdmins: connectionStats.connectedAdmins,
		user: locals.user
	};
}) satisfies PageServerLoad;
