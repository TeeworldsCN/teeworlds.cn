import {
	getTicket,
	getTicketMessages,
	getTicketAttachments,
	TICKET_EXPIRE_TIME
} from '$lib/server/db/tickets';
import { getConnectionStats } from '$lib/server/realtime/tickets';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getTicketUserInfo } from '$lib/server/auth/ticket-auth';

export const load = (async ({ params, cookies, setHeaders }) => {
	const { uuid } = params;

	if (!uuid) {
		return error(404, 'Ticket not found');
	}

	const ticket = getTicket(uuid);
	if (!ticket) {
		return error(404, 'Ticket not found');
	}

	const userInfo = getTicketUserInfo(cookies);
	if (!userInfo || ticket.author_uid !== userInfo.uid) {
		return error(403, 'Forbidden');
	}

	const messages = getTicketMessages(uuid, false); // false = visitor view
	const attachments = getTicketAttachments(uuid);
	const canSendMessage =
		ticket.status !== 'closed' || Date.now() - ticket.updated_at <= TICKET_EXPIRE_TIME;
	const connectionStats = getConnectionStats();

	setHeaders({
		'cache-control': 'private, no-store'
	});

	return {
		canSendMessage,
		ticket,
		messages,
		attachments,
		visitorName: userInfo.playerName || '访客',
		adminConnectionCount: connectionStats.adminCount
	};
}) satisfies PageServerLoad;
