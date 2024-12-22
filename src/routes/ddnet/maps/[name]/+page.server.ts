import { error } from '@sveltejs/kit';
import { convert } from '$lib/server/imgproxy';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const data = await (await fetch(`https://ddnet.org/maps/?json=${params.name}`)).json();
	if (!data.name) {
		return error(404);
	}

	if (data.thumbnail) {
		data.thumbnail = (await convert(data.thumbnail)).toString();
	}

	return data as {
		name: string;
		website: string;
		thumbnail: string;
		web_preview: string;
		type: string;
		points: number;
		difficulty: number;
		mapper: string;
		release: number;
		median_time: number;
		first_finish: number;
		last_finish: number;
		finishes: number;
		finishers: number;
		biggest_team: number;
		width: number;
		height: number;
		tiles: string[];
		team_ranks: {
			rank: number;
			players: string[];
			time: number;
			timestamp: number;
			country: string;
		}[];
		ranks: {
			rank: number;
			player: string;
			time: number;
			timestamp: number;
			country: string;
		}[];
		max_finishes: {
			rank: number;
			player: string;
			num: number;
			time: number;
			min_timestamp: number;
			max_timestamp: number;
		}[];
	};
};
