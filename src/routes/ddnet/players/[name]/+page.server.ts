import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { decodeAsciiURIComponent } from '$lib/link';
import type { MapList } from '../../maps/+server';

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
		[key: string]: {
			points: number;
			total_finishes: number;
			finishes: number;
			team_rank?: number;
			rank?: number;
			time?: number;
			first_finish?: number;
			pending?: boolean;
		};
	};
	pending_points?: number;
}

export const load: PageServerLoad = async ({ fetch, params, parent }) => {
	const name = decodeAsciiURIComponent(params.name);
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
		pending_points?: number;
	};

	const mapsResponse = await fetch(`/ddnet/maps?json=true`);

	if (mapsResponse.ok) {
		const maps = (await mapsResponse.json()) as MapList;
		// find all maps that are in last finishes
		const lastFinishMaps = maps.filter((map) =>
			player.last_finishes.some((finish) => finish.map == map.name)
		);

		// insert pending maps into map data
		for (const map of lastFinishMaps) {
			const type = player.types[map.type];
			const typeMaps = type?.maps;
			if (!typeMaps) continue;

			const targetMap = typeMaps[map.name];
			if (!targetMap) continue;

			// don't count already finished maps
			if (targetMap.first_finish) continue;

			targetMap.finishes = 1;
			targetMap.pending = true;

			// find the first finish time from the last finish list
			const time = player.last_finishes.find((finish) => finish.map == map.name)?.time;
			targetMap.time = time ?? undefined;

			const points = targetMap.points;

			if (points) {
				player.pending_points = (player.pending_points || 0) + points;
				type.pending_points = (type.pending_points || 0) + points;
			}
		}
	}

	return { player, ...(await parent()) };
};
