import { error, redirect } from '@sveltejs/kit';
import { convert } from '$lib/server/imgproxy';
import type { PageServerLoad } from './$types';
import { decodeAsciiURIComponent, encodeAsciiURIComponent } from '$lib/link';
import { uaIsStrict } from '$lib/helpers';
import { getWatchableEntriesByMap, matchRankedRecord } from '$lib/server/fetches/watchable';

/** 一条名次对应的回放,只够渲染一个播放链接 */
export type WatchableDemo = {
	uuid: string;
	/** 完赛时间,秒(用来在播放页里区分同一场回放的多个名次) */
	time: number;
	/** 'team' | 'solo' —— 这一档名次对应的视角 */
	kind: string;
};

export const load = (async ({ url, parent, params }) => {
	const region = url.searchParams.get('server');

	if (region && region.toLowerCase() != region) {
		return error(404);
	}

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
		data = await (
			await fetch(
				`https://ddnet.org/maps/?json=${encodeURIComponent(name)}${region ? `&country=${region.toUpperCase()}` : ''}`
			)
		).json();
	} catch {
		// ignored, mostly paring error
	}

	if (!data || !data.name) {
		return error(404);
	}

	if (data.thumbnail) {
		data.thumbnail = await convert(data.thumbnail);
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
			/** 这一档有预生成的 demo 时挂上,页面据此渲染播放按钮 */
			demo?: WatchableDemo;
		}[];
		ranks: {
			rank: number;
			player: string;
			time: number;
			timestamp: number;
			country: string;
			/** 这一档有预生成的 demo 时挂上,页面据此渲染播放按钮 */
			demo?: WatchableDemo;
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
	// 每一档名次都去对一下有没有预生成的 demo(ddnet.org/watch)。
	// SSR 阶段就挂上去,前端只拿到 uuid + time —— 不用把 3 MB 的 watchable.jsonl 发给客户端。
	try {
		const entries = await getWatchableEntriesByMap(map.name);
		const attach = (
			item: { rank: number; time: number; demo?: WatchableDemo },
			players: string[],
			kind: string
		) => {
			const match = matchRankedRecord(entries, [
				{ time: item.time, players, kind, rank: item.rank }
			]);
			if (match) {
				item.demo = {
					uuid: match.entry.uuid,
					time: parseFloat(match.entry.time),
					kind: match.entry.kind
				};
			}
		};

		for (const rank of map.team_ranks) attach(rank, rank.players, 'team');
		for (const rank of map.ranks) attach(rank, [rank.player], 'solo');
	} catch {
		// 上游清单拉不到时不至于让整页 500
	}

	return { map, region: region ? region.toUpperCase() : 'GLOBAL', ...parentData };
}) satisfies PageServerLoad;
