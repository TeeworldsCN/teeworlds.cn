import { error } from '@sveltejs/kit';
import { encodeAsciiURIComponent } from '$lib/link';
import type { PageLoad } from './$types';

export const ssr = false;

const API_TIMEOUT = 15000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 2000;

/**
 * Fetch with timeout + retry with exponential backoff.
 * Returns the parsed JSON on success, throws on final failure.
 */
async function fetchWithRetry(url: string): Promise<any> {
	let lastError: Error | null = null;

	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		try {
			const res = await fetch(url, { signal: AbortSignal.timeout(API_TIMEOUT) });
			const body = await res.json();

			if (res.ok) return body;

			// 4xx errors are not retryable (e.g. 404)
			if (res.status >= 400 && res.status < 500) {
				return body;
			}

			// 5xx — retryable
			lastError = new Error(body.error || `API error ${res.status}`);
		} catch (e: any) {
			if (e.name === 'TimeoutError' || e.name === 'AbortError') {
				lastError = new Error('请求超时，正在重试...');
			} else {
				lastError = e;
			}
		}

		if (attempt < MAX_RETRIES - 1) {
			// exponential backoff: 2s, 4s, ...
			await new Promise((r) => setTimeout(r, RETRY_BASE_DELAY * Math.pow(2, attempt)));
		}
	}

	throw lastError || new Error('获取数据失败');
}

export const load: PageLoad = async ({ params, parent }) => {
	const name = params.name;

	const result = await fetchWithRetry(
		`/api/player-detail/${encodeAsciiURIComponent(name)}`
	);

	if (result.error && !result.player) {
		return error(result.status || 500, result.error);
	}

	const player = result.player;
	const skinResult = result.skin;

	let last_finish = player.last_finishes[0] || {
		timestamp: 0,
		map: '',
		time: 0,
		country: '',
		type: ''
	};

	let types = Object.keys(player.types);
	types.unshift('points');

	let points = {
		type: 'points',
		rank: player.points.rank,
		points: 0,
		total_points: 0,
		finishes: 0,
		total_map: 0
	};

	// setup stats
	let stats = types
		.filter((type) => type != 'Fun')
		.map((type) => {
			if (type == 'points') return points;
			const data = player.types[type];
			const result = {
				type,
				rank: data.points.rank,
				points: data.points.points || 0,
				total_points: data.points.total,
				finishes: Object.entries(data.maps).filter(([_, map]: [string, any]) => map.finishes).length,
				total_map: Object.keys(data.maps).length
			};

			points.points += result.points;
			points.total_points += result.total_points;
			points.finishes += result.finishes;
			points.total_map += result.total_map;
			return result;
		});

	let statsCols = [
		stats.slice(0, Math.ceil(stats.length / 2)),
		stats.slice(Math.ceil(stats.length / 2))
	];

	// setup ranks
	let ranks: {
		icon: string;
		name: string;
		rank: {
			points?: number;
			rank?: number | null;
			pending?: number;
		};
	}[] = [
		{ icon: '🌎', name: '里程', rank: { ...player.points, pending: player.pending_points } },
		{ icon: '👥', name: '团队排位分', rank: player.team_rank },
		{ icon: '👤', name: '个人排位分', rank: player.rank },
		{ icon: 'SV', name: '里程排名', rank: player.server_points || {} },
		{ icon: 'SV', name: '个人排位', rank: player.server_rank || {} },
		{ icon: 'SV', name: '团队排位', rank: player.server_team_rank || {} },
		{ icon: '📅', name: '近期里程 (近365天)', rank: player.points_last_year },
		{ icon: '📅', name: '近期里程 (近30天)', rank: player.points_last_month },
		{ icon: '📅', name: '近期里程 (近7天)', rank: player.points_last_week }
	];

	// setup activity
	const day = 24 * 60 * 60 * 1000;
	const today = new Date(Date.now() - 7 * 60 * 60 * 1000);
	today.setHours(0, 0, 0, 0);
	const firstActivity = new Date(today.getTime() - 365 * day);

	const activityMap = new Map<number, number>();
	for (const date of player.activity) {
		const key = Math.round(new Date(date.date).getTime() / day);
		activityMap.set(key, date.hours_played);
	}

	const marginDays = firstActivity.getDay() - 1;
	const startDate = new Date(firstActivity.getTime() - marginDays * day);
	const todayKey = Math.round(new Date(today.getTime()).getTime() / day);
	const startKey = Math.round(startDate.getTime() / day);

	const columns = Math.ceil((marginDays + 365) / 7);
	const activityCols: { date: string; hours: number }[][] = [];
	for (let y = 0; y < 7; y++) {
		const row: { date: string; hours: number }[] = [];
		for (let x = 0; x < columns; x++) {
			const date = new Date(startDate.getTime() + (x * 7 + y) * day);
			const key = Math.round(date.getTime() / day);
			const hours = activityMap.get(key) || 0;
			if (key < startKey || key > todayKey) {
				row.push({ date: '', hours: hours });
			} else {
				row.push({ date: date.toLocaleDateString('zh-CN'), hours: hours });
			}
		}
		activityCols.push(row);
	}

	// setup growth
	const dedup = new Set<string>();
	let maps = Object.keys(player.types)
		.flatMap((type) =>
			Object.entries(player.types[type].maps).map(([mapName, map]: [string, any]) => {
				if (map.points == 0) {
					map.rank = undefined;
					map.team_rank = undefined;
				}
				return { name: mapName, type, map };
			})
		)
		.sort((a, b) => (b.map.first_finish || 0) - (a.map.first_finish || 0));
	maps = maps.reduce(
		(acc, map) => {
			if (!dedup.has(map.name)) {
				dedup.add(map.name);
				acc.push(map);
			}
			return acc;
		},
		[] as typeof maps
	);

	let currentPoints = 0;
	const endOfDay = new Date().setHours(23, 59, 59, 0) / 1000;
	let currentDate = endOfDay - 364 * 24 * 60 * 60;

	const growth: number[] = [];
	const finishedMaps = maps.filter((map) => map.map.first_finish).reverse();
	let mapIndex = 0;

	for (let i = 0; i < 365; i++) {
		while (finishedMaps[mapIndex] && finishedMaps[mapIndex].map.first_finish! <= currentDate) {
			currentPoints += finishedMaps[mapIndex].map.points;
			mapIndex++;
		}
		growth.push(currentPoints);
		currentDate += 24 * 60 * 60;
	}

	growth[growth.length - 1] = player.points.points;

	return {
		player: {
			player: player.player,
			first_finish: player.first_finish,
			hours_played_past_365_days: player.hours_played_past_365_days,
			data_update_time: player.data_update_time,
			favorite_server: player.favorite_server,
			favorite_partners: player.favorite_partners,
			last_finishes: player.last_finishes,
			pending_unknown: player.pending_unknown,
			pending_points: player.pending_points,
			points: player.points
		},
		activity: activityCols,
		skin: skinResult,
		last_finish,
		statsCols,
		ranks,
		growth,
		endOfDay,
		maps,
		...(await parent())
	};
};