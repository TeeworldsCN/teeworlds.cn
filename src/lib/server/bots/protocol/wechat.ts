import { env } from '$env/dynamic/private';
import { volatile } from '$lib/server/keyv';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import nodeCrypto from 'node:crypto';

const END_POINT = 'https://api.weixin.qq.com/cgi-bin/';

const parser = new XMLParser({
	isArray: (name) => name === 'item'
});

const builder = new XMLBuilder({
	cdataPropName: '_cdata'
});

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export class WeChatProtocol {
	private secret: string;
	private token: string;
	private appId: string;
	private appIdData: Uint8Array;
	private key: Uint8Array;
	private iv: Uint8Array;
	private hasher: Bun.CryptoHasher;

	constructor(token: string, appId: string, aesKey: string, secret: string) {
		this.secret = secret;
		this.token = token;
		this.appId = appId;
		this.appIdData = textEncoder.encode(appId);
		this.key = Uint8Array.fromBase64(aesKey);
		this.iv = this.key.slice(0, 16);
		this.hasher = new Bun.CryptoHasher('sha1');
	}

	encrypt(msg: string): string {
		const random = nodeCrypto.randomBytes(16);
		const msgData = textEncoder.encode(msg);

		const blockSize = 32;
		const dataLength = 20 + msgData.length + this.appIdData.length;
		const amountToPad = blockSize - (dataLength % blockSize);
		const buffer = Buffer.alloc(dataLength + amountToPad);
		buffer.set(random, 0);
		buffer.writeUInt32BE(msgData.length, 16);
		buffer.set(msgData, 20);
		buffer.set(this.appIdData, 20 + msgData.length);
		buffer.fill(amountToPad, dataLength);

		const cipher = nodeCrypto.createCipheriv('aes-256-cbc', this.key, this.iv);
		cipher.setAutoPadding(false);
		const encrypted = Buffer.concat([
			cipher.update(buffer as any as Uint8Array) as any as Uint8Array,
			cipher.final() as any as Uint8Array
		]);
		return encrypted.toString('base64');
	}

	sign(timestamp: string, nonce: string, encrypt?: string): string {
		const payload = (
			encrypt ? [this.token, timestamp, nonce, encrypt] : [this.token, timestamp, nonce]
		)
			.sort()
			.join('');
		return this.hasher.update(payload).digest('hex');
	}

	verify(signature: string, timestamp: string, nonce: string, encrypt?: string): boolean {
		return this.sign(timestamp, nonce, encrypt) === signature;
	}

	decrypt(encrypt: string): string {
		const buffer = Buffer.from(encrypt, 'base64');
		const decipher = nodeCrypto.createDecipheriv('aes-256-cbc', this.key, this.iv);
		decipher.setAutoPadding(false);
		const decrypted = Buffer.concat([
			decipher.update(buffer as any as Uint8Array) as any as Uint8Array,
			decipher.final() as any as Uint8Array
		]);

		const msgSize = decrypted.readUInt32BE(16);
		const msgBufStartPos = 16 + 4;
		const msgBufEndPos = msgBufStartPos + msgSize;

		const message = Uint8Array.prototype.slice.call(decrypted, msgBufStartPos, msgBufEndPos);

		return textDecoder.decode(message);
	}

	parse<T>(xml: string): T {
		return parser.parse(xml).xml;
	}

	build<T>(obj: T): string {
		return builder.build({ xml: obj });
	}

	async getAccessToken(): Promise<string> {
		const accessToken = await volatile.get<string>('wechat:token');
		if (accessToken) {
			return accessToken;
		}

		const url = new URL(
			`token?grant_type=client_credential&appid=${this.appId}&secret=${this.secret}`,
			END_POINT
		);

		const res = await fetch(url, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json'
			}
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
			'wechat:token',
			json.access_token,
			(parseInt(json.expires_in) - 30) * 1000
		);

		return json.access_token;
	}

	private async request<T>(
		method: 'GET' | 'POST',
		url: URL | string,
		body?: any
	): Promise<WeChatApiResult<T>> {
		const token = await this.getAccessToken();
		if (!token) {
			return { errcode: -1, errmsg: 'Failed to get access token' };
		}

		if (typeof url === 'string') {
			url = new URL(url, END_POINT);
		}

		url.searchParams.set('access_token', token);

		if (body instanceof FormData) {
			const res = await fetch(url, {
				method: method,
				headers: {
					'Content-Type': 'multipart/form-data'
				},
				body
			});

			if (res.status != 200) {
				return {
					errcode: res.status,
					errmsg: `HTTP error: ${res.statusText}`
				};
			}

			return await res.json();
		} else {
			const res = await fetch(url, {
				method: method,
				headers: {
					'Content-Type': 'application/json'
				},
				body: body ? JSON.stringify(body) : undefined
			});

			if (res.status != 200) {
				return {
					errcode: res.status,
					errmsg: `HTTP error: ${res.statusText}`
				};
			}

			return await res.json();
		}
	}

	/**
	 * Create a custom menu for the WeChat public account
	 * @param menu The menu configuration to create
	 * @returns Result of the operation
	 */
	async createMenu(menu: WeChatMenu) {
		return this.request<WeChatApiResult>('POST', `menu/create`, menu);
	}

	/**
	 * Get the current custom menu configuration
	 * @returns The current menu configuration
	 */
	async getMenu() {
		return this.request<WeChatMenuResult>('GET', 'get_current_selfmenu_info');
	}

	/**
	 * Delete the current custom menu
	 * @returns Result of the operation
	 */
	async deleteMenu() {
		return this.request<WeChatApiResult>('GET', 'menu/delete');
	}

	/**
	 * Create a new draft in the WeChat draft box
	 * @param articles Array of article objects to add to the draft
	 * @returns Result of the operation with media_id if successful
	 */
	async createDraft(articles: WeChatDraftArticle[]) {
		return this.request<WeChatDraftResult>('POST', 'draft/add', { articles });
	}

	/**
	 * Add a permanent material to the WeChat account
	 * @param type Material type: image, voice, video, or thumb
	 * @param media File data to upload
	 * @param videoInfo Optional video description (required for video type)
	 * @returns Result of the operation with media_id if successful
	 */
	async addMaterial(
		type: 'image' | 'voice' | 'thumb',
		media: File
	): Promise<WeChatApiResult<WeChatMaterialAddResult>>;
	async addMaterial(
		type: 'video',
		media: File,
		videoInfo: { title: string; introduction: string }
	): Promise<WeChatApiResult<WeChatMaterialAddResult>>;
	async addMaterial(
		type: 'image' | 'voice' | 'video' | 'thumb',
		media: File,
		videoInfo?: { title: string; introduction: string }
	) {
		const url = `material/add_material?type=${type}`;
		const formData = new FormData();
		formData.append('media', media, media.name);

		if (type === 'video' && videoInfo) {
			formData.append('description', JSON.stringify(videoInfo));
		}

		return this.request<WeChatMaterialAddResult>('POST', url, formData);
	}

	/**
	 * Upload an image for use in article content
	 * @param media Image file to upload (jpg/png only, < 1MB)
	 * @returns Result with URL if successful
	 */
	async uploadArticleImage(media: Blob | File) {
		const url = 'media/uploadimg';
		const formData = new FormData();
		formData.append('media', media);

		return this.request<WeChatUploadImageResult>('POST', url, formData);
	}

	/**
	 * Get a permanent material by its media_id
	 * @param mediaId The media_id of the material to retrieve
	 * @returns The material content or error
	 */
	async getMaterial(mediaId: string) {
		const url = `material/get_material`;
		const body = { media_id: mediaId };

		return await this.request<WeChatMaterialJsonResult>('POST', url, body);
	}

	/**
	 * Delete a permanent material by its media_id
	 * @param mediaId The media_id of the material to delete
	 * @returns Result of the operation
	 */
	async deleteMaterial(mediaId: string) {
		return this.request<WeChatApiResult>('POST', 'material/del_material', { media_id: mediaId });
	}

	/**
	 * Get the count of all materials by type
	 * @returns Counts of different material types
	 */
	async getMaterialCount() {
		return this.request<WeChatMaterialCount>('GET', 'material/get_materialcount');
	}

	/**
	 * Get a list of materials by type
	 * @param type Material type: image, voice, video, or news
	 * @param offset Starting position (0-based)
	 * @param count Number of items to return (1-20)
	 * @returns List of materials
	 */
	async getMaterialList(
		type: 'image' | 'voice' | 'video',
		offset: number,
		count: number
	): Promise<WeChatApiResult<WeChatMaterialList<WeChatMaterialItem>>>;
	async getMaterialList(
		type: 'news',
		offset: number,
		count: number
	): Promise<WeChatApiResult<WeChatMaterialList<WeChatMaterialNewsItem>>>;
	async getMaterialList(type: string, offset: number = 0, count: number = 20) {
		const body = {
			type,
			offset,
			count: Math.min(Math.max(count, 1), 20) // Ensure count is between 1 and 20
		};

		if (type === 'news') {
			return await this.request<WeChatMaterialList<WeChatMaterialNewsItem>>(
				'POST',
				'material/batchget_material',
				body
			);
		} else {
			return await this.request<WeChatMaterialList<WeChatMaterialItem>>(
				'POST',
				'material/batchget_material',
				body
			);
		}
	}

	async passthrough(url: string) {
		const token = await this.getAccessToken();
		if (!token) {
			return new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } });
		}

		const withToken = new URL(url);
		withToken.searchParams.set('access_token', token);
		return await fetch(withToken);
	}
}

