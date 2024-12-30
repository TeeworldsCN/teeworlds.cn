import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load = (({ locals, url, parent }) => {
	if (!locals.user) {
		return redirect(302, `/login?ref=${encodeURIComponent(url.pathname)}`);
	}
	return parent();
}) satisfies LayoutServerLoad;
