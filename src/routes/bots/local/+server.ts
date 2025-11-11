import type { RequestHandler } from './$types';
import { handlePing } from '$lib/server/bots/bot';

export const POST: RequestHandler = async ({ fetch, locals, request, url, cookies }) => {
	// check if it is called from localhost
	if (locals.ip != '127.0.0.1' && locals.ip != '::1') {
		return new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } });
	}

	const body = await request.json();

	// handle chat
	let response: Response | null = null;

	await handlePing(
		fetch,
		'cli',
		{
			text: (msg) => {
				response = new Response(JSON.stringify({ content: msg }), {
					headers: { 'content-type': 'application/json' }
				});
				return { success: true };
			},
			link: (link) => {
				response = new Response(JSON.stringify({ content: `[${link.label}](${link.url})` }), {
					headers: { 'content-type': 'application/json' }
				});
				return { success: true };
			},
			textLink: (msg, link) => {
				msg += `\n\n[${link.label}](${link.url})`;
				response = new Response(JSON.stringify({ content: msg }), {
					headers: { 'content-type': 'application/json' }
				});
				return { success: true };
			},
			image: (url) => {
				response = new Response(JSON.stringify({ content: `![image](${url})` }), {
					headers: { 'content-type': 'application/json' }
				});
				return { success: true };
			},
			imageText: (msg, url) => {
				msg += `\n\n![image](${url})`;
				response = new Response(JSON.stringify({ content: msg }), {
					headers: { 'content-type': 'application/json' }
				});
				return { success: true };
			},
			imageTextLink: (msg, url, link) => {
				msg += `\n\n![image](${url})\n\n[${link.label}](${link.url})`;
				response = new Response(JSON.stringify({ content: msg }), {
					headers: { 'content-type': 'application/json' }
				});
				return { success: true };
			},
			custom: (body) => {
				response = new Response(JSON.stringify(body), {
					headers: { 'content-type': 'application/json' }
				});
				return { success: true };
			}
		},
		'CLI',
		'CLI',
		body.message,
		body,
		'DIRECT',
		false
	);

	if (response) {
		return response;
	}

	return new Response(JSON.stringify({ content: '<No Response>' }), {
		headers: { 'content-type': 'application/json' }
	});
};
