import { FetchCache } from '../fetch-cache';
import { convert } from '../imgproxy';

export type SkinInfo = {
	skins: {
		name: string;
		type: string;
		hd: {
			uhd: false;
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
};

export const skins = new FetchCache<SkinInfo>(
	'https://ddnet.org/skins/skin/skins.json',
	async (response) => {
		const result = (await response.json()) as SkinInfo;
		await Promise.allSettled(
			result.skins.map(async (skin) => {
				skin.url = (
					skin.type == 'normal'
						? await convert(`https://ddnet.org/skins/skin/${skin.name}.${skin.imgtype}`)
						: await convert(
								`https://ddnet.org/skins/skin/${skin.type}/${skin.name}.${skin.imgtype}`
							)
				).toString();
			})
		);
		return result;
	}
);
