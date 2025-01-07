import { uaIsStrict } from '$lib/helpers';
import { redirect } from '@sveltejs/kit';

export const load = ({ request, url }) => {
	const userAgent = request.headers.get('user-agent');
	const ref = url.searchParams.get('ref');
	if (ref && !uaIsStrict(userAgent)) {
		return redirect(302, ref);
	}
};
