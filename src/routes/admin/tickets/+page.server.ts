import {
	getAvailableTickets,
	getAvailableTicketCount,
	getAllTickets,
	getAllTicketCount,
	getUserSubscribedTickets,
	TICKET_EXPIRE_TIME
} from '$lib/server/db/tickets';
import { getConnectedAdmins } from '$lib/server/realtime/tickets';
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
	const showExpired = url.searchParams.get('show_expired') === 'true';

	let tickets;
	let totalCount;

	if (showExpired) {
		// Show all tickets regardless of status or time
		tickets = getAllTickets(limit, offset);
		totalCount = getAllTicketCount();
	} else {
		// Show only available tickets (non-closed or recently updated)
		const cutoffTime = Date.now() - TICKET_EXPIRE_TIME;
		tickets = getAvailableTickets(cutoffTime, limit, offset);
		totalCount = getAvailableTicketCount(cutoffTime);
	}

	const userSubscribedTickets = getUserSubscribedTickets(locals.user.uuid);

	setHeaders({
		'cache-control': 'private, no-store'
	});

	return {
		tickets,
		totalCount,
		limit,
		offset,
		userSubscribedTickets,
		connectedAdmins: getConnectedAdmins(),
		user: locals.user,
		showExpired
	};
}) satisfies PageServerLoad;
