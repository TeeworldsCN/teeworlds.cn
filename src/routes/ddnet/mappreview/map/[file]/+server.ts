import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// ddnet.org/mappreview 里存着所有服(含国服独有图)的 .map 原文件。
// 这里做同源代理:响应体直接流过去不落内存,浏览器不用跨域,国内也比直连 ddnet.org 稳,
// 长缓存交给浏览器/CDN,服务器只在缓存过期后转发一次条件请求。
const UPSTREAM = 'https://ddnet.org/mappreview/';

export const GET: RequestHandler = async ({ params, request, fetch }) => {
	const file = params.file;

	if (!file.endsWith('.map') || file.length <= '.map'.length || file.includes('/')) {
		return error(404);
	}

	const headers = new Headers();
	const ifNoneMatch = request.headers.get('if-none-match');
	if (ifNoneMatch) headers.set('if-none-match', ifNoneMatch);

	let response: Response;
	try {
		response = await fetch(UPSTREAM + encodeURIComponent(file), {
			headers,
			signal: AbortSignal.timeout(20000)
		});
	} catch {
		return error(504, 'Map download timed out');
	}

	// 上游没变就让浏览器继续用缓存
	if (response.status === 304) {
		const cached = new Headers();
		const etag = response.headers.get('etag');
		if (etag) cached.set('etag', etag);
		return new Response(null, { status: 304, headers: cached });
	}

	if (!response.ok || !response.body) {
		return error(response.status === 404 ? 404 : 502, 'Map not found');
	}

	const result = new Headers({
		'content-type': 'application/octet-stream',
		// 地图文件几乎不变(偶尔被作者修图),一天 + CDN 兜住
		'cache-control': 'public, max-age=86400'
	});
	const etag = response.headers.get('etag');
	if (etag) result.set('etag', etag);

	return new Response(response.body, { status: 200, headers: result });
};
