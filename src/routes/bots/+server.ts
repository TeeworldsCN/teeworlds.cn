import type { RequestHandler } from './$types';

import { env } from '$env/dynamic/private';
import {
	getCustomError,
	getLastTransaction,
	getListenToUser,
	handleChat,
	registerCustom,
	setListenToUser
} from '$lib/server/bots/bot';

export const POST: RequestHandler = async ({ fetch, request, url }) => {
	const mode = url.searchParams.get('mode');

	if (mode && !env.BOT_ADMIN_TOKEN) {
		// only allow admin to set mode
		return new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } });
	}

	const bearer = request.headers.get('authorization');
	if (mode && bearer !== `Bearer ${env.BOT_ADMIN_TOKEN}`) {
		return new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } });
	}

	const body = await request.json();

	if (mode === 'custom') {
		// custom message mode
		// this generates a token, if the token is received in any of the bot's message, it will reply to the message with the given body
		const data = registerCustom(body);
		return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
	} else if (mode === 'error') {
		// get custom error message
		const data = getCustomError();
		return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
	} else if (mode === 'last') {
		const data = getLastTransaction();
		return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
	} else if (mode === 'user') {
		const user = body || null;
		setListenToUser(user);
		return new Response(JSON.stringify({ user: body }), {
			headers: { 'content-type': 'application/json' }
		});
	} else if (mode === 'getuser') {
		const user = getListenToUser();
		return new Response(JSON.stringify({ user }), {
			headers: { 'content-type': 'application/json' }
		});
	}

	// handle chat
	let response: Response | null = null;

	await handleChat(
		fetch,
		'web',
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
			custom: (body) => {
				response = new Response(JSON.stringify(body), {
					headers: { 'content-type': 'application/json' }
				});
				return { success: true };
			}
		},
		'WEBSITE',
		mode == 'group' ? 'WEBSITE' : '',
		body.message,
		body,
		mode == 'group' ? 'GROUP' : 'DIRECT'
	);

	if (response) {
		return response;
	}

	return new Response(JSON.stringify({ content: '<No Response>' }), {
		headers: { 'content-type': 'application/json' }
	});
};
