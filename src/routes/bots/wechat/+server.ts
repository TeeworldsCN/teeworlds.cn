import { handlePing } from '$lib/server/bots/bot.js';
import {
	WeChat,
	type WeChatIncomingMessage,
	type WeChatEncryptedMessage,
	type WeChatOutgoingMessage
} from '$lib/server/bots/protocol/wechat';
import { volatile } from '$lib/server/keyv.js';

const cdata = <T>(str: T) => {
	return {
		_cdata: str
	};
};

export const GET = async ({ url }) => {
	if (!WeChat) {
		return new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } });
	}

	const params = url.searchParams;
	const nonce = params.get('nonce');
	const timestamp = params.get('timestamp');
	const signature = params.get('signature');
	const echostr = params.get('echostr');

	if (!nonce || !timestamp || !signature || !echostr) {
		return new Response('Bad Request', { status: 400, headers: { 'content-type': 'text/plain' } });
	}

	if (!WeChat.verify(echostr, signature, timestamp, nonce)) {
		return new Response('Forbidden', { status: 403, headers: { 'content-type': 'text/plain' } });
	}

	return new Response(echostr, { headers: { 'content-type': 'text/plain' } });
};

export const POST = async ({ request, url, fetch }) => {
	if (!WeChat) {
		return new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } });
	}

	const params = url.searchParams;
	const nonce = params.get('nonce');
	const timestamp = params.get('timestamp');
	const signature = params.get('msg_signature');
	const encrypt = params.get('encrypt_type');

	if (!nonce || !timestamp || !signature) {
		return new Response('Bad Request', { status: 400, headers: { 'content-type': 'text/plain' } });
	}

	let body = await request.text();

	if (encrypt === 'aes') {
		const result = WeChat.parse<WeChatEncryptedMessage>(body);
		if (!WeChat.verify(result.Encrypt._cdata, signature, timestamp, nonce)) {
			return new Response('Forbidden', { status: 403, headers: { 'content-type': 'text/plain' } });
		}

		body = WeChat.decrypt(result.Encrypt._cdata);
	}

	const data = WeChat.parse<WeChatIncomingMessage>(body);

	if (data.MsgType === 'text') {
		const message = data.Content;
		const user = data.FromUserName;
		const receiver = data.ToUserName;

		if (await volatile.get(`wechat:${data.MsgId}`)) {
			// dedup, ignore resend
			return new Response('success', { status: 200, headers: { 'content-type': 'text/plain' } });
		}

		await volatile.set(`wechat:${data.MsgId}`, true, 60000);

		if (!message || !user) {
			return new Response('Bad Request', {
				status: 400,
				headers: { 'content-type': 'text/plain' }
			});
		}

		let reply: WeChatOutgoingMessage | null = null;

		await handlePing(
			fetch,
			'wechat',
			{
				text: (msg) => {
					return (reply = {
						ToUserName: cdata(user),
						FromUserName: cdata(receiver),
						CreateTime: Math.floor(Date.now() / 1000),
						MsgType: cdata('text'),
						Content: cdata(msg)
					});
				},
				link: (link) => {
					return (reply = {
						ToUserName: cdata(user),
						FromUserName: cdata(receiver),
						CreateTime: Math.floor(Date.now() / 1000),
						MsgType: cdata('text'),
						Content: cdata(`${link.prefix}${link.url}`)
					});
				},
				textLink: (msg, link) => {
					return (reply = {
						ToUserName: cdata(user),
						FromUserName: cdata(receiver),
						CreateTime: Math.floor(Date.now() / 1000),
						MsgType: cdata('text'),
						Content: cdata(`${msg}\n${link.prefix}${link.url}`)
					});
				},
				image: (url) => {
					return { success: false };
				},
				imageText: (msg, url) => {
					return (reply = {
						ToUserName: cdata(user),
						FromUserName: cdata(receiver),
						CreateTime: Math.floor(Date.now() / 1000),
						MsgType: cdata('text'),
						Content: cdata(msg)
					});
				},
				imageTextLink: (msg, url, link) => {
					return (reply = {
						ToUserName: cdata(user),
						FromUserName: cdata(receiver),
						CreateTime: Math.floor(Date.now() / 1000),
						MsgType: cdata('text'),
						Content: cdata(`${msg}\n${link.prefix}${link.url}`)
					});
				},
				custom: (body) => {
					return (reply = {
						ToUserName: cdata(user),
						FromUserName: cdata(receiver),
						CreateTime: Math.floor(Date.now() / 1000),
						MsgType: cdata('text'),
						Content: cdata(body)
					});
				}
			},
			user,
			'WeChat',
			message,
			data,
			'DIRECT',
			false
		);

		if (!reply) {
			return new Response('success', { status: 200, headers: { 'content-type': 'text/plain' } });
		}
	}

	return new Response('success', { status: 200, headers: { 'content-type': 'text/plain' } });
};
