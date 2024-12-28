import { FetchCache } from '../fetch-cache';

export type ServerInfo = {
	addresses: string[];
	location: string;
	info: {
		max_clients: number;
		max_players: number;
		passworded: boolean;
		game_type: string;
		name: string;
		map: {
			name: string;
			sha256: string;
			size: number;
		};
		version: string;
		client_score_kind: string;
		requires_login: boolean;
		clients: {
			name: string;
			clan: string;
			country: number;
			score: number;
			is_player: boolean;
			skin: {
				name: string;
			};
			afk: boolean;
			team: number;
		}[];
	};
}[];

export const servers = new FetchCache<string>(
	'https://master1.ddnet.org/ddnet/15/servers.json',
	async (response) => await response.text(),
	{
		minQueryInterval: 2,
		skipHead: true
	}
);
