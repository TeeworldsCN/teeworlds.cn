import { json, type RequestHandler } from '@sveltejs/kit';
import { decodeAsciiURIComponent } from '$lib/link';
import { ranks, regionalRanks } from '$lib/server/fetches/ranks';
import { maps } from '$lib/server/fetches/maps';
import { getSkin } from '$lib/server/ddtracker';
import { getPlayer } from '$lib/server/players';

const DDNET_FETCH_TIMEOUT = 15000;

/**
 * Fetch with timeout and throw on non-ok responses.
 * Returns the Response object — caller must read .text() or .json().
 */
async function fetchWithTimeout(url: string, timeoutMs = DDNET_FETCH_TIMEOUT): Promise<Response> {
	const result = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
	if (!result.ok) {
		throw new Error(`DDNet API returned ${result.status}`);
	}
	return result;
}

export const GET: RequestHandler = async ({ params, setHeaders }) => {
	const param = params.name!;
	const name = decodeAsciiURIComponent(param);

	// Run player / maps / ranks fetches in parallel
	let playerData: any = false;
	let playerError: string | null = null;
	let mapData: any = null;
	let mapError: string | null = null;
	let rankData: any = null;
	let rankError: string | null = null;

	const results = await Promise.allSettled([
		(async () => {
			const res = await fetchWithTimeout(
				`https://ddnet.org/players/?json2=${encodeURIComponent(name)}`
			);
			const text = await res.text();
			if (!text) {
				playerData = false;
				return;
			}
			playerData = JSON.parse(text);
		})(),
		async () => {
			const result = await maps.fetchCache();
			mapData = result.result;
		},
		async () => {
			const result = await ranks.fetchCache();
			rankData = result.result;
		}
	]);

	// Extract errors
	if (results[0].status === 'rejected') {
		playerError = results[0].reason?.message || String(results[0].reason);
	}
	if (results[1].status === 'rejected') {
		mapError = results[1].reason?.message || String(results[1].reason);
	}
	if (results[2].status === 'rejected') {
		rankError = results[2].reason?.message || String(results[2].reason);
	}

	// If player data fetch failed, return error
	if (playerError) {
		return json({ error: playerError, status: 500 }, { status: 500 });
	}

	// Player not found
	if (playerData === false) {
		return json({ error: `#未找到 "${name}" 的玩家数据`, status: 404 }, { status: 404 });
	}

	if (!playerData || !playerData.player) {
		const player = await getPlayer(name);
		if (player && player.name) {
			return json(
				{ error: `#数据获取出错，通常是 DDNet 服务器响应过慢，请稍后再试。`, status: 500 },
				{ status: 500 }
			);
		}
		return json({ error: `#未找到 "${name}" 的玩家数据`, status: 404 }, { status: 404 });
	}

	// Maps or ranks failed — still return partial, but flag errors so the client knows
	if (mapError || rankError) {
		return json(
			{
				error: mapError || rankError,
				status: 500,
				partial: true
			},
			{ status: 500 }
		);
	}

	const player = playerData;

	// remove useless activity data way past 365 days
	if (player.activity && player.activity.length > 1) {
		const date = player.activity[player.activity.length - 1]?.date;
		if (date) {
			const lastActivity = new Date(date);
			player.activity = player.activity.filter(
				(activity: any) =>
					new Date(activity.date).getTime() > lastActivity.getTime() - 366 * 24 * 60 * 60 * 1000
			);
		}
	}

	// find all maps that are in last finishes
	const lastFinishMaps = mapData.filter((map: any) =>
		player.last_finishes.some((finish: any) => finish.map == map.name)
	);

	// insert pending maps into map data
	for (const map of lastFinishMaps) {
		const type = player.types[map.type];
		const typeMaps = type?.maps;
		if (!typeMaps) continue;

		const targetMap = typeMaps[map.name];
		if (!targetMap) continue;
		if (targetMap.first_finish) continue;

		const mapFinishInfo = player.last_finishes.find((finish: any) => finish.map == map.name);
		if (!mapFinishInfo) continue;

		targetMap.finishes = 1;
		targetMap.first_finish = mapFinishInfo.timestamp;
		targetMap.pending = true;
		targetMap.time = mapFinishInfo.time ?? undefined;

		const points = targetMap.points;
		if (points) {
			player.pending_points = (player.pending_points || 0) + points;
		}

		const lastFinish = player.last_finishes[player.last_finishes.length - 1];
		if (lastFinish && Date.now() / 1000 - lastFinish.timestamp < 24 * 60 * 60) {
			player.pending_unknown = true;
		}
	}

	// Regional server ranks
	const favoriteServer = player.favorite_server;
	const serverCache = await regionalRanks(favoriteServer.server);
	if (serverCache) {
		try {
			const serverRanks = await serverCache.fetchCache();
			player.server_points = serverRanks.result.ranks.points.find(
				(rank: any) => rank.name == player.player
			);
			player.server_rank = serverRanks.result.ranks.rank.find(
				(rank: any) => rank.name == player.player
			);
			player.server_team_rank = serverRanks.result.ranks.team.find(
				(rank: any) => rank.name == player.player
			);
		} catch {}
	}

	const skin = (getSkin(player.player) || {}) as {
		n?: string;
		b?: number;
		f?: number;
	};

	player.data_update_time = rankData.update_time;

	// Cache response on client for 10 minutes
	setHeaders({
		'Cache-Control': 'public, max-age=600'
	});

	return json({
		player,
		skin
	});
};