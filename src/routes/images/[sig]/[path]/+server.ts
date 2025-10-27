import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { createHmac } from 'crypto';

/**
 * Verify HMAC signature for the proxy request
 * @param url - The URL to proxy
 * @param type - The type of image (icon or image)
 * @param signature - The signature to verify
 * @returns true if signature is valid, false otherwise
 */
const verifySignature = (url: string, signature: string): boolean => {
	const secret = env.IMGPROXY_SECRET || 'default-secret';
	const expectedSignature = createHmac('sha256', secret).update(url).digest('base64url');
	return signature === expectedSignature;
};

export const GET: RequestHandler = async ({ params }) => {
	const { sig, path } = params;

	if (!sig || !path) {
		return error(400, 'Missing parameters');
	}

	// Extract file extension from the path parameter
	const extensionIndex = path.lastIndexOf('.');
	if (extensionIndex === -1) {
		return error(400, 'Invalid path: missing file extension');
	}
	const extension = path.slice(extensionIndex);
	const pathWithoutExt = path.slice(0, extensionIndex);

	// Decode the base64url encoded path without extension
	let decodedPath: string;
	try {
		decodedPath = Buffer.from(pathWithoutExt, 'base64url').toString('utf-8');
	} catch {
		return error(400, 'Invalid base64url encoding');
	}

	// Reconstruct the target URL with extension
	let targetUrl = `${decodedPath}${extension}`;
	if (targetUrl.startsWith('/')) {
		targetUrl = `https://ddnet.org${targetUrl}`;
	}

	// Verify the signature using path without extension
	if (!verifySignature(decodedPath, sig)) {
		return error(403, 'Invalid signature');
	}

	try {
		// Validate that the URL is a valid URL
		new URL(targetUrl);
	} catch {
		return error(400, 'Invalid url parameter');
	}

	try {
		// Fetch the image from the target URL
		const response = await fetch(targetUrl);

		if (!response.ok) {
			return error(response.status, `Failed to fetch image: ${response.statusText}`);
		}

		const contentType = response.headers.get('content-type') || 'image/png';

		// Extract filename from target URL for Content-Disposition header
		const filename = targetUrl.split('/').pop() || 'image';

		// Return the image with cache headers set to cache forever
		// Using max-age of 1 year (31536000 seconds) and immutable flag
		return new Response(response.body, {
			headers: {
				'content-type': contentType,
				'content-disposition': `inline; filename="${filename}"`,
				'cache-control': 'public, max-age=31536000, immutable'
			}
		});
	} catch (err) {
		console.error('Image proxy error:', err);
		return error(500, 'Failed to proxy image');
	}
};
