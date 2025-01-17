import { mapType, numberToStars } from '$lib/ddnet/helpers';
import { checkMapName } from '$lib/ddnet/searches';
import { encodeAsciiURIComponent } from '$lib/link';
import { maps, type MapList } from '$lib/server/fetches/maps';
import type { Handler } from '../protocol/types';

export const handleMaps: Handler = async ({ reply, fetch, args }) => {
	const mapName = args.trim();
	if (!mapName) {
		return await reply.textLink('查图请提供 <地图名>。或者使用 DDNet 工具箱', {
			label: '🔗 排名查询工具',
			prefix: '→ ',
			url: 'https://teeworlds.cn/goto#m'
		});
	}

	const mapData = await maps.fetch();

	const filteredMaps = mapData.filter((map: (typeof mapData)[0]) => {
		return checkMapName(map.name, mapName);
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
			if (a.points == b.points) {
				return new Date(a.release).getTime() - new Date(b.release).getTime();
			}
			return a.points - b.points;
		})[0];

		if (!targetMap) return await reply.text(`未找到名为 ${mapName} 的地图`);
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
