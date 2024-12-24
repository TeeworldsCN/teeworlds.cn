import type { PageLoad } from './$types';

export const load: PageLoad = async ({ data, parent }) => {
	const player = data.player;

	let last_finish = player.last_finishes[0] || {
		timestamp: 0,
		map: '',
		time: 0,
		country: '',
		type: ''
	};

	let types = Object.keys(player.types);
	types.unshift('total');

	let total = {
		type: 'total',
		rank: player.points.rank,
		points: 0,
		total_points: 0,
		finishes: 0,
		total_map: 0
	};

	let stats = types.map((type) => {
		if (type == 'total') return total;
		const data = player.types[type];
		const result = {
			type,
			rank: data.points.rank,
			points: data.points.points || 0,
			total_points: data.points.total,
			finishes: Object.entries(data.maps).filter(([_, map]) => map.finishes).length,
			total_map: Object.keys(data.maps).length
		};

		total.points += result.points;
		total.total_points += result.total_points;
		total.finishes += result.finishes;
		total.total_map += result.total_map;
		return result;
	});

	let statsCols = [
		stats.slice(0, Math.ceil(stats.length / 2)),
		stats.slice(Math.ceil(stats.length / 2))
	];

	let ranks = [
		{ name: '🌎 总通过分', rank: player.points },
		{ name: '👥 团队排位分', rank: player.team_rank },
		{ name: '👤 个人排位分', rank: player.rank },
		{ name: '📅 获得通过分 (近365天)', rank: player.points_last_year },
		{ name: '📅 获得通过分 (近30天)', rank: player.points_last_month },
		{ name: '📅 获得通过分 (近7天)', rank: player.points_last_week }
	];

	return {
		player,
		last_finish,
		statsCols,
		ranks,
		...(await parent())
	};
};
