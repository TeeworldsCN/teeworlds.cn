import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { volatile } from '$lib/server/keyv';

// 官方图块图标:反代 ddnet.org/tiles/<name>.png,并按文件名缓存在 keyv 里。
// 本地不再保留 static/assets/tiles,上游新增 tile 会自动跟上。
const UPSTREAM = 'https://ddnet.org/tiles/';
const ALLOWED = /^[A-Za-z0-9_]+\.png$/;
const TTL = 30 * 24 * 60 * 60 * 1000;

const imageResponse = (bytes: Uint8Array, hit: boolean) =>
	new Response(bytes as Uint8Array<ArrayBuffer>, {
		headers: {
			'content-type': 'image/png',
			'cache-control': 'public, max-age=31536000, immutable',
			'x-twcn-cache': hit ? 'hit' : 'miss'
		}
	});

export const GET: RequestHandler = async ({ params, fetch }) => {
	const file = params.file ?? '';
	if (!ALLOWED.test(file)) return error(404);

	const key = `ddnet-tile:${file}`;
	const cached = await volatile.get<string>(key).catch(() => undefined);
	if (cached) return imageResponse(new Uint8Array(Buffer.from(cached, 'base64')), true);

	let response: Response;
	try {
		response = await fetch(UPSTREAM + file, { signal: AbortSignal.timeout(10000) });
	} catch {
		return error(504, 'Upstream timeout');
	}
	if (!response.ok || !response.body) {
		return error(response.status === 404 ? 404 : 502, 'Upstream error');
	}

	const bytes = new Uint8Array(await response.arrayBuffer());
	void volatile.set(key, Buffer.from(bytes).toString('base64'), TTL).catch(() => {});
	return imageResponse(bytes, false);
};
