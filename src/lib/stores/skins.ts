import { browser } from '$app/environment';
import type { SkinInfo } from '$lib/server/fetches/skins';

let skinInfo: SkinInfo | null = null;
let loading = false;
const callbacks: (() => void)[] = [];

export const EMOTE = {
	normal: 0,
	angry: 1,
	hurt: 2,
	smile: 3,
	unused: 4,
	surprised: 5,
};

const loadSkinInfo = async () => {
	if (skinInfo) return;

	if (loading) {
		return new Promise<void>((resolve) => {
			callbacks.push(resolve);
		});
	}

	loading = true;

	try {
		const response = await fetch('/api/skins');
		if (!response.ok) {
			throw new Error('Failed to fetch skins data');
		}
		skinInfo = await response.json();
	} catch (err) {
		console.error('Error loading skins:', err);
	} finally {
		loading = false;
		callbacks.forEach((callback) => callback());
		callbacks.splice(0, callbacks.length);
	}

	return skinInfo;
};

export const getSkinUrl = async (name: string): Promise<string | null> => {
	if (!browser) {
		console.warn(
			'getSkinUrl is only available in browser, please make sure you are not trying to render it ssr. If you need skin url, do "skins.fetch()" and search there manually.'
		);
		return null;
	}
	await loadSkinInfo();
	if (!skinInfo) return null;
	return skinInfo.map[name];
};

export const getSkins = async () => {
	if (!browser) {
		console.warn(
			'getSkins is only available in browser, please make sure you are not trying to render it ssr. If you need skin url, do "skins.fetch()" and search there manually.'
		);
		return null;
	}
	await loadSkinInfo();
	if (!skinInfo) return null;
	return skinInfo.skins;
};
