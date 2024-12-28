import { redirect, type RequestHandler } from '@sveltejs/kit';

const URL_MAPPING: [string, string][] = [
	['/s/dp', '/ddnet/players'],
	['/s/dm', '/ddnet/maps']
];

export const GET: RequestHandler = ({ url }) => {
	const prefix = URL_MAPPING.find(([prefix]) => url.pathname.startsWith(prefix));
	if (!prefix) return new Response('Not Found', { status: 404 });
	const targetURL = prefix[1] + url.pathname.slice(prefix[0].length);
	return redirect(301, targetURL);
};
