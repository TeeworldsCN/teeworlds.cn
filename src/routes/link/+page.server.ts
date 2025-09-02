import { uaIsStrict } from '$lib/helpers';
import { redirect } from '@sveltejs/kit';
import { decodeBase64Url } from '$lib/base64url';

export const load = ({ request, url }) => {
	const userAgent = request.headers.get('user-agent');
	const ref = url.searchParams.get('ref');
	if (ref && !uaIsStrict(userAgent)) {
		try {
			// Try to decode as base64url first
			const decodedRef = decodeBase64Url(ref);
			return redirect(302, decodedRef);
		} catch {
			// If decoding fails, treat as regular URL (backward compatibility)
			return redirect(302, ref);
		}
	}
};
