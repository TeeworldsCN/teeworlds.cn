import { describe, expect, test } from 'bun:test';
import MarkdownIt from 'markdown-it';
import { mapMarkdown, pointsMarkdown, statsMarkdown } from './markdown';
import { encodeAsciiURIComponent } from '$lib/link';

const md = new MarkdownIt();

/** markdown-it 渲染后的纯文本；QQ 的字符实体也是在这一层解回原字符的。 */
const renderedText = (markdown: string) =>
	md
		.render(markdown)
		.replace(/<[^>]+>/g, '')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
		.trim();

describe('pointsMarkdown', () => {
	test('名字里的括号不会再截断「查看玩家详情」的链接', () => {
		const name = 'foo) *bar* (baz) [x](y)';
		const url = `https://teeworlds.cn/goto#p${encodeAsciiURIComponent(name)}`;
		const html = md.render(pointsMarkdown(name, [{ label: '🌎 里程', points: 1, rank: 2 }], url));

		// 地址完整、名字没漏到链接外面、也没被当成强调/链接
		expect(html).toContain(`href="${url}"`);
		expect(html.trim().endsWith('</a></p>')).toBe(true);
		expect(html).not.toContain('<em>');
		expect(renderedText(pointsMarkdown(name, [], url))).toContain(name);
	});
});

describe('mapMarkdown', () => {
	test('地图类型来自 ddstats，照样按纯文本转义', () => {
		const type = 'brutal) *not italic* <b>not bold</b>';
		const card = mapMarkdown({
			name: 'Midsummer Night',
			mapper: 'm[1](2)',
			type,
			difficulty: 2,
			points: 3
		});
		const html = md.render(card);

		expect(html).not.toContain('<em>');
		expect(html).not.toContain('<b>');
		const text = renderedText(card);
		expect(text).toContain(type);
		expect(text).toContain('m[1](2)');
	});

	test('链接文字按纯文本转义，地址原样保留', () => {
		const card = mapMarkdown(
			{ name: 'Map', type: 'solo', difficulty: 1, points: 1 },
			{ links: [{ label: '详情 *now*', url: 'https://teeworlds.cn/goto#m' }] }
		);
		const html = md.render(card);

		expect(html).not.toContain('<em>');
		expect(html).toContain('href="https://teeworlds.cn/goto#m"');
		expect(renderedText(card)).toContain('详情 *now*');
	});
});

describe('statsMarkdown', () => {
	test('服务器名来自线上服务器，照样转义', () => {
		const card = statsMarkdown(
			[
				{
					name: 'CHN) *x* [y](z)',
					online: true,
					load: 1,
					upload: '1 MB/s',
					download: '2 MB/s',
					packet: '3k pps'
				}
			],
			{ total: 0, up: 0, attacked: [] }
		);
		const html = md.render(card);

		expect(html).not.toContain('<em>');
		expect(renderedText(card)).toContain('CHN) *x* [y](z)');
	});
});
