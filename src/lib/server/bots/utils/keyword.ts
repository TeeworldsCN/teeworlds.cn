/**
 * Keyword matching for the QQ group auto-recall.
 *
 * Keywords are plain substrings (case-insensitive), not regular expressions:
 * they are maintained by admins on the website, and a typo in a regex would
 * either match nothing at all or match every single message.
 *
 * Both sides are normalized before comparing so trivial evasions still hit:
 * - NFKC folds full-width forms (`ａｂｃ` -> `abc`, `１２３` -> `123`)
 * - lower case
 * - format/zero-width characters (U+200B, U+2060, U+FEFF, ...) are dropped
 * - whitespace is dropped entirely, so `敏 感 词` matches the keyword `敏感词`
 *
 * Empty keywords never match, so an accidentally blank row in the admin page
 * cannot recall every message in the group.
 */

const INVISIBLE = /\p{Cf}/gu;
const WHITESPACE = /\s+/gu;

export const normalizeForMatch = (text: string) =>
	text.normalize('NFKC').replace(INVISIBLE, '').replace(WHITESPACE, '').toLowerCase();

/**
 * Find the first item whose `keyword` is contained in `message`.
 * Items are checked in the given order, so admins can put the more specific
 * keyword first if two of them overlap.
 */
export const matchKeyword = <T extends { keyword: string }>(
	items: readonly T[],
	message: string
): T | null => {
	const haystack = normalizeForMatch(message);
	if (!haystack) return null;

	for (const item of items) {
		const needle = normalizeForMatch(item.keyword);
		if (!needle) continue;
		if (haystack.includes(needle)) return item;
	}

	return null;
};
