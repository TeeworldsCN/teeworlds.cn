import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ request }) => {
	const userAgent = request.headers.get('user-agent');
	return { ua: userAgent };
};
