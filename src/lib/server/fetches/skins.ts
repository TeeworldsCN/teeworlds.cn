import { FetchCache } from '../fetch-cache';

export type SkinInfo = {
	skins: {
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
				map[skin.name] = skin.url;
			})
		);
		result.map = map;
		return result;
	},
	{ version: 6 }
);
