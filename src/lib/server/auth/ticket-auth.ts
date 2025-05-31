import { env } from '$env/dynamic/private';
import { verify } from 'jsonwebtoken';
import { getUserByUsername } from '$lib/server/db/users';

export interface TicketUserInfo {
	uid: string;
	platform: string;
	playerName?: string;
}

/**
 * Utility function to extract user info from ticket JWT token
 * @param cookies - The cookies object from SvelteKit request
 * @returns User info if valid token exists, null otherwise
 */
export const getTicketUserInfo = (cookies: any): TicketUserInfo | null => {
	try {
		const jwt = cookies.get('ticket-token');
		if (!jwt) {
			return null;
		}

		const payload = verify(jwt, env.SECRET) as { platform: string; uid: string };
		const user = getUserByUsername(payload.uid);
		const playerName = user?.bind_name || undefined;

		return {
			uid: payload.uid,
			platform: payload.platform,
			playerName
		};
	} catch (error) {
		console.log('Invalid ticket token:', error);
		return null;
	}
};
