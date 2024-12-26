import { handleChat } from '$lib/server/bots/bot';
import { BOT, type QQMessage, type QQPayload } from '$lib/server/bots/protocol/qq';
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
		let replyMethod = null;
		let mode: 'GROUP' | 'DIRECT' = 'GROUP';
		let message: string | null = null;
		let uid = payload.d.author.id;

		if (payload.t == 'C2C_MESSAGE_CREATE') {
			message = payload.d.content;
			mode = 'DIRECT';
			replyMethod = (msg: QQMessage) =>
				bot.replyToC2CMessage(payload.d.author.user_openid, payload.d.id, msg);
		} else if (payload.t == 'DIRECT_MESSAGE_CREATE') {
			message = payload.d.content;
			mode = 'DIRECT';
			replyMethod = (msg: QQMessage) =>
				bot.replyToDirectMessage(payload.d.guild_id, payload.d.id, msg);
		} else if (payload.t == 'GROUP_AT_MESSAGE_CREATE') {
			message = payload.d.content;
			mode = 'GROUP';
			replyMethod = (msg: QQMessage) =>
				bot.replyToGroupAtMessage(payload.d.group_openid, payload.d.id, msg);
		} else if (payload.t == 'AT_MESSAGE_CREATE') {
			message = payload.d.content;
			mode = 'GROUP';
			replyMethod = (msg: QQMessage) =>
				bot.replyToAtMessage(payload.d.channel_id, payload.d.id, msg);
		}

		if (replyMethod && message) {
			await handleChat(
				'qq',
				{
					text: (msg: string) => replyMethod(bot.makeText(msg)),
					custom: (body: QQMessage) => replyMethod(bot.makeCustom(body))
				},
				uid,
				message,
				mode
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
