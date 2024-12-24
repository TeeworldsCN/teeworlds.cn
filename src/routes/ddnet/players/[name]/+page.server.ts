import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

interface PlayerRank {
	points?: number;
	rank: number | null;
}

interface MapData {
	points: {
		total: number;
		points?: number;
		rank?: number;
	};
	team_rank: PlayerRank;
	rank: PlayerRank;
	maps: {
		points: number;
		total_finishes: number;
		finishes: number;
		team_rank?: number;
		rank?: number;
		time?: number;
		first_finish?: number;
	}[];
}

export const load: PageServerLoad = async ({ params, parent }) => {
	const name = params.name;
	const data = await (
		await fetch(`https://ddnet.org/players/?json2=${encodeURIComponent(name)}`)
	).json();

	if (!data.player) {
		return error(404);
	}

	const player = data as {
		player: string;
		points: {
			total: number;
			points: number;
			rank: number;
		};
		team_rank: PlayerRank;
		rank: PlayerRank;
		points_last_year: PlayerRank;
		points_last_month: PlayerRank;
		points_last_week: PlayerRank;
		favorite_server: {
			server: string;
		};
		first_finish: {
			timestamp: number;
			map: string;
			time: number;
		};
		last_finishes: {
			timestamp: number;
			map: string;
			time: number;
			country: string;
			type: string;
		}[];
		favorite_partners: {
			name: string;
			finishes: number;
		}[];
		types: { [key: string]: MapData };
		activity: {
			date: string;
			hours_played: number;
		}[];
		hours_played_past_365_days: number;
	};
	return { player, ...(await parent()) };
};
