/** Escape user-provided text before embedding it in QQ markdown. */
export const escapeMarkdown = (text: string) => text.replace(/([\\`*_[\]~|<>])/g, '\\$1');

/** Keep link labels but drop the URLs, used when links are disabled for a group. */
export const stripMarkdownLinks = (markdown: string) =>
	markdown
		.replace(/^\[([^\]]+)\]\([^)]*\)\s*$/gm, '')
		.replace(/(?<!!)\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/\n{3,}/g, '\n\n')
		.trim();

/** Render markdown as readable plain text for platforms without markdown support. */
export const markdownToText = (markdown: string) => {
	// Protect URLs first: stripping emphasis markers must not touch query strings.
	const urls: string[] = [];
	const protectedText = markdown
		.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
		.replace(/<(https?:\/\/[^>]+)>/g, '$1')
		.replace(/https?:\/\/[^\s)）]+/g, (url) => {
			urls.push(url);
			return `\u0000URL${urls.length - 1}\u0000`;
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
		.replace(/\\([\\`*_[\]~|<>])/g, '$1')
		.replace(/\n{3,}/g, '\n\n')
		.trim();

	return text.replace(/\u0000URL(\d+)\u0000/g, (_, index) => urls[Number(index)] ?? '');
};
