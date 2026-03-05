import { error } from '@sveltejs/kit';
import { convert } from '$lib/server/imgproxy';
import { encodeBase64Url } from '$lib/base64url';

export const load = async ({ params, url }) => {
	let path = params.path;
	if (!path) {
		path = 'Main_Page';
	}

	try {
		const res = await fetch(`https://wiki.ddnet.org/w/api.php?action=parse&page=${encodeURIComponent(path)}&format=json`);
		if (!res.ok) {
			error(res.status, 'Failed to fetch wiki page');
		}

		const data = await res.json();
		if (data.error) {
			if (data.error.code === 'missingtitle') {
				error(404, 'Page not found');
			}
			error(500, data.error.info || 'Wiki API error');
		}

		let html = data.parse.text['*'];

		// We use HTMLRewriter to rewrite URLs in HTML
		class LinkRewriter implements HTMLRewriterTypes.HTMLRewriterElementContentHandlers {
			element(element: HTMLRewriterTypes.Element) {
				const href = element.getAttribute('href');
				if (!href) return;

				if (href.startsWith('/wiki/')) {
					element.setAttribute('href', `/ddnet/wiki/${href.substring('/wiki/'.length)}`);
				} else if (href.startsWith('http://') || href.startsWith('https://')) {
					if (!href.startsWith('https://teeworlds.cn') && !href.startsWith('https://ddnet.org') && !href.startsWith('https://wiki.ddnet.org')) {
						element.setAttribute('href', `/link?ref=${encodeBase64Url(href)}`);
					}
				} else if (href.startsWith('/w/index.php?')) {
					element.setAttribute('class', (element.getAttribute('class') || '') + ' pointer-events-none opacity-50');
					element.setAttribute('title', 'Not available on mirror');
					element.removeAttribute('href');
				}
			}
		}

		class MediaRewriter implements HTMLRewriterTypes.HTMLRewriterElementContentHandlers {
			async element(element: HTMLRewriterTypes.Element) {
				const src = element.getAttribute('src');
				if (src) {
					const fullSrc = src.startsWith('//') ? `https:${src}` : (src.startsWith('/') ? `https://wiki.ddnet.org${src}` : src);
					element.setAttribute('src', await convert(fullSrc));
				}
				
				const srcset = element.getAttribute('srcset');
				if (srcset) {
					const srcsetParts = srcset.split(',').map(s => s.trim());
					const newSrcsetParts = await Promise.all(srcsetParts.map(async part => {
						const [url, descriptor] = part.split(' ');
						if (!url) return part;
						const fullUrl = url.startsWith('//') ? `https:${url}` : (url.startsWith('/') ? `https://wiki.ddnet.org${url}` : url);
						const proxyUrl = await convert(fullUrl);
						return `${proxyUrl} ${descriptor || ''}`.trim();
					}));
					element.setAttribute('srcset', newSrcsetParts.join(', '));
				}
			}
		}

		const rewriter = new HTMLRewriter()
			.on('a', new LinkRewriter())
			.on('img', new MediaRewriter())
			.on('video', new MediaRewriter())
			.on('source', new MediaRewriter());
			
		// Transform the HTML string using HTMLRewriter
		const transformedResponse = rewriter.transform(new Response(html));
		const finalHtml = await transformedResponse.text();

		return {
			title: data.parse.title,
			content: finalHtml,
			originalPath: path
		};
	} catch (e: any) {
		if (e.status === 404) throw e;
		console.error('Wiki load error:', e);
		error(e.status || 500, e.message || 'Internal server error');
	}
};
