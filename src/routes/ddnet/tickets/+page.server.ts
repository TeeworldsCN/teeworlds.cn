import { env } from '$env/dynamic/private';
import { volatile } from '$lib/server/keyv';
import { getConnectionStats } from '$lib/server/realtime/tickets';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { sign, verify } from 'jsonwebtoken';
import { getUserByUsername } from '$lib/server/db/users';
import {
	getOpenTickets,
	getUserLatestTicket,
	TICKET_EXPIRE_TIME,
	type Ticket
} from '$lib/server/db/tickets';

const ONE_YEAR = 365 * 24 * 60 * 60;

export const load = (async ({ cookies, url }) => {
	const connectionStats = getConnectionStats();
	const token = url.searchParams.get('token');
	const logout = url.searchParams.get('logout') === 'true';

	if (logout) {
		cookies.delete('ticket-token', { path: '/' });
		return redirect(302, '/ddnet/tickets');
	}

	let hasToken = false;
	let playerName = '';

	let existingTickets: Ticket[];
	let canCreateTicket = false;

	if (token) {
		const info = await volatile.get<{ platform: string; uid: string; valid_until: number }>(
			`ticket-token:${token}`
		);
		if (info && info.valid_until > Date.now()) {
			const jwt = sign({ platform: info.platform, uid: info.uid }, env.SECRET, {});
			cookies.set('ticket-token', jwt, { path: '/', maxAge: ONE_YEAR });
			hasToken = true;
		}
		return redirect(302, '/ddnet/tickets');
	} else {
		const jwt = cookies.get('ticket-token');
		if (jwt) {
			try {
				const payload = verify(jwt, env.SECRET) as { platform: string; uid: string };
				hasToken = true;
				// renew the token
				cookies.set('ticket-token', jwt, { path: '/', maxAge: ONE_YEAR });
				const user = getUserByUsername(payload.uid);
				playerName = user?.bind_name || '';

				existingTickets = getUserLatestTicket(payload.uid, 3).filter(
					(t) => t.status !== 'closed' || Date.now() - t.updated_at <= TICKET_EXPIRE_TIME
				);
				const openTickets = getOpenTickets(payload.uid);
				if (openTickets)
					for (const ticket of openTickets) {
						if (!existingTickets.find((t) => t.uuid === ticket.uuid)) {
							existingTickets.push(ticket);
						}
					}
				canCreateTicket = openTickets.length < 3;
				existingTickets.sort((a, b) => a.created_at - b.created_at);
			} catch {
				console.log('Invalid ticket token');
			}
		}
	}

	existingTickets ??= [];

	return {
		hasToken,
		playerName,
		existingTickets,
		canCreateTicket,
		adminConnectionCount: connectionStats.adminCount
	};
}) satisfies PageServerLoad;
