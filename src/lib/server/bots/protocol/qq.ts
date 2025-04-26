import { env } from '$env/dynamic/private';
import { volatile } from '$lib/server/keyv';

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
	media?: { file_info: string };
}

type QQBotSendOptions = {
	/** If provided, the message will count as a reply */
	msgId?: string;
};
type QQBotMessageHandler = (
	target: string,
	message: QQMessage,
	options?: QQBotSendOptions
) => Promise<QQRequestError | any>;

export class QQBot {
	private secret: string;

	private privateKey: CryptoKey | null;
	private publicKey: CryptoKey | null;
	private callbacks: (() => void)[] | null = [];

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
		const accessToken = await volatile.get<string>('qqbot:accessToken');
		if (accessToken) {
			return accessToken;
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

		await volatile.set<string>(
			'qqbot:accessToken',
			json.access_token,
			(parseInt(json.expires_in) - 30) * 1000
		);

		return json.access_token;
	}

	/** Make a text message */
	makeText(content: string): QQMessage {
		return { msg_type: 0, content };
	}

	/** Make custom message */
	makeCustom(body: any): QQMessage {
		return body;
	}

	/** Make text image (guild only) */
	makeChannelTextImage(content: string, image: string): QQMessage {
		return { msg_type: 0, content, image };
	}

	/** Make image (guild only) */
	makeChannelImage(image: string): QQMessage {
		return { msg_type: 0, image };
	}

	/** Make text media image (qq only) */
	makeGroupTextImage(content: string, file_info: { file_info: string }): QQMessage {
		return { msg_type: 7, content, media: file_info };
	}

	/** Make media image (qq only) */
	makeGroupImage(file_info: { file_info: string }): QQMessage {
		return { msg_type: 7, content: ' ', media: file_info };
	}

	async uploadGroupMedia(image: string, groudId: string): Promise<{ file_info: string } | null> {
		const url = new URL(`/v2/groups/${groudId}/files`, END_POINT);
		const result = await this.request<{ file_info: string }>(url, 'POST', {
			file_type: 1,
			url: image
		});
		if (result.error) {
			console.error(
				`Failed to upload group media: ${result.code} ${result.message} ${result.body}`
			);
			return null;
		}
		return result.data;
	}

	async uploadDirectMedia(image: string, openId: string): Promise<{ file_info: string } | null> {
		const url = new URL(`/v2/users/${openId}/files`, END_POINT);
		const result = await this.request<{ file_info: string }>(url, 'POST', {
			file_type: 1,
			url: image
		});
		if (result.error) {
			console.error(
				`Failed to upload direct media: ${result.code} ${result.message} ${result.body}`
			);
			return null;
		}
		return result.data;
	}

