import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { decodeAsciiURIComponent, encodeAsciiURIComponent } from '$lib/link';
import { ranks } from '$lib/server/fetches/ranks';
import type { MapList } from '$lib/server/fetches/maps';
import { uaIsStrict } from '$lib/helpers';
import { getSkin } from '$lib/server/ddtracker';
import { skins } from '$lib/server/fetches/skins';

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

export const load = (async ({ fetch, url, parent }) => {
	const parentData = await parent();

	const query = url.searchParams.get('n');
	if (!query) {
		return redirect(302, '/ddnet/players');
	}

	if (!uaIsStrict(parentData.ua) && query.startsWith('!!')) {
		// redirect to the non-stamped version
		return redirect(302, `/ddnet/p?n=${encodeAsciiURIComponent(decodeAsciiURIComponent(query))}`);
	}

	const name = decodeAsciiURIComponent(query);
	let data;

	try {
		data = await (
			await fetch(`https://ddnet.org/players/?json2=${encodeURIComponent(name)}`)
		).json();
	} catch {
		// ignored, mostly paring error
	}

	if (!data || !data.player) {
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
		pending_unknown?: boolean;
		data_update_time?: number;
	};

	// remove useless activity data way past 365 days
	const lastActivity = new Date(player.activity[player.activity.length - 1].date);
	player.activity = player.activity.filter(
		(activity) =>
			new Date(activity.date).getTime() > lastActivity.getTime() - 366 * 24 * 60 * 60 * 1000
	);

	const mapsResponse = await fetch(`/ddnet/maps`);

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

		const lastFinish = player.last_finishes[player.last_finishes.length - 1];
		if (lastFinish && Date.now() / 1000 - lastFinish.timestamp < 24 * 60 * 60) {
			player.pending_unknown = true;
		}
	}

	const skinList = await skins.fetch();
	const skin = (getSkin(player.player) || {}) as {
		n?: string;
		b?: number;
		f?: number;
	};

	if (skin.n) {
		skin.n = skinList.skins.find((s) => s.name == skin.n)?.url;
	}

	// always check the rank page for update time
	player.data_update_time = (await ranks.fetch()).update_time;
	return { player, skin, ...(await parent()) };
}) satisfies PageServerLoad;
