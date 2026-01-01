import { mapType, numberToStars } from '$lib/ddnet/helpers';
import { checkMapName } from '$lib/ddnet/searches';
import { encodeAsciiURIComponent } from '$lib/link';
import { maps, type MapList } from '$lib/server/fetches/maps';
import type { Handler } from '../protocol/types';

const MAPTYPE_KEYWORDS: Record<string, string> = {
	'-rol': 'random',
	'-rnd': 'random',
	'-ran': 'random',
	随: 'random',

	'-nov': 'novice',
	'-mod': 'moderate',
	'-bru': 'brutal',
	'-ins': 'insane',
	'-ddm': 'ddmax',
	'-eas': 'ddmax.easy',
	'-nex': 'ddmax.next',
	'-nut': 'ddmax.nut',
	'-pro': 'ddmax.pro',
	'-old': 'oldschool',
	'-dum': 'dummy',
	'-sol': 'solo',
	'-rac': 'race',
	'-fun': 'fun',
	'-eve': 'event',
	'-ddmax.ea': 'ddmax.easy',
	'-ddmax.ne': 'ddmax.next',
	'-ddmax.nu': 'ddmax.nut',
	'-ddmax.pr': 'ddmax.pro',
	新: 'novice',
	中: 'moderate',
	高: 'brutal',
	疯: 'insane',
	古: 'ddmax',
	古典Ea: 'ddmax.easy',
	古典Ne: 'ddmax.next',
	古典Nu: 'ddmax.nut',
	古典Pr: 'ddmax.nut',
	'古典.Ea': 'ddmax.easy',
	'古典.Ne': 'ddmax.next',
	'古典.Nu': 'ddmax.nut',
	'古典.Pr': 'ddmax.pro',
	传: 'oldschool',
	分: 'dummy',
	单: 'solo',
	竞: 'race',
	娱: 'fun',
	活: 'event'
};

const MAPTYPE_KEYWORDS_SORTED = Object.keys(MAPTYPE_KEYWORDS).sort((a, b) => b.length - a.length);

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
	let diff = 0;

	for (const keyword of MAPTYPE_KEYWORDS_SORTED) {
		if (mapName.toLowerCase().startsWith(keyword)) {
			type = MAPTYPE_KEYWORDS[keyword];
			break;
		}
	}

	if (type) {
		mapName = args.split(' ').slice(1).join(' ');

		for (const keyword of Object.keys(MAPDIFF_KEYWORDS)) {
			if (args.toLowerCase().indexOf(keyword) >= 0) {
				diff = MAPDIFF_KEYWORDS[keyword];
				break;
			}
		}
	}

	const mapData = (await maps.fetchCache()).result;

	if (!mapName) {
		const finishedList = new Set<string>();
		let usingName = false;

		if (user && user.bind_name) {
			const playerName = user.bind_name;
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
					? `随机找了一张 ${user?.bind_name} 未完成的 ${descriptor} 图`
					: `随机找了一张 ${user?.bind_name} 未完成的图`
				: descriptor
					? `没有找到 ${user?.bind_name} 未完成的 ${descriptor} 图，随机从所有图中选了一张`
					: `没有找到 ${user?.bind_name} 未完成的图，随机从所有图中选了一张`
			: descriptor
				? `随机找了一张 ${descriptor} 图`
				: `随机找了一张图`;

		if (randomMap) {
			const lines = [
				finishingDesc,
				randomMap.mapper ? `${randomMap.name} (by ${randomMap.mapper})` : randomMap.name,
				`[${mapType(randomMap.type)} ${numberToStars(randomMap.difficulty)}] ${randomMap.points}pts`
			];

			const text = lines.join('\n');
			const image = randomMap.thumbnail;
			const link = descriptor
				? {
						label: `🔗 查看所有 ${descriptor} 图`,
						prefix: `${descriptor} 图列表: `,
						url:
							type == 'random'
								? `https://teeworlds.cn/goto#ms${diff ? `diff=${diff}` : ''}`
								: `https://teeworlds.cn/goto#mstype=${type}${diff ? `&diff=${diff}` : ''}`
					}
				: {
						label: `🔗 查看所有图`,
						prefix: `地图列表: `,
						url: `https://teeworlds.cn/goto#m`
					};

			if (reply.imageTextLink) {
				return await reply.imageTextLink(text, image, link);
			} else {
				return await reply.textLink(text, link);
			}
		}

		return await reply.text(`不存在 ${descriptor} 图`);
	}

	const removeSeparator = (str: string) => {
		let noSeparator = '';
		for (let i = 0; i < str.length; i++) {
			const char = str[i];
			const isSeparator = char == '-' || char == '_' || char == ' ';
			if (!isSeparator) {
				noSeparator += char;
			}
		}
		return noSeparator;
	};

	const filteredMaps = mapData
		.filter((map: (typeof mapData)[0]) => {
			return (
				(!type || map.type.toLowerCase().startsWith(type)) &&
				(!diff || map.difficulty == diff) &&
				checkMapName(map.name, mapName)
			);
		})
		.map((map) => ({ ...map, nameNoSeparator: removeSeparator(map.name) }));

	if (filteredMaps.length == 0) {
		return await reply.text(`未找到名为 ${mapName} 的地图`);
	}

	let targetMap: MapList[0] | null = null;

	const mapNameNoSpeparator = removeSeparator(mapName);

	// sort by lowest point (easiest, probably finished by most players)
	// then oldest
	targetMap = filteredMaps.sort((a, b) => {
		const aExact = a.name.toLowerCase() == mapName.toLowerCase();
		const bExact = b.name.toLowerCase() == mapName.toLowerCase();
		const aCaseExact = a.name == mapName;
		const bCaseExact = b.name == mapName;

		if (aExact && bExact) {
			if (aCaseExact != bCaseExact) {
				return aCaseExact ? -1 : 1;
			}
		} else if (aExact && !bExact) {
			return -1;
		} else if (bExact && !aExact) {
			return 1;
		}

		const aStartsWith = a.nameNoSeparator.toLowerCase().startsWith(mapNameNoSpeparator);
		const bStartsWith = b.nameNoSeparator.toLowerCase().startsWith(mapNameNoSpeparator);
		const aCaseStartsWith = a.nameNoSeparator.startsWith(mapNameNoSpeparator);
		const bCaseStartsWith = b.nameNoSeparator.startsWith(mapNameNoSpeparator);

		if (aStartsWith == bStartsWith) {
			if (aCaseStartsWith != bCaseStartsWith) {
				return aCaseStartsWith ? -1 : 1;
			}
			if (a.points == b.points) {
				return new Date(a.release || 0).getTime() - new Date(b.release || 0).getTime();
			}
			return a.points - b.points;
		}

		if (aStartsWith) {
			return -1;
		}

		return 1;
	})[0];

	if (!targetMap) {
		return await reply.text(`未找到名为 ${mapName} 的地图`);
	}

	const lines = [
		`${targetMap.name} (by ${targetMap.mapper})`,
		`[${mapType(targetMap.type)} ${numberToStars(targetMap.difficulty)}] ${targetMap.points}pts`
	];

	const text = lines.join('\n');
	const image = targetMap.thumbnail;
	const link = {
		label: '🔗 地图详情',
		prefix: '详情: ',
		url: `https://teeworlds.cn/goto#m${encodeAsciiURIComponent(targetMap.name)}`
	};

	if (reply.imageTextLink) {
		return await reply.imageTextLink(text, image, link);
	} else {
		return await reply.textLink(text, link);
	}
};
