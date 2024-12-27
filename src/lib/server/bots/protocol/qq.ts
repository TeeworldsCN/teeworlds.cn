import { env } from '$env/dynamic/private';
import Link from '$lib/components/Link.svelte';

// QQ OpenAPI
const END_POINT = 'https://api.sgroup.qq.com';

export interface QQMessage {
	msg_type: number;
	content?: string;
	embed?: any;
	ark?: {
		template_id: number;
		kv: {
			key: string;
			value?: string;
			obj?: any;
		}[];
	};
	image?: string;
	markdown?: {
		template_id: number;
		params?: {
			key: string;
			values: string[];
		}[];
	};
	message_reference?: {
		message_id: string;
		ignore_get_message_error: boolean;
	};
}

export class QQBot {
	private secret: string;

	private privateKey: CryptoKey | null;
	private publicKey: CryptoKey | null;
	private callbacks: (() => void)[] | null = [];

	private accessToken: string | undefined;
	private accessTokenExpires: number | undefined;

	constructor(secret: string) {
		this.secret = secret;
		while (this.secret.length < 32) {
			this.secret += this.secret.slice(0, 32 - this.secret.length);
		}
		this.privateKey = null;
		this.publicKey = null;
		this.init(true);
	}

	async init(firstInit: boolean = false) {
		if (this.callbacks == null) return;
		if (!firstInit) {
			return new Promise<void>((resolve) => {
				if (this.callbacks != null) this.callbacks.push(resolve);
			});
		}

		const jwk = {
			d: Buffer.from(this.secret).toString('base64url'),
			key_ops: ['sign'],
			crv: 'Ed25519',
			ext: true,
			kty: 'OKP'
		};

		this.privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ed25519' }, true, [
			'sign'
		]);
		const exported = await crypto.subtle.exportKey('jwk', this.privateKey);
		exported.key_ops = ['verify'];
		delete exported.d;
		this.publicKey = await crypto.subtle.importKey('jwk', exported, { name: 'ed25519' }, false, [
			'verify'
		]);

		this.callbacks.forEach((callback) => callback());
		this.callbacks = null;
	}

	async sign(msg: string, timestamp: string) {
		await this.init();
		if (!this.privateKey) {
			throw new Error('QQBot is not initialized properly');
		}

		const body = Buffer.from(timestamp + msg);
		return Buffer.from(
			await crypto.subtle.sign({ name: 'ed25519' }, this.privateKey, body)
		).toString('hex');
	}

	async verify(msg: string, timestamp: string, sig: string) {
		await this.init();
		if (!this.publicKey) {
			throw new Error('QQBot is not initialized properly');
		}

		const body = Buffer.from(timestamp + msg);
		const signiture = Buffer.from(sig, 'hex');
		return await crypto.subtle.verify({ name: 'ed25519' }, this.publicKey, signiture, body);
	}

	async getAccessToken() {
		if (this.accessToken && this.accessTokenExpires && Date.now() < this.accessTokenExpires) {
			return this.accessToken;
		}

		const url = new URL('https://bots.qq.com/app/getAppAccessToken');
		const res = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				appId: env.QQ_APPID,
				clientSecret: env.QQ_SECRET
			})
		});

		if (res.status != 200) {
			console.error(res.status, res.statusText);
			return '';
		}

		const json = await res.json();

		if (!json.access_token || !json.expires_in) {
			console.error(json);
			return '';
		}

		this.accessToken = json.access_token;
		this.accessTokenExpires = Date.now() + (parseInt(json.expires_in) - 30) * 1000;
		return this.accessToken;
	}

	/**
	 * Make a text message
	 */
	makeText(content: string): QQMessage {
		return { content, msg_type: 0 };
	}

	/**
	 * Make a ark list message. Each line is either a text or a link.
	 */
	makeArkList(summary: string, lines: { text: string; link?: string }[]): QQMessage {
		return {
			msg_type: 3,
			ark: {
				template_id: 23,
				kv: [
					{ key: '#DESC#', value: 'DDNet Player Info' },
					{ key: '#PROMPT#', value: summary },
					{
						key: '#LIST#',
						obj: [
							lines.map((item) => {
								if (item.link) {
									return {
										obj_kv: [
											{ key: 'desc', value: item.text },
											{ key: 'link', value: item.link }
										]
									};
								} else {
									return {
										obj_kv: [{ key: 'desc', value: item.text }]
									};
								}
							})
						]
					}
				]
			}
		};
	}

	/**
	 * Make custom message
	 */
	makeCustom(body: any): QQMessage {
		return body;
	}

	async replyToC2CMessage(openid: string, msgId: string, message: QQMessage) {
		const url = new URL(`/v2/users/${openid}/messages`, END_POINT);
		const token = await this.getAccessToken();
		if (!token) {
			console.error('Can not get access token.');
			return;
		}

		const res = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `QQBot ${token}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				msg_id: msgId,
				...message
			})
		});

		if (res.status != 200) {
			return {
				code: res.status,
				message: 'Failed to send message',
				body: await res.text(),
				error: true,
				isInternal: true
			};
		}
		return res.json();
	}

	async replyToGroupAtMessage(groupId: string, msgId: string, message: QQMessage) {
		const url = new URL(`/v2/groups/${groupId}/messages`, END_POINT);
		const token = await this.getAccessToken();
		if (!token) {
			console.error('Can not get access token.');
			return;
		}

		const res = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `QQBot ${token}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				msg_id: msgId,
				...message
			})
		});

		if (res.status != 200) {
			return {
				code: res.status,
				message: 'Failed to send message',
				body: await res.text(),
				error: true,
				isInternal: true
			};
		}
		return res.json();
	}

	async replyToDirectMessage(guildId: string, msgId: string, message: QQMessage) {
		const url = new URL(`/dms/${guildId}/messages`, END_POINT);
		const token = await this.getAccessToken();
		if (!token) {
			console.error('Can not get access token.');
			return;
		}

		const res = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `QQBot ${token}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				msg_id: msgId,
				...message
			})
		});
		if (res.status != 200) {
			return {
				code: res.status,
				message: 'Failed to send message',
				body: await res.text(),
				error: true,
				isInternal: true
			};
		}
		return res.json();
	}

	async replyToAtMessage(channelId: string, msgId: string, message: QQMessage) {
		const url = new URL(`/channels/${channelId}/messages`, END_POINT);
		const token = await this.getAccessToken();
		if (!token) {
			console.error('Can not get access token.');
			return;
		}

		const res = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `QQBot ${token}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				msg_id: msgId,
				...message
			})
		});

		if (res.status != 200) {
			return {
				code: res.status,
				message: 'Failed to send message',
				body: await res.text(),
				error: true,
				isInternal: true
			};
		}
		return res.json();
	}
}

