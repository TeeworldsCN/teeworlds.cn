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

	async getAccessToken() {
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
	| WeChatArticleMessage<T>;

export type WeChatIncomingMessage = WeChatReceived<WeChatMessage<string>>;
export type WeChatOutgoingMessage = WeChatMessage<CData>;

export type WeChatTextMessage<T extends CData | string> = {
	ToUserName: T;
	FromUserName: T;
	CreateTime: number;
	MsgType: MaybeCData<T, 'text'>;
	Content: T;
};

export type WeChatImageMessage<T> = {
	ToUserName: CData;
	FromUserName: CData;
	CreateTime: number;
	MsgType: MaybeCData<T, 'image'>;
	Image: {
		MediaId: CData;
	};
};

export type WeChatArticleMessage<T> = {
	ToUserName: CData;
	FromUserName: CData;
	CreateTime: number;
	MsgType: MaybeCData<T, 'news'>;
	ArticleCount: number;
	Articles: {
		item: {
			Title: CData;
			Description: CData;
			PicUrl: CData;
			Url: CData;
		}[];
	};
};

export type WeChatReceived<T> = {
	MsgId: string;
	CreateTime: number;
} & T;
