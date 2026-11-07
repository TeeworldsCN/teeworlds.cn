import { describe, expect, test } from 'bun:test';
import MarkdownIt from 'markdown-it';
import { escapeMarkdown, markdownToText, stripMarkdownLinks } from './markdown';

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

/**
 * QQ 客户端（CherryMarkdown + KaTeX）在 markdown 解析之前就用这四条正则抠公式。
 * 用户文本里只要出现能命中它们的片段，就会变成截图里那种居中的斜体公式。
 */
const QQ_MATH = [
	/\$\$[\s\S]*?\$\$/,
	/\\\[[\s\S]*?\\\]/,
	/\\\([\s\S]*?\\\)/,
	/(?<!\$)\$[^$\n]+?\$(?!\$)/
];

describe('escapeMarkdown', () => {
	test('不再依赖反斜杠，ASCII 标点全部转成字符实体', () => {
		const escaped = escapeMarkdown('[D] TsFreddie');
		expect(escaped).toBe('&#91;D&#93; TsFreddie');
		expect(escaped).not.toContain('\\');
	});

	test('不会留下 QQ 的公式定界符', () => {
		const names = ['[D] TsFreddie', 'a(b)c', '$x$', '$$y$$', '\\[z\\]', '\\\\(w\\\\)', '\\$x\\$'];
		for (const name of names) {
			const escaped = escapeMarkdown(name);
			for (const pattern of QQ_MATH) expect(escaped).not.toMatch(pattern);
		}
	});

	test('特殊字符仍然原样显示', () => {
		const name = 'a*b_c`d[e]f(g)h#i+j-k.l!m|n~o<p>q&r $x$ www.teeworlds.cn';
		expect(renderedText('# 🏆 ' + escapeMarkdown(name))).toBe('🏆 ' + name);
	});

	test('名字不会被当成链接、强调或标题', () => {
		const name = '[x](https://evil.example) *y* _z_ # h - i';
		expect(renderedText('# 🏆 ' + escapeMarkdown(name))).toBe('🏆 ' + name);
	});
});

describe('markdownToText', () => {
	test('把实体解回原字符', () => {
		expect(markdownToText('# 🏆 ' + escapeMarkdown('[D] TsFreddie'))).toBe('🏆 [D] TsFreddie');
	});

	test('名字里的字面实体不会被二次解码', () => {
		expect(markdownToText(escapeMarkdown('&#91; &amp;'))).toBe('&#91; &amp;');
	});

	test('越界的实体原样保留，不会把回复打挂', () => {
		expect(markdownToText('&#999999999;')).toBe('&#999999999;');
	});
});

describe('stripMarkdownLinks', () => {
	test('去掉真正的链接，但不动名字文本', () => {
		const name = '[D] [x](https://evil.example)';
		const card =
			'# 🏆 ' + escapeMarkdown(name) + '\n\n[🔗 查看玩家详情](https://teeworlds.cn/goto)';
		const stripped = stripMarkdownLinks(card);
		expect(stripped).toContain(escapeMarkdown(name));
		expect(stripped).not.toContain('🔗 查看玩家详情');
	});
});
