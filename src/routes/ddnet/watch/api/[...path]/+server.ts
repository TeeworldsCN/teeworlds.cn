import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// ddnet.org 的 watch 数据(runs/*.jsonl、demos/*.demo.gz、watchable.jsonl)没有 CORS,
// 这里同源代理一层:浏览器不用跨域,国内也比直连 ddnet.org 稳。
// 只放行 watch 目录下的这几类文件,别让它变成任意转发。
const UPSTREAM = 'https://ddnet.org/watch/';
const ALLOWED = /^(runs\/[0-9a-f-]{36}\.jsonl|demos\/[A-Za-z0-9._-]+|watchable\.jsonl)$/;

export const GET: RequestHandler = async ({ params, request, fetch }) => {
	const path = params.path ?? '';
	if (!ALLOWED.test(path)) return error(404);

	const headers = new Headers();
	for (const name of ['if-none-match', 'if-modified-since']) {
		const value = request.headers.get(name);
		if (value) headers.set(name, value);
	}

	let response: Response;
	try {
		response = await fetch(UPSTREAM + path, {
			headers,
			signal: AbortSignal.timeout(30000)
		});
	} catch {
		return error(504, 'Upstream timeout');
	}

	if (response.status === 304) {
		const cached = new Headers();
		for (const name of ['etag', 'last-modified']) {
			const value = response.headers.get(name);
			if (value) cached.set(name, value);
		}
		return new Response(null, { status: 304, headers: cached });
	}
	if (!response.ok || !response.body) {
		return error(response.status === 404 ? 404 : 502, 'Upstream error');
	}

	const result = new Headers({
		'content-type': response.headers.get('content-type') ?? 'application/octet-stream',
		// demo 文件带 rev 版本号,命中就是不可变的
		'cache-control': path.startsWith('demos/') ? 'public, max-age=86400' : 'public, max-age=300'
	});
	for (const name of ['etag', 'last-modified']) {
		const value = response.headers.get(name);
		if (value) result.set(name, value);
	}
	return new Response(response.body, { status: 200, headers: result });
};
