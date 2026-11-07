import { error, isHttpError } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ranks, rankPage } from '$lib/server/fetches/ranks';

export const load = (async ({ parent, url, setHeaders }) => {
	const region = url.searchParams.get('server');
	const type = url.searchParams.get('type');
	const pageParam = url.searchParams.get('page');

	if (region && region.toLowerCase() != region) {
		return error(404);
	}
	if (type && type.toLowerCase() != type) {
		return error(404);
	}
	if (pageParam && (!/^[0-9]+$/.test(pageParam) || parseInt(pageParam) < 1)) {
		return error(404);
	}
	const requestedPage = pageParam ? parseInt(pageParam) : 1;

	try {
		// 地区 / 地图类型 / 两者组合都走官方的 /ranks/<region>/<type>/ 页面
		if (region || type) {
			// 排行榜永远取第 1 页;地图卡片可以按官方的分页翻页
			const firstFetch = await rankPage({ region, type });
			if (!firstFetch) return error(404);

			const first = await firstFetch.fetchCache();
			const pageCount = Math.max(1, first.result.page_count);
			const mapPage = Math.min(requestedPage, pageCount);

			let mapResult = first;
			if (mapPage != 1) {
				const pageFetch = await rankPage({ region, type, page: mapPage });
				if (pageFetch) mapResult = await pageFetch.fetchCache();
			}

			setHeaders({
				'last-modified': new Date(first.timestamp).toUTCString()
			});
			return {
				...first.result,
				// 地图卡片用当前翻到的那一页(名次/统计都是这一页 HTML 里的)
				maps: mapResult.result.maps,
				map_page: mapPage,
				region: region ? region.toUpperCase() : 'GLOBAL',
				type: type ? type.toUpperCase() : null,
				...(await parent())
			};
		}

		// otherwise just fetch global ranks
		const result = await ranks.fetchCache();
		setHeaders({
			'last-modified': new Date(result.timestamp).toUTCString()
		});
		return { ...result.result, region: 'GLOBAL', type: null, ...(await parent()) };
	} catch (e) {
		// 404 是上面主动抛的,别被这里吞成 500
		if (isHttpError(e)) throw e;
		return error(500);
	}
}) satisfies PageServerLoad;
