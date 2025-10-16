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
const generateSignature = (url: string, type: string): string => {
	const secret = env.IMGPROXY_SECRET || 'default-secret';
	const message = `${url}:${type}`;
	return createHmac('sha256', secret).update(message).digest('hex');
};

export const convert = async (url: string, type: 'icon' | 'image' = 'image') => {
	// Encode the URL as a query parameter
	const params = new URLSearchParams();
	params.set('url', url);
	if (type === 'icon') {
		params.set('type', 'icon');
	}

	// Generate and add signature
	const signature = generateSignature(url, type);
	params.set('sig', signature);

	// Return the internal API endpoint path as a string
	// This will be resolved to the correct origin by the browser/server
	return `/api/proxy-image?${params.toString()}`;
};
