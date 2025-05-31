import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { generatePointsImage } from '$lib/server/images/points';
import { getPlayer } from '$lib/server/players';

export const GET: RequestHandler = async ({ url }) => {
	let playerName = url.searchParams.get('name');
	if (!playerName) {
		return error(400);
	}

	const data = (await getPlayer(playerName)) || {
		points: { points: 1303, rank: 12313 },
		team: { points: 123, rank: 12313 },
	};
	if (data == null) {
		return error(500);
	}

	const player = data as typeof data & {
		chnRank?: {
			points?: number;
			rank?: number;
		};
		chnTeam?: {
			points?: number;
			rank?: number;
		};
	};

	const chnFetch = await regionalRanks('chn');
	if (chnFetch) {
		try {
			const chnRanks = (await chnFetch.fetch()).result;
			const chnSoloRank = chnRanks.ranks.rank.find((rank) => rank.name == playerName);
			const chnTeamRank = chnRanks.ranks.team.find((rank) => rank.name == playerName);

			player.chnRank = chnSoloRank;
			player.chnTeam = chnTeamRank;
		} catch {}
	}

	const ranks = [
		{
			name: '🌎 总通过分',
			rank: player.points,
			always: true
		},
		{
			name: '📅 去年获得',
			rank: player.yearly,
			always: true
		},
		{ name: '👤 个人排位', rank: player.rank, always: false },
		{ name: '👥 团队排位', rank: player.team, always: false },
		{ name: '🇨🇳 国服个人排位', rank: player.chnRank, always: false },
		{ name: '🇨🇳 国服团队排位', rank: player.chnTeam, always: false }
	];

	const lines = [
		data.name,
		...ranks
			.filter((rank) => rank.always || rank.rank?.rank)
			.map((rank) => {
				if (rank.rank?.rank) {
					return `${rank.name}: ${rank.rank.points}pts \t₍ₙ.${numberToSub(rank.rank.rank)}₎`;
				} else {
					return `${rank.name}: 无记录`;
				}
			})
	];

	// Test data matching the DDNet player page structure
	const testSkin = { n: 'default', b: 65408, f: 65408 };
	const testRanks = [
		{ icon: '🌎', name: '总通过分', rank: { points: 1234, rank: 567, pending: 12 } },
		{ icon: '👥', name: '团队排位分', rank: { points: 890, rank: 234 } },
		{ icon: '👤', name: '个人排位分', rank: { points: 456, rank: 123 } },
		{ icon: '📅', name: '获得通过分 (近365天)', rank: { points: 123, rank: 45 } }
	];

	try {
		const pointImage = await generatePointsImage('TsFreddie', testSkin, testRanks);
		return new Response(pointImage, {
			headers: {
				'content-type': 'image/png',
				'cache-control': 'public, max-age=3600'
			}
		});
	} catch (err) {
		console.error('Error generating points image:', err);
		return error(500, 'Failed to generate image');
	}
};
