import { mapType, numberToStars } from '$lib/ddnet/helpers';
import { checkMapName } from '$lib/ddnet/searches';
import { encodeAsciiURIComponent } from '$lib/link';
import { maps, type MapList } from '$lib/server/fetches/maps';
import type { Handler } from '../protocol/types';

const MAPTYPE_KEYWORDS: Record<string, string> = {
	rnd: 'random',
	随: 'random',
	ran: 'random',
	roll: 'random',

	nov: 'novice',
	mod: 'moderate',
	bru: 'brutal',
	ins: 'insane',
	ddm: 'ddmax',
	ddx: 'ddmax',
	old: 'oldschool',
	dum: 'dummy',
	solo: 'solo',
	race: 'race',
	fun: 'fun',
	新: 'novice',
	中: 'moderate',
	高: 'brutal',
	疯: 'insane',
	古: 'ddmax',
	传: 'oldschool',
	分: 'dummy',
	单: 'solo',
	竞: 'race',
	娱: 'fun'
};

const MAPDIFF_KEYWORDS: Record<string, number> = {
	'1': 1,
	'2': 2,
	'3': 3,
	'4': 4,
	'5': 5,
	一: 1,
	二: 2,
	三: 3,
	四: 4,
	五: 5
};

export const handleMaps: Handler = async ({ reply, user, args }) => {
	let mapName = args.trim();
	if (!mapName) {
		return await reply.textLink('查图请提供 <地图名>。或者使用 DDNet 工具箱', {
			label: '🔗 排名查询工具',
			prefix: '→ ',
			url: 'https://teeworlds.cn/goto#m'
		});
	}

	let type = '';
	for (const keyword of Object.keys(MAPTYPE_KEYWORDS)) {
		if (mapName.toLowerCase().startsWith(keyword)) {
			type = MAPTYPE_KEYWORDS[keyword];
			break;
		}
	}

	if (type) {
		mapName = args.split(' ').slice(1).join(' ');
	}

	// attempt to make filters for map searches
	let diff = 0;

	for (const keyword of Object.keys(MAPDIFF_KEYWORDS)) {
		if (args.toLowerCase().includes(keyword)) {
			diff = MAPDIFF_KEYWORDS[keyword];
			break;
		}
	}

	const mapData = await maps.fetch();

	if (!mapName) {
		const finishedList = new Set<string>();
		let usingName = false;

		if (user && user.data?.name) {
			const playerName = user.data.name;
			const response = await fetch(
				`https://info.ddnet.org/info?name=${encodeURIComponent(playerName)}`
			);
			if (response.ok) {
				try {
					const maps = (await response.json()) as { maps: string[] };
					for (const map of maps.maps) {
						finishedList.add(map);
					}
					usingName = true;
				} catch {}
			}
		}

		const filteredMaps = mapData.filter((map: any) => {
			return (
				(type == 'random' || map.type.toLowerCase().startsWith(type)) &&
				(!diff || map.difficulty == diff)
			);
		});

		const unfinishedMaps = filteredMaps.filter((map: any) => !finishedList.has(map.name));
		const targetGroup = unfinishedMaps.length > 0 ? unfinishedMaps : filteredMaps;

		const randomMap = targetGroup[Math.floor(Math.random() * targetGroup.length)];
		const descriptor = `${type != 'random' ? mapType(type) : ''}${diff ? ` ${numberToStars(diff)}` : ''}`;
		const finishingDesc = usingName
			? unfinishedMaps.length > 0
				? descriptor
					? `随机找了一张 ${user?.data.name} 未完成的 ${descriptor} 图`
					: `随机找了一张 ${user?.data.name} 未完成的图`
				: descriptor
					? `没有找到 ${user?.data.name} 未完成的 ${descriptor} 图，随机从所有图中选了一张`
					: `没有找到 ${user?.data.name} 未完成的图，随机从所有图中选了一张`
			: descriptor
				? `随机找了一张 ${descriptor} 图`
				: `随机找了一张图`;

		if (randomMap) {
			const lines = [
				finishingDesc,
				`${randomMap.name} (by ${randomMap.mapper})`,
				`[${mapType(randomMap.type)} ${numberToStars(randomMap.difficulty)}] ${randomMap.points}pts`
			];

			if (descriptor) {
				return await reply.imageTextLink(lines.join('\n'), randomMap.thumbnail, {
					label: `🔗 查看所有 ${descriptor} 图`,
					prefix: `${descriptor} 图列表: `,
					url:
						type == 'random'
							? `https://teeworlds.cn/goto#ms${diff ? `diff=${diff}` : ''}`
							: `https://teeworlds.cn/goto#mstype=${type}${diff ? `&diff=${diff}` : ''}`
				});
			} else {
				return await reply.imageTextLink(lines.join('\n'), randomMap.thumbnail, {
					label: `🔗 查看所有图`,
					prefix: `地图列表: `,
					url: `https://teeworlds.cn/goto#m`
				});
			}
		}

		return await reply.text(`不存在 ${descriptor} 图`);
	}

	const filteredMaps = mapData.filter((map: (typeof mapData)[0]) => {
		return (
			(!type || map.type.toLowerCase().startsWith(type)) &&
			(!diff || map.difficulty == diff) &&
			checkMapName(map.name, mapName)
		);
	});

	if (filteredMaps.length == 0) {
		return await reply.text(`未找到名为 ${mapName} 的地图`);
	}

	let targetMap: MapList[0] | null = null;

	// find exact match
	for (const map of filteredMaps) {
		if (map.name.toLowerCase() == mapName.toLowerCase()) {
			targetMap = map;
		}
	}

	if (!targetMap) {
		// sort by lowest point (easiest, probably finished by most players)
		// then oldest
		targetMap = filteredMaps.sort((a, b) => {
			const aStartsWith = a.name.toLowerCase().startsWith(mapName);
			const bStartsWith = b.name.toLowerCase().startsWith(mapName);
			const aCaseStartsWith = a.name.startsWith(mapName);
			const bCaseStartsWith = b.name.startsWith(mapName);

			if (aStartsWith == bStartsWith) {
				if (aCaseStartsWith != bCaseStartsWith) {
					return aCaseStartsWith ? -1 : 1;
				}
				if (a.points == b.points) {
					return new Date(a.release).getTime() - new Date(b.release).getTime();
				}
				return a.points - b.points;
			}

			if (aStartsWith) {
				return -1;
			}

			return 1;
		})[0];
	}

	const lines = [
		`${targetMap.name} (by ${targetMap.mapper})`,
		`[${mapType(targetMap.type)} ${numberToStars(targetMap.difficulty)}] ${targetMap.points}pts`
	];

	return await reply.imageTextLink(lines.join('\n'), targetMap.thumbnail, {
		label: '🔗 地图详情',
		prefix: '详情: ',
		url: `https://teeworlds.cn/goto#m${encodeAsciiURIComponent(targetMap.name)}`
	});
};
