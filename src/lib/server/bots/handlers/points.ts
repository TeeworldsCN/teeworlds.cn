import { numberToSub } from '$lib/helpers';
import { encodeAsciiURIComponent } from '$lib/link';
import { regionalRanks } from '$lib/server/fetches/ranks';
import { allowedText } from '$lib/server/filter';
import { getPlayer } from '$lib/server/players';
import type { Handler } from '../protocol/types';

export const handlePoints: Handler = async ({ platform, user, reply, args }) => {
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

	const data = await getPlayer(playerName);
	if (data == null) {
		// no valid player data
		return await reply.text('啊，豆豆的数据代码出问题了，快叫人来修复豆豆。');
	}

	if (platform === 'qq') {
		reply.image(`https://teeworlds.cn/api/images/points/${encodeAsciiURIComponent(playerName)}`);
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
		return await reply.text('未找到相关的玩家信息');
	}

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

	return await reply.textLink(lines.join('\n'), {
		label: `🔗 玩家详情`,
		prefix: '详情点击：',
		url: `https://teeworlds.cn/goto#p${encodeAsciiURIComponent(player.name)}`
	});
};
