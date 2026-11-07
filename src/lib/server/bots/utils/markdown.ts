/**
 * 用户文本里所有 ASCII 标点，一律写成数字字符实体，让它不可能被解析成标记。
 *
 * 起因：名字 `[D] TsFreddie` 会被渲染成一段居中的斜体 `D`。抓来 QQNT 的
 * `major.node` 才看清链路 —— QQ 客户端用 CherryMarkdown + KaTeX 渲染 markdown，
 * 而公式是在 *inline 语法解析阶段之前* 从原文里用正则抠出来的：
 *
 *   \$\$([\s\S]*?)\$\$        \\\[([\s\S]*?)\\\]
 *   \\\(([\s\S]*?)\\)        (?<!\$)\$([^$\n]+?)\$(?!\$)
 *
 * 也就是说 `\[` / `\(` 这些反斜杠转义会先被公式规则吃掉，`\[D\]` 不是转义，
 * 而是「独立公式 D」—— 截图里那行斜体 D 就是 KaTeX 的输出。安卓/iOS 的反斜杠
 * 转义更是只有一部分生效，所以反斜杠方案在这几个字符上根本救不回来。
 *
 * 实体则是在语法解析 *全部结束之后* 才由渲染器（CherryMarkdown / CommonMark）
 * 解回原字符，公式、链接、强调、表格、HTML 规则都看不到它，显示和复制出来还是
 * 原字符。QQNT 自带的 CherryMarkdown 实测：`&#91;D&#93; TsFreddie` 出的是纯文本
 * `[D] TsFreddie`，`&#36;x&#36;` 也不会变成公式。
 *
 * 顺带绕开了「手机上反斜杠转义不生效」和「名字 `www.x.com` 被自动识别成链接」。
 */
// !"#$%&'()*+,-./  :;<=>?@  [\]^_`  {|}~
const ASCII_PUNCTUATION = /[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/g;

/** Escape user-provided text before embedding it in QQ markdown. */
export const escapeMarkdown = (text: string) =>
	text.replace(ASCII_PUNCTUATION, (char) => `&#${char.charCodeAt(0)};`);

/** Undo the numeric character references written by escapeMarkdown. */
const decodeEntities = (text: string) =>
	text.replace(/&#(\d+);/g, (entity, code: string) => {
		const value = Number(code);
		return value <= 0x10ffff ? String.fromCodePoint(value) : entity;
	});

/**
 * Keep link labels but drop the URLs, used when links are disabled for a group.
 * The lookbehinds leave backslash-escaped brackets alone, so a template that still
 * uses them keeps its label intact.
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
	// must not touch query strings, nor eat the `\&` of a hand-escaped name.
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

	// Decode before restoring the literal placeholders: a name that literally contains
	// `&#91;` was escaped to `&#38;#91;`, so it must come back as `&#91;`, not `[`.
	return decodeEntities(text)
		.replace(/\u0000ESC(\d+)\u0000/g, (_, index) => literals[Number(index)] ?? '')
		.replace(/\u0000URL(\d+)\u0000/g, (_, index) => urls[Number(index)] ?? '');
};
