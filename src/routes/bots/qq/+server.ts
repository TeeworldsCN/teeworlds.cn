import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return new Response('hello world', { headers: { 'content-type': 'text/plain' } });
};
