import { IMGPROXY_KEY, IMGPROXY_SALT, IMGPROXY_URL } from '$env/static/private';

const hmacKey = IMGPROXY_KEY
	? await crypto.subtle.importKey(
			'raw',
			Buffer.from(IMGPROXY_KEY, 'hex'),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		)
	: undefined;

const saltStr = IMGPROXY_SALT ? Buffer.from(IMGPROXY_SALT, 'hex').toString('ascii') : undefined;

export const convert = async (url: string, type: 'icon' | 'image' = 'image') => {
	if (!IMGPROXY_URL || !IMGPROXY_KEY || !IMGPROXY_SALT || !hmacKey || !saltStr) {
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