// Create Bot
export let WeChat: WeChatProtocol | null = null;
if (!env.WECHAT_TOKEN || !env.WECHAT_APPID || !env.WECHAT_AES_KEY || !env.WECHAT_SECRET) {
	WeChat = null;
} else {
	WeChat = new WeChatProtocol(
		env.WECHAT_TOKEN,
		env.WECHAT_APPID,
		env.WECHAT_AES_KEY,
		env.WECHAT_SECRET
	);
	console.log(`WeChat Protocol is activated`);
}

export type CData<T extends string = string> = {
	_cdata: T;
};

export type WeChatEncryptedMessage = {
	Encrypt: string;
	ToUserName: string;
};

type MaybeCData<T, K extends string = string> = T extends CData ? CData<K> : K;
type WeChatMessage<T extends CData | string> =
	| WeChatTextMessage<T>
	| WeChatImageMessage<T>
	| WeChatArticleMessage<T>
	| WeChatEventMessage<T>;

export type WeChatIncomingMessage = WeChatReceived<WeChatMessage<string>>;
export type WeChatOutgoingMessage = WeChatMessage<CData>;

export type WeChatTextMessage<T extends CData | string> = {
	ToUserName: T;
	FromUserName: T;
	CreateTime: number;
	MsgType: MaybeCData<T, 'text'>;
	Content: T;
};

