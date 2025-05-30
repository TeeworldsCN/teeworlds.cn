import { handlePing } from '$lib/server/bots/bot';
import { QQBot, type QQMessage, type QQPayload } from '$lib/server/bots/protocol/qq';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ fetch, request }) => {
	if (!QQBot) {
		return new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } });
	}

	const bot = QQBot;
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
		let message: string = payload.d.content;
		let uid = payload.d.author.union_openid;

		if (!uid) {
			return error(400, 'Bad Request');
		}

		let group = 'DIRECT';
		let channel = false;

		// group message always at the caller. so adding a newline looks nicer
		let onNewline = false;

		if (payload.t == 'C2C_MESSAGE_CREATE') {
			onNewline = false;
			mode = 'DIRECT';
			replyMethod = (msg: QQMessage) =>
				bot.sendC2CMessage(payload.d.author.user_openid, msg, { msgId: payload.d.id });
		} else if (payload.t == 'DIRECT_MESSAGE_CREATE') {
			channel = true;
			onNewline = false;
			mode = 'DIRECT';
			group = `${payload.d.guild_id}:${payload.d.channel_id}`;
			replyMethod = (msg: QQMessage) =>
				bot.sendDirectMessage(payload.d.guild_id, msg, { msgId: payload.d.id });
		} else if (payload.t == 'GROUP_AT_MESSAGE_CREATE') {
			onNewline = true;
			group = payload.d.group_id;
			mode = 'GROUP';
			replyMethod = (msg: QQMessage) =>
				bot.sendGroupMessage(payload.d.group_openid, msg, { msgId: payload.d.id });
		} else if (payload.t == 'AT_MESSAGE_CREATE') {
			// handle at message in channel
			if (message.startsWith('<@!')) {
				const closingIndex = message.indexOf('>');
				message = message.slice(closingIndex + 1).trim();
			}
			channel = true;
			onNewline = false;
			group = `${payload.d.guild_id}:${payload.d.channel_id}`;
			mode = 'GROUP';
			replyMethod = (msg: QQMessage) =>
				bot.sendChannelMessage(payload.d.channel_id, msg, { msgId: payload.d.id });
		}

		const wrapNewline = (msg: string) => (onNewline ? '\n' + msg : msg);

		if (replyMethod && message) {
			// don't await. give a success response asap
			handlePing(
				fetch,
				'qq',
				{
					text: (msg) => replyMethod(bot.makeText(wrapNewline(msg))),
					link: (link) => {
						const msg = `${link.prefix}${link.url}`;
						return replyMethod(bot.makeText(wrapNewline(msg)));
					},
					textLink: (msg, link) => {
						msg += `\n${link.prefix}${link.url}`;
						return replyMethod(bot.makeText(wrapNewline(msg)));
					},
					image: async (url) => {
						if (channel) {
							return replyMethod(bot.makeChannelImage(url));
						}
						const file_info =
							mode == 'GROUP'
								? await bot.uploadGroupMedia(url, group)
								: await bot.uploadDirectMedia(url, uid);
						if (file_info) {
							return replyMethod(bot.makeGroupImage(file_info));
						}
						return replyMethod(bot.makeText('非常抱歉，消息在路上丢了。。。'));
					},
					imageText: async (msg, url) => {
						if (channel) {
							return replyMethod(bot.makeChannelTextImage(wrapNewline(msg), url));
						}
						const file_info =
							mode == 'GROUP'
								? await bot.uploadGroupMedia(url, group)
								: await bot.uploadDirectMedia(url, uid);
						if (file_info) {
							return replyMethod(bot.makeGroupTextImage(wrapNewline(msg), file_info));
						}
						return replyMethod(bot.makeText('非常抱歉，消息在路上丢了。。。'));
					},
					imageTextLink: async (msg, url, link) => {
						msg += `\n${link.prefix}${link.url}`;
						if (channel) {
							return replyMethod(bot.makeChannelTextImage(wrapNewline(msg), url));
						}
						const file_info =
							mode == 'GROUP'
								? await bot.uploadGroupMedia(url, group)
								: await bot.uploadDirectMedia(url, uid);
						if (file_info) {
							return replyMethod(bot.makeGroupTextImage(wrapNewline(msg), file_info));
						}
						return replyMethod(bot.makeText('非常抱歉，消息在路上丢了。。。'));
					},
					custom: (body: QQMessage) => replyMethod(bot.makeCustom(body))
				},
				uid,
				group,
				message,
				payload.d,
				mode,
				payload.t == 'AT_MESSAGE_CREATE' || payload.t == 'GROUP_AT_MESSAGE_CREATE'
			);
		}

		// acknowledge message
		return new Response(JSON.stringify({ op: 12, d: 0 }), {
			headers: { 'content-type': 'application/json' }
		});
	}
};
