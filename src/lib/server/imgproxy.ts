/**
 * Built-in image proxy that fetches and caches images
 * Replaces external imgproxy service with internal API endpoint
 */

import { env } from '$env/dynamic/private';
import { createHmac } from 'crypto';
import { extname } from 'path';

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

	// Extract file extension
	const extension = extname(path);

	// Remove extension from path for encoding
	const pathWithoutExt = path.slice(0, -extension.length);

	// URL-base64 encode the path without extension
	const encodedPath = Buffer.from(pathWithoutExt, 'utf-8').toString('base64url');

	// Generate and URL-base64 encode signature
	const signature = generateSignature(pathWithoutExt);

	return `https://teeworlds.cn/api/img/${signature}/${encodedPath}${extension}`;
};
