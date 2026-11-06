import { FetchCache } from '../fetch-cache';

export type SkinInfo = {
	skins: {
		/** 皮肤库里的原名,区分大小写(展示、拼 URL 都用它) */
		name: string;
		type: string;
		hd: {
			uhd: boolean;
		};
		creator: string;
		license: string;
		bodypart: string;
		gameversion: string;
		date: string;
		skinpack: string;
		imgtype: string;
		url: string;
	}[];
	map: { [key: string]: string };
};

export const skins = new FetchCache<SkinInfo>(
	'https://ddnet.org/skins/skin/skins.json',
	async (response) => {
		const result = (await response.json()) as SkinInfo;
		const map: { [key: string]: string } = {};
		await Promise.allSettled(
			result.skins.map(async (skin) => {
				skin.url = (
					skin.type == 'normal'
						? `/api/skins/${encodeURIComponent(skin.name)}.${skin.imgtype}`
						: `/api/skins/${encodeURIComponent(skin.type)}/${encodeURIComponent(skin.name)}.${skin.imgtype}`
				).toString();
				// 只有 map 的 key 小写(查找用),`skin.name` 和 `skin.url` 都保留原名 ——
				// 上游皮肤路径是大小写敏感的(10Nanami_glow.png)。
				map[skin.name.toLowerCase()] = skin.url;
			})
		);
		result.map = map;
		return result;
	},
	// 恢复完整皮肤库(上一版曾把 `x_` 内置皮肤过滤掉),升 version 让老缓存失效
	{ version: 10 }
);
