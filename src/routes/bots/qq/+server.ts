import { handleChat } from '$lib/server/bots/handler';
import { BOT, type QQPayload } from '$lib/server/bots/protocol/qq';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	if (!BOT) {
		return new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } });
	}

	const bot = BOT;
	const headers = request.headers;
	if (headers.get('user-agent') !== 'QQBot-Callback') {
		return new Response('Forbidden', { status: 403, headers: { 'content-type': 'text/plain' } });
	}

	if (headers.get('x-signature-method') !== 'Ed25519') {
		return new Response('Bad Request', { status: 400, headers: { 'content-type': 'text/plain' } });
	}

	// Verify signature
	const signature = headers.get('x-signature-ed25519');
	const timestamp = headers.get('x-signature-timestamp');
	if (!signature || !timestamp) {
		return new Response('Bad Request', { status: 400, headers: { 'content-type': 'text/plain' } });
	}

	const body = await request.text();
	if (!(await bot.verify(body, timestamp, signature))) {
		return new Response('Forbidden', { status: 403, headers: { 'content-type': 'text/plain' } });
	}

	const payload = JSON.parse(body) as QQPayload;
	if (payload.op == 13) {
		return new Response(
			JSON.stringify({
				plain_token: payload.d.plain_token,
				signature: await bot.sign(payload.d.plain_token, payload.d.event_ts)
			}),
			{
				headers: {
					'content-type': 'application/json'
				}
			}
		);
	} else {
		if (payload.t == 'C2C_MESSAGE_CREATE') {
			const message = payload.d.content;
			await handleChat(
				{
					text: (msg: string) =>
						bot.replyToC2CMessage(payload.d.author.user_openid, payload.d.id, msg),

					link: (title: string, desc: string, url: string) =>
						bot.replyToC2CMessage(
							payload.d.author.user_openid,
							payload.d.id,
							`${title} - ${desc}:\n${url}`
						),
					thumbnails: (title: string, desc: string, url: string, image: string) =>
						bot.replyToC2CMessage(
							payload.d.author.user_openid,
							payload.d.id,
							`${title} - ${desc}:\n${url}`
						)
				},
				payload.d.author.id,
				message,
				'DIRECT'
			);
		} else if (payload.t == 'DIRECT_MESSAGE_CREATE') {
			const message = payload.d.content;
			await handleChat(
				{
					text: (msg: string) => {
						bot.replyToDirectMessage(payload.d.guild_id, payload.d.id, msg);
					},
					link: (title: string, desc: string, url: string) => {
						bot.replyToDirectMessage(
							payload.d.guild_id,
							payload.d.id,
							`${title} - ${desc}:\n${url}`
						);
					},
					thumbnails: (title: string, desc: string, url: string, image: string) => {
						bot.replyToDirectMessage(
							payload.d.guild_id,
							payload.d.id,
							`${title} - ${desc}:\n${url}`
						);
					}
				},
				payload.d.author.id,
				message,
				'DIRECT'
			);
		} else if (payload.t == 'GROUP_AT_MESSAGE_CREATE') {
			const message = payload.d.content;
			await handleChat(
				{
					text: (msg: string) =>
						bot.replyToGroupAtMessage(payload.d.group_openid, payload.d.id, msg),
					link: (title: string, desc: string, url: string) =>
						bot.replyToGroupAtMessage(
							payload.d.group_openid,
							payload.d.id,
							`${title} - ${desc}:\n${url}`
						),
					thumbnails: (title: string, desc: string, url: string, image: string) =>
						bot.replyToGroupAtMessage(
							payload.d.group_openid,
							payload.d.id,
							`${title} - ${desc}:\n${url}`
						)
				},
				payload.d.author.id,
				message,
				'GROUP'
			);
		} else if (payload.t == 'AT_MESSAGE_CREATE') {
			const message = payload.d.content;
			await handleChat(
				{
					text: (msg: string) => bot.replyToAtMessage(payload.d.channel_id, payload.d.id, msg),
					link: (title: string, desc: string, url: string) =>
						bot.replyToAtMessage(payload.d.channel_id, payload.d.id, `${title} - ${desc}:\n${url}`),
					thumbnails: (title: string, desc: string, url: string, image: string) =>
						bot.replyToAtMessage(payload.d.channel_id, payload.d.id, `${title} - ${desc}:\n${url}`)
				},
				payload.d.author.id,
				message,
				'GROUP'
			);
		}

		// acknowledge message
		return new Response(
			JSON.stringify({
				op: 12,
				d: 0
			}),
			{
				headers: {
					'content-type': 'application/json'
				}
			}
		);
	}
};
