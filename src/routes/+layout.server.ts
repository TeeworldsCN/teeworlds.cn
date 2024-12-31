import type { LayoutServerLoad } from './$types';

export const load = (({ locals, request }) => {
	const userAgent = request.headers.get('user-agent');
	return { ua: userAgent, user: locals.user };
}) satisfies LayoutServerLoad;
