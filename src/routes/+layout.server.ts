import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, request, cookies }) => {
	const userAgent = request.headers.get('user-agent');
	let user = locals.user
		? { uid: locals.user.uid, name: locals.user.name, permissions: locals.user.permissions }
		: null;
	return { ua: userAgent, user };
};
