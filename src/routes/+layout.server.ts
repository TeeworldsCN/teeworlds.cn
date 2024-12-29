import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, request }) => {
	const userAgent = request.headers.get('user-agent');
	return { ua: userAgent, user: locals.user };
};