// Create Bot
export let BOT: QQBot | null = null;
if (!env.QQ_SECRET || !env.QQ_APPID) {
	BOT = null;
} else {
	console.log(`QQBot is activated`);
	BOT = new QQBot(env.QQ_SECRET);
}

// Webhook
export type QQPayload =
	| QQValidationPayload
	| QQC2CMessageCreatePayload
	| QQGroupAtMessageCreatePayload
	| QQDirectMessageCreatePayload
	| QQAtMessageCreatePayload;

export type QQC2CMessageCreatePayload = CallbackPayload<
	{
		id: string;
		content: string;
		timestamp: string;
		author: { id: string; user_openid: string; union_openid: string };
		message_scene: { source: string };
	},
	'C2C_MESSAGE_CREATE'
>;

export type QQGroupAtMessageCreatePayload = CallbackPayload<
	{
		id: string;
		content: string;
		timestamp: string;
		author: { id: string; user_openid: string; union_openid: string };
		group_id: string;
		group_openid: string;
		message_scene: { source: string };
	},
	'GROUP_AT_MESSAGE_CREATE'
>;

export type QQDirectMessageCreatePayload = CallbackPayload<
	{
		author: {
			avatar: string;
			bot: boolean;
			id: string;
			username: string;
		};
		channel_id: string;
		content: string;
		guild_id: string;
		id: string;
		member: {
			joined_at: string;
			roles: string[];
		};
		timestamp: string;
	},
	'DIRECT_MESSAGE_CREATE'
>;

export type QQAtMessageCreatePayload = CallbackPayload<
	{
		author: {
			avatar: string;
			bot: boolean;
			id: string;
			username: string;
		};
		channel_id: string;
		content: string;
		guild_id: string;
		id: string;
		member: {
			joined_at: string;
			roles: string[];
		};
		timestamp: string;
	},
	'AT_MESSAGE_CREATE'
>;

export interface QQValidationPayload {
	op: 13;
	d: {
		plain_token: string;
		event_ts: string;
	};
}

interface CallbackPayload<T, U extends string> {
	op: 12;
	id: string;
	d: T;
	t: U;
}
