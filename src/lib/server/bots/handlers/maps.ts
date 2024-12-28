import { mapType, numberToStars } from '$lib/ddnet/helpers';
import { encodeAsciiURIComponent } from '$lib/link';
import type { Handler } from '../protocol/types';

const checkMapName = (map: any, search: string) => {
	if (!search) {
		return true;
	}

	let mapInitial = '';
	let mapNameNoSeparator = '';
	let prevIsUpper = false;
	let prevIsSeparator = true;
	for (let i = 0; i < map.name.length; i++) {
		const char = map.name[i];
		const isUpper = char.match(/[A-Z]/);
		const isLetter = isUpper || char.match(/[a-z]/);
		const isSeparator = char == '-' || char == '_' || char == ' ';
		const isNumber = char.match(/[0-9]/);
		if (isUpper) {
			if (!prevIsUpper || prevIsSeparator) {
				mapInitial += char;
			}
		} else if (isLetter) {
			if (prevIsSeparator) {
				mapInitial += char;
			}
		} else if (isNumber) {
			mapInitial += char;
		}
		prevIsUpper = isUpper;
		prevIsSeparator = isSeparator;
		if (!isSeparator) {
			mapNameNoSeparator += char;
		}
	}

	const mapName = map.name.toLowerCase();
	const searchTextLower = search.toLowerCase();
	return (
		mapInitial.toLowerCase() == searchTextLower ||
		mapNameNoSeparator.toLowerCase().includes(searchTextLower) ||
		mapName.includes(searchTextLower)
	);
};

export const handleMaps: Handler = async ({ reply, fetch, args }) => {
	const mapName = args.trim();
	if (!mapName) {
		return await reply.textLink('查图请提供 <地图名>。或者使用 DDNet 工具箱', {
			label: '🔗 排名查询工具',
			prefix: '→ ',
			url: 'https://teeworlds.cn/s/dm'
		});
	}

	const maps: any[] = await (await fetch('/ddnet/maps?json=true')).json();

	const filteredMaps = maps.filter((map: any) => {
		return checkMapName(map, mapName);
	});

	if (filteredMaps.length == 0) {
		return await reply.text(`未找到名为 ${mapName} 的地图`);
	}

	let targetMap = null;

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
	}

	const lines = [
		`${targetMap.name} (by ${targetMap.mapper})`,
		`[${mapType(targetMap.type)} ${numberToStars(targetMap.difficulty)}] ${targetMap.points}pts`
	];

	return await reply.textLink(lines.join('\n'), {
		label: '🔗 地图详情',
		prefix: '详情: ',
		url: `https://teeworlds.cn/s/dm/${encodeAsciiURIComponent(targetMap.name)}`
	});
};
