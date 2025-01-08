import { browser } from '$app/environment';

let skins: { [key: string]: string } | null = null;

export const getSkinUrl = async (name: string): Promise<string | null> => {
	if (!browser) {
		console.warn(
			'getSkinUrl is only available in browser, please make sure you are not trying to render it ssr. If you need skin url, do "skins.fetch()" and search there manually.'
		);
		return null;
	}
	if (!skins) {
		skins = await (await fetch('/ddnet/skins')).json();
	}
	if (!skins) return null;
	return skins[name];
};
