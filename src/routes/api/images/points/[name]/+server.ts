import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { generatePointsImage } from '$lib/server/images/points';
import { getPlayer } from '$lib/server/players';
import { regionalRanks } from '$lib/server/fetches/ranks';
import {
	faCalendar,
	faGlobe,
	faUser,
	faUserGear,
	faUserGroup,
	faUsersGear
} from '@fortawesome/free-solid-svg-icons';
import { getSkin } from '$lib/server/ddtracker';

export const GET: RequestHandler = async ({ params }) => {
	let playerName = params.name;

	const data = await getPlayer(playerName);
	if (data == null || !data.name) {
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
			icon: faGlobe,
			iconColor: '#51a2ff',
			name: '总通过分',
			rank: player.points,
			fallback: '未获得'
		},
		{
			icon: faCalendar,
			iconColor: '#51a2ff',
			name: '去年获得',
			rank: player.yearly,
			fallback: '未获得'
		},
		{
			icon: faUser,
			iconColor: '#ffb900',
			name: '个人排位分',
			rank: player.rank,
			fallback: '未获得'
		},
		{
			icon: faUserGroup,
			iconColor: '#ffb900',
			name: '团队排位分',
			rank: player.team,
			fallback: '未获得'
		},
		{
			icon: faUserGear,
			iconColor: '#ff6467',
			name: '国服排位分',
			rank: player.chnRank,
			fallback: '未进前 500 名'
		},
		{
			icon: faUsersGear,
			iconColor: '#ff6467',
			name: '国服团队分',
			rank: player.chnTeam,
			fallback: '未进前 500 名'
		}
	];

	const skin = getSkin(playerName, 'as:cn') || { n: 'default' };

	try {
		const pointImage = await generatePointsImage(playerName, skin, ranks);
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
