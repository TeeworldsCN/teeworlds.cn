/**
 * Built-in image proxy that fetches and caches images
 * Replaces external imgproxy service with internal API endpoint
 */

import { env } from '$env/dynamic/private';
import { createHmac } from 'crypto';

/**
 * Generate HMAC signature for the proxy URL
 * @param url - The URL to proxy
 * @param type - The type of image (icon or image)
 * @returns HMAC signature as hex string
 */
const generateSignature = (url: string): string => {
	const secret = env.IMGPROXY_SECRET || 'default-secret';
	const message = `${url}`;
	return createHmac('sha256', secret).update(message).digest('base64url');
};

export const convert = async (url: string) => {
	// Process the path: remove https://ddnet.org if present
	let path = url;
	if (path.startsWith('https://ddnet.org')) {
		path = path.slice('https://ddnet.org'.length);
	}

	// URL-base64 encode the path
	const encodedPath = Buffer.from(path, 'utf-8').toString('base64url');

	// Generate and URL-base64 encode signature
	const signature = generateSignature(path);

	return `/images/${signature}/${encodedPath}`;
};