export type WeChatImageMessage<T extends CData | string> = {
	ToUserName: T;
	FromUserName: T;
	CreateTime: number;
	MsgType: MaybeCData<T, 'image'>;
	Image: {
		MediaId: T;
	};
};

export type WeChatArticleMessage<T extends CData | string> = {
	ToUserName: T;
	FromUserName: T;
	CreateTime: number;
	MsgType: MaybeCData<T, 'news'>;
	ArticleCount: number;
	Articles: {
		item: {
			Title: T;
			Description: T;
			PicUrl: T;
			Url: T;
		}[];
	};
};

export type WeChatEventMessage<T extends CData | string> = {
	ToUserName: T;
	FromUserName: T;
	CreateTime: number;
	MsgType: MaybeCData<T, 'event'>;
	Event: T;
};

export type WeChatReceived<T> = {
	MsgId: string;
	CreateTime: number;
} & T;

// WeChat Menu Types
export type WeChatMenuButtonBase = {
	name: string;
};

export type WeChatMenuButtonWithValue = WeChatMenuButtonBase & {
	type: 'text' | 'img' | 'voice' | 'video';
	value: string;
};

export type WeChatMenuButtonWithKey = WeChatMenuButtonBase & {
	type:
		| 'click'
		| 'scancode_push'
		| 'scancode_waitmsg'
		| 'pic_sysphoto'
		| 'pic_photo_or_album'
		| 'pic_weixin'
		| 'location_select';
	key: string;
};

export type WeChatMenuButtonWithUrl = WeChatMenuButtonBase & {
	type: 'view';
	url: string;
};

