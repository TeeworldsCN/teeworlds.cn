import { error, redirect } from '@sveltejs/kit';
import { convert } from '$lib/server/imgproxy';
import type { PageServerLoad } from './$types';
import { basename } from 'path';
import { decodeAsciiURIComponent, encodeAsciiURIComponent } from '$lib/link';
import { uaIsStrict } from '$lib/helpers';

export const load = (async ({ url, parent, params }) => {
	const parentData = await parent();

	const param = params.name;
	if (!param) {
		return redirect(302, '/ddnet/maps');
	}

	if (!uaIsStrict(parentData.ua) && param.startsWith('!!')) {
		// redirect to the non-stamped version
		return redirect(302, `/ddnet/maps/${encodeAsciiURIComponent(decodeAsciiURIComponent(param))}`);
	}

	const name = decodeAsciiURIComponent(param);
	let data;

	try {
		data = await (await fetch(`https://ddnet.org/maps/?json=${encodeURIComponent(name)}`)).json();
	} catch {
		// ignored, mostly paring error
	}

	if (!data || !data.name) {
		return error(404);
	}

	if (data.thumbnail) {
		const filename = basename(data.thumbnail);
		data.thumbnail = (await convert(data.thumbnail)).toString();
		data.icon = `../icons/${filename}`;
	}

	const map = data as {
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
		icon: string;
	};
	return { map, ...parentData };
}) satisfies PageServerLoad;
