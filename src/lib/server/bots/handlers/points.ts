import { encodeAsciiURIComponent } from '$lib/link';
import { regionalRanks } from '$lib/server/fetches/ranks';
import { allowedText } from '$lib/server/filter';
import { getPlayer } from '$lib/server/players';
import type { Handler } from '../protocol/types';
import {
	pointsErrorMarkdown,
	pointsMarkdown,
	pointsMissingMarkdown,
	pointsNotFoundMarkdown,
	type PointsRank
} from '../markdown';

export const handlePoints: Handler = async ({ platform, user, reply, args }) => {
	let playerName = args.trim();
	const prefix = platform == 'wechat' ? '' : '/';

	// check binds
	if (!playerName) {
		playerName = user?.bind_name || '';
	}

	if (!playerName) {
		return await reply.markdown(pointsMissingMarkdown(prefix, 'https://teeworlds.cn/goto#p'));
	}

	const data = await getPlayer(playerName);
	if (data == null) {
		// no valid player data
		return await reply.markdown(pointsErrorMarkdown());
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

	if (!player.name || !allowedText(player.name)) {
		return await reply.markdown(pointsNotFoundMarkdown());
	}

	const chnFetch = await regionalRanks('chn');
	if (chnFetch) {
		try {
			const chnRanks = (await chnFetch.fetchCache()).result;
			const chnSoloRank = chnRanks.ranks.rank.find((rank) => rank.name == playerName);
			const chnTeamRank = chnRanks.ranks.team.find((rank) => rank.name == playerName);

			player.chnRank = chnSoloRank;
			player.chnTeam = chnTeamRank;
		} catch {}
	}

	const ranks: PointsRank[] = [
		{ label: '🌎 里程', points: player.points?.points, rank: player.points?.rank },
		{ label: '📅 近年里程', points: player.yearly?.points, rank: player.yearly?.rank },
		{ label: '👤 个人排位', points: player.rank?.points, rank: player.rank?.rank },
		{ label: '👥 团队排位', points: player.team?.points, rank: player.team?.rank },
		{ label: '🇨🇳 国服个人排位', points: player.chnRank?.points, rank: player.chnRank?.rank },
		{ label: '🇨🇳 国服团队排位', points: player.chnTeam?.points, rank: player.chnTeam?.rank }
	].filter(
		(rank) => rank.label == '🌎 里程' || rank.label == '📅 近年里程' || (rank.rank && rank.rank > 0)
	);

	return await reply.markdown(
		pointsMarkdown(
			player.name,
			ranks,
			`https://teeworlds.cn/goto#p${encodeAsciiURIComponent(player.name)}`
		)
	);
};