export type WeChatMenuButtonMiniprogram = WeChatMenuButtonBase & {
	type: 'miniprogram';
	url: string;
	appid: string;
	pagepath: string;
};

export type WeChatMenuButtonMedia = WeChatMenuButtonBase & {
	type: 'media_id' | 'view_limited';
	media_id: string;
};

export type WeChatMenuButtonArticle = WeChatMenuButtonBase & {
	type: 'article_id' | 'article_view_limited';
	article_id: string;
};

export type WeChatMenuButtonNews = WeChatMenuButtonBase & {
	type: 'news';
	value: string;
	news_info: {
		list: {
			title: string;
			digest: string;
			show_cover: number;
			cover_url: string;
			content_url: string;
			source_url: string;
		}[];
	};
};

export type WeChatMenuButton =
	| WeChatMenuButtonWithKey
	| WeChatMenuButtonWithValue
	| WeChatMenuButtonWithUrl
	| WeChatMenuButtonMiniprogram
	| WeChatMenuButtonMedia
	| WeChatMenuButtonArticle
	| WeChatMenuButtonNews
	| (WeChatMenuButtonBase & {
			sub_button: WeChatMenuButton[];
	  });

export type WeChatMenu = {
	button: WeChatMenuButton[];
};

// Draft Types
export type WeChatDraftArticleBase = {
	title: string;
	content: string;
	need_open_comment?: number;
	only_fans_can_comment?: number;
};

export type WeChatDraftNewsArticle = WeChatDraftArticleBase & {
	article_type?: 'news';
	author?: string;
	digest?: string;
	content_source_url?: string;
	thumb_media_id: string;
	pic_crop_235_1?: string;
	pic_crop_1_1?: string;
};

export type WeChatDraftImageInfo = {
	image_list: {
		image_media_id: string;
	}[];
};

export type WeChatDraftCoverInfo = {
	crop_percent_list?: {
		ratio: '1_1' | '16_9' | '2.35_1';
		x1: string;
		y1: string;
		x2: string;
		y2: string;
	}[];
};

export type WeChatDraftProductInfo = {
	footer_product_info?: {
		product_key: string;
	};
};

export type WeChatDraftNewsPicArticle = WeChatDraftArticleBase & {
	article_type: 'newspic';
	image_info: WeChatDraftImageInfo;
	cover_info?: WeChatDraftCoverInfo;
	product_info?: WeChatDraftProductInfo;
};

export type WeChatDraftArticle = WeChatDraftNewsArticle | WeChatDraftNewsPicArticle;

// Material Types
export type WeChatMaterialType = 'image' | 'voice' | 'video' | 'thumb' | 'news';

export type WeChatMaterialCount = {
	voice_count: number;
	video_count: number;
	image_count: number;
	news_count: number;
};

export type WeChatNewsItem = {
	title: string;
	thumb_media_id: string;
	show_cover_pic: 0 | 1;
	author: string;
	digest: string;
	content: string;
	url: string;
	content_source_url: string;
};

export type WeChatNewsMaterial = {
	news_item: WeChatNewsItem[];
};

export type WeChatVideoMaterial = {
	title: string;
	description: string;
	down_url: string;
};

export type WeChatMaterialNewsItem = {
	media_id: string;
	update_time: number;
	content: WeChatNewsMaterial;
};

export type WeChatMaterialItem = {
	media_id: string;
	name: string;
	update_time: number;
	url: string;
};

export type WeChatMaterialList<T> = {
	total_count: number;
	item_count: number;
	item: T[];
};

// API Result Types
export type WeChatApiResult<T = {}> =
	| {
			errcode: number;
			errmsg?: string;
	  }
	| ({
			errcode: undefined;
	  } & T);

export type WeChatMaterialAddResult = {
	media_id: string;
	url?: string;
};

export type WeChatUploadImageResult = {
	url: string;
};

export type WeChatMenuResult = {
	is_menu_open: number;
	selfmenu_info: {
		button: WeChatMenuButton[];
	};
};

export type WeChatDraftResult = {
	media_id: string;
};

export type WeChatMaterialJsonResult = WeChatNewsMaterial | WeChatVideoMaterial;
