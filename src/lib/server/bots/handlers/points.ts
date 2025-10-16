import { numberToSub } from '$lib/helpers';
import { encodeAsciiURIComponent } from '$lib/link';
import { regionalRanks } from '$lib/server/fetches/ranks';
import type { Handler } from '../protocol/types';

export const handlePoints: Handler = async ({ user, reply, args }) => {
	let playerName = args.trim();

	// check binds
	if (!playerName) {
		playerName = user?.bind_name || '';
	}

	if (!playerName) {
		return await reply.textLink('查分请提供 <玩家名>。或者使用 DDNet 工具箱', {
			label: '🔗 排名查询工具',
			prefix: '→ ',
			url: 'https://teeworlds.cn/goto#p'
		});
	}

	const response = await fetch(
		`https://ddnet.org/players/?json2=${encodeURIComponent(playerName)}`
	);
	if (!response.ok) {
		return await reply.text('DDNet 官网暂时连接不上，请稍后再试。');
	}

	const data = await response.json();
	if (!data || !data.player) {
		// no valid player data
		return await reply.text('未找到相关的玩家信息');
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
			const chnRanks = (await chnFetch.fetchCache()).result;
			const chnSoloRank = chnRanks.ranks.rank.find((rank) => rank.name == playerName);
			const chnTeamRank = chnRanks.ranks.team.find((rank) => rank.name == playerName);

			player.chnRank = chnSoloRank;
			player.chnTeam = chnTeamRank;
		} catch {}
	}

	const ranks = [
		{
			name: '🌎 里程',
			rank: player.points,
			always: true
		},
		{
			name: '📅 近年里程',
			rank: player.points_last_year,
			always: true
		},
		{ name: '👤 个人排位', rank: player.rank, always: false },
		{ name: '👥 团队排位', rank: player.team_rank, always: false },
		{ name: '🇨🇳 国服个人排位', rank: player.chnRank, always: false },
		{ name: '🇨🇳 国服团队排位', rank: player.chnTeam, always: false }
	];

	const lines = [
		data.player,
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

	return await reply.textLink(lines.join('\n'), {
		label: `🔗 玩家详情`,
		prefix: '详情点击：',
		url: `https://teeworlds.cn/goto#p${encodeAsciiURIComponent(player.player)}`
	});
};
