import { hasPermission } from '$lib/server/db/users';
import { addAdminConnection, addTicketConnection } from '$lib/server/realtime/tickets';
import { getTicket, getUserActiveBan, TICKET_EXPIRE_TIME } from '$lib/server/db/tickets';
import { error } from '@sveltejs/kit';
import { produce } from 'sveltekit-sse';
import type { RequestHandler } from './$types';
import { getTicketUserInfo } from '$lib/server/auth/ticket-auth';

export const POST: RequestHandler = async ({ locals, url, cookies }) => {
	const mode = url.searchParams.get('mode'); // 'admin' or 'ticket'
	const ticketUuid = url.searchParams.get('ticket');

	// For admin mode, require admin permissions
	if (mode === 'admin' && !hasPermission(locals.user, 'TICKETS')) {
		return error(403, 'Forbidden');
	}

	// For ticket mode, require ticket UUID and verify authorship
	let close = false;

	if (mode === 'ticket') {
		if (!ticketUuid) {
			return error(400, 'Ticket UUID required');
		}

		const ticket = getTicket(ticketUuid);
		const userInfo = getTicketUserInfo(cookies);

		if (!ticket || !userInfo || ticket.author_uid !== userInfo.uid) {
			return error(403, 'Forbidden');
		}

		if (ticket.status === 'closed' && Date.now() - ticket.updated_at > TICKET_EXPIRE_TIME) {
			close = true;
		}

		if (getUserActiveBan(userInfo.uid)) {
			close = true;
		}
	}

	let cleanup: (() => void) | null = null;

	return produce(
		({ emit, lock }) => {
			if (close) {
				lock.set(false);
				return;
			}

			// Send initial connection message
			emit('connected', JSON.stringify({ type: 'connected', timestamp: Date.now() }));

			if (mode === 'admin') {
				const userUuid = locals.user?.uuid;
				if (!userUuid) {
					throw new Error('User not authenticated');
				}
				cleanup = addAdminConnection(emit, userUuid);
			} else if (mode === 'ticket' && ticketUuid) {
				// Get ticket info to pass visitor name and uid (we already verified the ticket exists above)
				const ticket = getTicket(ticketUuid);
				const visitorName = ticket?.visitor_name;
				const uid = ticket?.author_uid;
				cleanup = addTicketConnection(ticketUuid, emit, visitorName, uid, lock);
			}
		},
		{
			ping: 6500,
			stop: () => {
				if (cleanup) {
					cleanup();
				}
			}
		}
	);
};
