import { env } from '$env/dynamic/private';

const hmacKey = env.IMGPROXY_KEY
	? await crypto.subtle.importKey(
			'raw',
			Buffer.from(env.IMGPROXY_KEY, 'hex'),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		)
	: undefined;

const saltStr = env.IMGPROXY_SALT ? Buffer.from(env.IMGPROXY_SALT, 'hex').toString('ascii') : undefined;

export const convert = async (url: string, type: 'icon' | 'image' = 'image') => {
	if (!Ienv.MGPROXY_URL || !env.IMGPROXY_KEY || !env.IMGPROXY_SALT || !hmacKey || !saltStr) {
		return new URL(url);
	}

	let encoded = Buffer.from(url).toString('base64url') + '.png';

	if (type === 'icon') {
		encoded = `rs:fill:128:128/${encoded}`;
	}

	const salted = Buffer.from(saltStr + '/' + encoded);
	const signature = Buffer.from(await crypto.subtle.sign('HMAC', hmacKey, salted)).toString(
		'base64url'
	);
	return new URL(`${signature}/${encoded}`, IMGPROXY_URL);
};
