import type { PageLoad } from './$types';

export const load = (async ({ data, parent }) => {
	const player = data.player;

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

	let stats = types.map((type) => {
		if (type == 'points') return points;
		const data = player.types[type];
		const result = {
			type,
			rank: data.points.rank,
			points: data.points.points || 0,
			total_points: data.points.total,
			finishes: Object.entries(data.maps).filter(([_, map]) => map.finishes).length,
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

	let ranks: {
		name: string;
		rank: {
			points?: number;
			rank?: number | null;
			pending?: number;
		};
	}[] = [
		{ name: '🌎 总通过分', rank: { ...player.points, pending: player.pending_points } },
		{ name: '👥 团队排位分', rank: player.team_rank },
		{ name: '👤 个人排位分', rank: player.rank },
		{ name: '📅 获得通过分 (近365天)', rank: player.points_last_year },
		{ name: '📅 获得通过分 (近30天)', rank: player.points_last_month },
		{ name: '📅 获得通过分 (近7天)', rank: player.points_last_week }
	];

	return {
		player,
		skin: data.skin,
		last_finish,
		statsCols,
		ranks,
		...(await parent())
	};
}) satisfies PageLoad;
