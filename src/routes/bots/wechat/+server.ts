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

	if (!WeChat.verify(signature, timestamp, nonce)) {
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
		if (!WeChat.verify(signature, timestamp, nonce, result.Encrypt)) {
			return new Response('Forbidden', { status: 403, headers: { 'content-type': 'text/plain' } });
		}

		body = WeChat.decrypt(result.Encrypt);
	}

	const data = WeChat.parse<WeChatIncomingMessage>(body);

	if (data.MsgType === 'text') {
		const message = data.Content;
		const user = data.FromUserName;
		const receiver = data.ToUserName;

		const dedupKey = `wechat:dedup:${data.MsgId}`;

		if (await volatile.get(dedupKey)) {
			// dedup, ignore resend
			return new Response('success', { status: 200, headers: { 'content-type': 'text/plain' } });
		}

		await volatile.set(dedupKey, true, 60000);

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
					reply = {
						ToUserName: cdata(user),
						FromUserName: cdata(receiver),
						CreateTime: Math.floor(Date.now() / 1000),
						MsgType: cdata('text'),
						Content: cdata(msg)
					};
					return reply;
				},
				link: (link) => {
					reply = {
						ToUserName: cdata(user),
						FromUserName: cdata(receiver),
						CreateTime: Math.floor(Date.now() / 1000),
						MsgType: cdata('text'),
						Content: cdata(`${link.prefix}${link.url}`)
					};
					return reply;
				},
				textLink: (msg, link) => {
					reply = {
						ToUserName: cdata(user),
						FromUserName: cdata(receiver),
						CreateTime: Math.floor(Date.now() / 1000),
						MsgType: cdata('text'),
						Content: cdata(`${msg}\n${link.prefix}${link.url}`)
					};
					return reply;
				},
				image: (url) => {
					return { success: false };
				},
				imageText: (msg, url) => {
					reply = {
						ToUserName: cdata(user),
						FromUserName: cdata(receiver),
						CreateTime: Math.floor(Date.now() / 1000),
						MsgType: cdata('text'),
						Content: cdata(msg)
					};
					return reply;
				},
				imageTextLink: (msg, url, link) => {
					reply = {
						ToUserName: cdata(user),
						FromUserName: cdata(receiver),
						CreateTime: Math.floor(Date.now() / 1000),
						MsgType: cdata('text'),
						Content: cdata(`${msg}\n${link.prefix}${link.url}`)
					};
					return reply;
				},
				custom: (body) => {
					reply = {
						ToUserName: cdata(user),
						FromUserName: cdata(receiver),
						CreateTime: Math.floor(Date.now() / 1000),
						MsgType: cdata('text'),
						Content: cdata(body)
					};
					return reply;
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
		} else {
			return new Response(WeChat.build<WeChatOutgoingMessage>(reply), {
				status: 200,
				headers: { 'content-type': 'text/xml' }
			});
		}
	} else if (data.MsgType === 'event') {
		if (data.Event === 'subscribe') {
			return new Response(
				WeChat.build<WeChatOutgoingMessage>({
					ToUserName: cdata(data.FromUserName),
					FromUserName: cdata(data.ToUserName),
					CreateTime: Math.floor(Date.now() / 1000),
					MsgType: cdata('text'),
					Content: cdata('欢迎关注豆豆！给我发送 ？ 可以了解豆豆的查询功能')
				}),
				{
					status: 200,
					headers: { 'content-type': 'text/xml' }
				}
			);
		}
	}

	return new Response('success', { status: 200, headers: { 'content-type': 'text/plain' } });
};
