import { FetchCache } from '../fetch-cache';
import { convert } from '../imgproxy';

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
				color_body: number;
				color_feet: number;
			};
			afk: boolean;
			team: number;
		}[];
	};
}[];

export type GameServerType = {
	name: string;
	flagId: number;
	servers: { [key: string]: string };
};

export type GameInfo = {
	communities: {
		id: string;
		name: string;
		has_finishes: boolean;
		icon: {
			sha256: string;
			url: string;
			servers?: GameServerType[];
		};
		contact_urls: string[];
	}[];
	servers: GameServerType[];
	'servers-kog': GameServerType[];
	'community-icons-download-url': string;
	news: string;
	'map-download-url': string;
	location: string;
	version: string;
	'stun-servers-ipv6': string[];
	'stun-servers-ipv4': string[];
	'warn-pnglite-incompatible-images': boolean;
};

export const servers = new FetchCache<{ servers: ServerInfo }>(
	'https://master1.ddnet.org/ddnet/15/servers.json',
	async (response) => await response.json(),
	{
		minQueryInterval: 2,
		skipHead: true
	}
);

export const gameInfo = new FetchCache<GameInfo>(
	'https://info.ddnet.org/info',
	async (response) => {
		const result = (await response.json()) as GameInfo;
		for (const community of result.communities) {
			if (community.icon.url) {
				community.icon.url = (await convert(community.icon.url)).toString();
			}
		}
		return result;
	},
	{
		minQueryInterval: 2,
		skipHead: true
	}
);
