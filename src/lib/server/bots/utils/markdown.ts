/**
 * 有语法含义的 markdown 字符，需要反斜杠转义才能原样显示。
 *
 * 腾讯没有公开任何 markdown 转义规范（官方文档只列「支持格式」，全站唯一讲转义的是
 * 「内嵌格式」页里 content 的 `& < >` 实体转义，与 markdown 无关），而 markdown 是
 * 客户端渲染的：桌面 QQNT 支持完整 CommonMark（含 HTML 标签），安卓/iOS 只支持子集。
 * 这里统一按 CommonMark 的反斜杠转义处理，至少在标准渲染器上是对的。
 *
 * 集合取「能开启语法」的标点：强调/删除线（* _ ~）、代码（`）、链接与图片（[ ] ( ) !）、
 * 标题与列表（# + - .）、引用（>）、表格（|）、autolink/HTML 与实体（< > &）、以及转义符本身。
 */
const ESCAPABLE = /([\\`*_{}[\]()#+\-.!|~<>&])/g;

/** Escape user-provided text before embedding it in QQ markdown. */
export const escapeMarkdown = (text: string) => text.replace(ESCAPABLE, '\\$1');

/**
 * Keep link labels but drop the URLs, used when links are disabled for a group.
 * Avoids touching escaped `\[...\]\(...\)` produced by escapeMarkdown.
 */
export const stripMarkdownLinks = (markdown: string) =>
	markdown
		.replace(/^(?<!\\)\[([^\]]+)\]\([^)]*\)\s*$/gm, '')
		.replace(/(?<![!\\])\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/\n{3,}/g, '\n\n')
		.trim();

/** Render markdown as readable plain text for platforms without markdown support. */
export const markdownToText = (markdown: string) => {
	// Protect URLs and backslash-escaped literals first: stripping emphasis markers
	// must not touch query strings, nor eat the `\[` / `\(` of an escaped name.
	const urls: string[] = [];
	const literals: string[] = [];
	const protectedText = markdown
		.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
		.replace(/<(https?:\/\/[^>]+)>/g, '$1')
		.replace(/https?:\/\/[^\s)）]+/g, (url) => {
			urls.push(url);
			return `\u0000URL${urls.length - 1}\u0000`;
		})
		.replace(/\\([\\`*_{}[\]()#+\-.!|~<>&])/g, (_, char: string) => {
			literals.push(char);
			return `\u0000ESC${literals.length - 1}\u0000`;
		});

	const text = protectedText
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1: $2')
		.replace(/^#{1,6}\s+/gm, '')
		.replace(/^>\s?/gm, '')
		.replace(/^\s*\*\*\*\s*$/gm, '')
		.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '$1')
		.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '$1')
		.replace(/(?<![\w\\])__(?=\S)([\s\S]*?\S)__(?![\w])/g, '$1')
		.replace(/(?<![\w\\])_(?=\S)([\s\S]*?\S)_(?![\w])/g, '$1')
		.replace(/\*(?=\S)([\s\S]*?\S)\*/g, '$1')
		.replace(/`([^`]+)`/g, '$1')
		.replace(/\n{3,}/g, '\n\n')
		.trim();

	return text
		.replace(/\u0000ESC(\d+)\u0000/g, (_, index) => literals[Number(index)] ?? '')
		.replace(/\u0000URL(\d+)\u0000/g, (_, index) => urls[Number(index)] ?? '');
};