	async sendMessage(url: URL, message: QQMessage, options?: QQBotSendOptions) {
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
				msg_id: options?.msgId,
				...message
			})
		});

		if (res.status != 200) {
			return {
				code: res.status,
				message: 'Failed to send message',
				body: await res.text(),
				error: true,
				internal: true
			};
		}
		return res.json();
	}

	sendC2CMessage: QQBotMessageHandler = async (openId, message, options) => {
		const url = new URL(`/v2/users/${openId}/messages`, END_POINT);
		return this.sendMessage(url, message, options);
	};

	sendGroupMessage: QQBotMessageHandler = async (openId, message, options) => {
		const url = new URL(`/v2/groups/${openId}/messages`, END_POINT);
		return this.sendMessage(url, message, options);
	};

	sendDirectMessage: QQBotMessageHandler = async (guildId, message, options) => {
		const url = new URL(`/dms/${guildId}/messages`, END_POINT);
		return this.sendMessage(url, message, options);
	};

	sendChannelMessage: QQBotMessageHandler = async (channelId, message, options) => {
		const url = new URL(`/channels/${channelId}/messages`, END_POINT);
		return this.sendMessage(url, message, options);
	};

	private async request<T>(
		url: URL,
		method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
		body?: any
	): Promise<QQRequestResult<T>> {
		const token = await this.getAccessToken();
		if (!token) {
			console.error('Can not get access token.');
			return {
				code: -1,
				message: 'Can not get access token.',
				error: true,
				internal: true
			};
		}

		const res = await fetch(url, {
			method: method,
			headers: {
				Authorization: `QQBot ${token}`,
				'Content-Type': 'application/json'
			},
			body: body ? JSON.stringify(body) : undefined
		});

		if (res.status != 200) {
			return {
				code: res.status,
				message: 'Request failed',
				body: await res.text(),
				error: true,
				internal: true
			};
		}

		return { error: false, data: (await res.json()) as T };
	}

	/** Get all available guilds, currently maxed out at 100 without pagination, but we won't need more than 100 anyway */
	async getGuilds(): Promise<QQRequestResult<QQGuild[]>> {
		const url = new URL(`/users/@me/guilds`, END_POINT);
		return this.request<QQGuild[]>(url);
	}

	async getChannels(guildId: string): Promise<QQRequestResult<QQChannel[]>> {
		const url = new URL(`/guilds/${guildId}/channels`, END_POINT);
		return this.request<QQChannel[]>(url);
	}

	async listThreads(channelId: string): Promise<QQRequestResult<QQThreads>> {
		const url = new URL(`/channels/${channelId}/threads`, END_POINT);
		return this.request<QQThreads>(url);
	}

	async getThread(
		channelId: string,
		threadId: string
	): Promise<QQRequestResult<{ thread: QQThread }>> {
		const url = new URL(`/channels/${channelId}/threads/${threadId}`, END_POINT);
		return this.request<{ thread: QQThread }>(url);
	}

	async publishThread(channelId: string, title: string, content: QQRichText) {
		const url = new URL(`/channels/${channelId}/threads`, END_POINT);
		return this.request<any>(url, 'PUT', { title, content: JSON.stringify(content), format: 4 });
	}

	async getRoles(guildId: string): Promise<QQRequestResult<GuildRolesResponse>> {
		const url = new URL(`/guilds/${guildId}/roles`, END_POINT);
		return this.request<GuildRolesResponse>(url);
	}

	async createRole(
		guildId: string,
		name?: string,
		color?: number,
		hoist?: number
	): Promise<QQRequestResult<CreateRoleResponse>> {
		const url = new URL(`/guilds/${guildId}/roles`, END_POINT);
		const body: Record<string, any> = {};

		if (name !== undefined) body.name = name;
		if (color !== undefined) body.color = color;
		if (hoist !== undefined) body.hoist = hoist;

		return this.request<CreateRoleResponse>(url, 'POST', body);
	}

	async updateRole(
		guildId: string,
		roleId: string,
		name?: string,
		color?: number,
		hoist?: number
	): Promise<QQRequestResult<UpdateRoleResponse>> {
		const url = new URL(`/guilds/${guildId}/roles/${roleId}`, END_POINT);
		const body: Record<string, any> = {};

		if (name !== undefined) body.name = name;
		if (color !== undefined) body.color = color;
		if (hoist !== undefined) body.hoist = hoist;

		return this.request<UpdateRoleResponse>(url, 'PATCH', body);
	}

	async deleteRole(
		guildId: string,
		roleId: string
	): Promise<QQRequestResult<void>> {
		const url = new URL(`/guilds/${guildId}/roles/${roleId}`, END_POINT);
		return this.request<void>(url, 'DELETE');
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
	| QQMessageCreatePayload
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

export type QQMessageCreatePayload = CallbackPayload<
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
	'MESSAGE_CREATE'
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

export type QQRequestResult<T> = QQRequestSuccess<T> | QQRequestError;

export interface QQRequestSuccess<T> {
	error: false;
	data: T;
}
export interface QQRequestError {
	code: number;
	message: string;
	body?: string;
	error: true;
	internal: true;
}

export interface QQGuild {
	id: string;
	name: string;
	icon: string;
	owner_id: string;
	owner: boolean;
	joined_at: string;
	member_count: number;
	max_members: number;
	description: string;
}

export interface QQChannel {
	id: string;
	guild_id: string;
	name: string;
	type: number;
	position: number;
	parent_id: string;
	owner_id: string;
	sub_type: number;
}

export interface QQThreads {
	threads: QQThread[];
}

export interface QQThread {
	guild_id: string;
	channel_id: string;
	author_id: string;
	thread_info: {
		thread_id: string;
		title: string;
		content: string;
		date_time: string;
	};
}

export interface QQRichText {
	paragraphs: QQRichTextParagraph[];
}

export enum QQRichTextAlignment {
	Left = 0,
	Center = 1,
	Right = 2
}

export enum QQRichTextType {
	Text = 1,
	Image = 2,
	Video = 3,
	Url = 4
}

export type QQRichTextElem =
	| QQRichTextElemText
	| QQRichTextElemImage
	| QQRichTextElemVideo
	| QQRichTextElemUrl;
export type QQRichTextElemText = {
	text: {
		text: string;
		props?: {
			font_bold?: boolean;
			italic?: boolean;
			underline?: boolean;
		};
	};
	type: QQRichTextType.Text;
};

export type QQRichTextElemImage = {
	image: {
		third_url: string;
		width_percent: number;
	};
	type: QQRichTextType.Image;
};

export type QQRichTextElemVideo = {
	video: {
		third_url: string;
	};
	type: QQRichTextType.Video;
};

export type QQRichTextElemUrl = {
	url: {
		url: string;
		desc: string;
	};
	type: QQRichTextType.Url;
};

export interface QQRichTextParagraph {
	elems: QQRichTextElem[];
	props?: {
		alignment?: QQRichTextAlignment;
	};
}

export interface Role {
	id: string;
	name: string;
	color: number;
	hoist: number;
	number: number;
	member_limit: number;
}

export interface GuildRolesResponse {
	guild_id: string;
	roles: Role[];
	role_num_limit: string;
}

export interface CreateRoleResponse {
	role_id: string;
	role: Role;
}

export interface UpdateRoleResponse {
	guild_id: string;
	role_id: string;
	role: Role;
}
