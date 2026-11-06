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
	surprised: 5
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

/**
 * `x_` 开头的是客户端内置功能皮肤(`x_ninja` 忍者、`x_spec` 旁观 …)。
 *
 * 皮肤库里有它们,但玩家不能拿它们当自己的皮肤:谁都能把名字改成 `x_ninja`,
 * 那样就能伪装成忍者皮肤。这里(名字 → URL 的唯一出口)一律当成"没有这个皮肤",
 * 调用方就自动退回 default。
 */
const isInternalSkin = (name: string) => name.toLowerCase().startsWith('x_');

export const getSkinUrl = async (name: string): Promise<string | null> => {
	if (!browser) {
		console.warn(
			'getSkinUrl is only available in browser, please make sure you are not trying to render it ssr. If you need skin url, do "skins.fetch()" and search there manually.'
		);
		return null;
	}
	if (isInternalSkin(name)) return null;
	await loadSkinInfo();
	if (!skinInfo) return null;
	// map 的 key 已经是小写(服务端规范化过),这里统一按小写查。
	// DDNet 客户端本身也是大小写不敏感比较皮肤名的(str_comp_nocase)。
	return skinInfo.map[name.toLowerCase()] ?? null;
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
