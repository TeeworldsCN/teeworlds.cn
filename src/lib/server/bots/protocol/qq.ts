import { QQ_SECRET, QQ_APPID } from '$env/static/private';

// QQ OpenAPI
const END_POINT = 'https://api.sgroup.qq.com';

class QQBot {
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
				QQ_APPID,
				clientSecret: QQ_SECRET
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

	async replyToC2CMessage(openid: string, msgId: string, content: string) {
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
				content,
				msg_type: 0,
				msg_id: msgId
			})
		});

		if (res.status != 200) {
			console.error(res.status, res.statusText);
		}
		return res;
	}

	async replyToGroupAtMessage(groupId: string, msgId: string, content: string) {
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
				content,
				msg_type: 0,
				msg_id: msgId
			})
		});

		if (res.status != 200) {
			console.error(res.status, res.statusText);
		}
		return res;
	}

	async replyToDirectMessage(guildId: string, msgId: string, content: string) {
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
				content,
				msg_id: msgId
			})
		});
		if (res.status != 200) {
			console.error(res.status, res.statusText);
		}
		return res;
	}

	async replyToAtMessage(channelId: string, msgId: string, content: string) {
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
				content,
				msg_type: 0,
				msg_id: msgId
			})
		});

		if (res.status != 200) {
			console.error(res.status, res.statusText);
		}
		return res;
	}
}

// Create Bot
export let BOT: QQBot | null = null;
if (!QQ_SECRET || !QQ_APPID) {
	BOT = null;
} else {
	console.log(`QQBot is activated`);
	BOT = new QQBot(QQ_SECRET);
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
