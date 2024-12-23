import { browser } from '$app/environment';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = ({}) => {
	if (browser) {
		const userAgent = navigator.userAgent;
		return { ua: userAgent };
	}
	return {};
};
