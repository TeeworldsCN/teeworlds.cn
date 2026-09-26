/**
 * Fuzzy map name matching for the bot `maps` handler.
 *
 * Used as a last resort when a query does not match any map name with the
 * regular search (`checkMapName`). The goal is to answer "which map did the
 * user most likely mean?" while never producing a guess for random input.
 *
 * Scoring research (validated against the full DDNet map list, see
 * `scripts/fuzzy-check.ts`):
 *
 * - Damerau-Levenshtein ratio (typos, including adjacent transpositions)
 * - Sørensen-Dice coefficient over character bigrams (dropped/extra words,
 *   partial names)
 * - The final score is `max()` of both: either signal alone misses a whole
 *   class of near-misses (edit distance misses dropped words, bigram Dice
 *   scores word shuffles too generously), and `max()` keeps both honest.
 * - A single threshold of 0.75 rejects random input. On the real map list it
 *   answers ~99% of single-edit typos (98.7% of suggestions point at the
 *   intended map) while only ~0.3% of random letter strings pass, all of
 *   which are one edit away from a real (very short) map name.
 *
 * Both metrics are computed on lowercased strings with separators
 * (`-`, `_`, spaces, dots, quotes) removed, so `Sunny-Side Up`, `sunny_side_up`
 * and `sunnysideup` are all the same distance from a query.
 */

/** Scores below this never produce a match. */
export const FUZZY_MATCH_THRESHOLD = 0.75;

/** Do not attempt fuzzy matching for very short queries (too easy to match by accident). */
export const FUZZY_MIN_QUERY_LENGTH = 3;

export const normalizeFuzzy = (text: string) => text.toLowerCase().replace(/[-_.\s'’]/g, '');

/**
 * Damerau-Levenshtein distance (restricted to adjacent transpositions),
 * i.e. insertions, deletions, substitutions and swaps of neighbouring chars.
 */
const editDistance = (a: string, b: string): number => {
	const m = a.length;
	const n = b.length;
	if (m == 0) return n;
	if (n == 0) return m;

	let twoRowsAgo: number[] = [];
	let previousRow: number[] = Array.from({ length: n + 1 }, (_, j) => j);
	let currentRow: number[] = new Array(n + 1);

	for (let i = 1; i <= m; i++) {
		currentRow[0] = i;
		for (let j = 1; j <= n; j++) {
			const substitution = a[i - 1] == b[j - 1] ? 0 : 1;
			let distance = Math.min(
				currentRow[j - 1] + 1, // insertion
				previousRow[j] + 1, // deletion
				previousRow[j - 1] + substitution // substitution
			);
			if (i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1]) {
				distance = Math.min(distance, twoRowsAgo[j - 2] + 1); // transposition
			}
			currentRow[j] = distance;
		}
		twoRowsAgo = previousRow;
		previousRow = currentRow;
		currentRow = new Array(n + 1);
	}

	return previousRow[n];
};

/** 1 for identical strings, 0 for completely dissimilar ones. */
const editSimilarity = (a: string, b: string) =>
	1 - editDistance(a, b) / Math.max(a.length, b.length);

const bigrams = (text: string) => {
	const counts = new Map<string, number>();
	for (let i = 0; i + 1 < text.length; i++) {
		const bigram = text.slice(i, i + 2);
		counts.set(bigram, (counts.get(bigram) || 0) + 1);
	}
	return counts;
};

/** Sørensen-Dice coefficient over character bigrams, counting duplicates. */
const bigramSimilarity = (a: string, b: string) => {
	if (a == b) return 1;

	const bigramsA = bigrams(a);
	const bigramsB = bigrams(b);
	if (bigramsA.size == 0 || bigramsB.size == 0) return 0;

	let overlap = 0;
	for (const [bigram, count] of bigramsA) {
		overlap += Math.min(count, bigramsB.get(bigram) || 0);
	}

	return (2 * overlap) / (a.length - 1 + (b.length - 1));
};

/** Similarity of two (already normalized) strings, in the [0, 1] range. */
export const fuzzySimilarity = (query: string, target: string) =>
	Math.max(editSimilarity(query, target), bigramSimilarity(query, target));

export type FuzzyMatch<T> = {
	item: T;
	/** similarity of the query to the item's name, always >= FUZZY_MATCH_THRESHOLD */
	score: number;
};

/**
 * Find the item whose name is closest to `query`, or null when nothing is
 * close enough. `items` should already be sorted by preference so that ties
 * are resolved towards the preferred item.
 */
export const findBestFuzzyMatch = <T>(
	query: string,
	items: T[],
	getName: (item: T) => string
): FuzzyMatch<T> | null => {
	const normalizedQuery = normalizeFuzzy(query);
	if (normalizedQuery.length < FUZZY_MIN_QUERY_LENGTH) {
		return null;
	}

	let best: FuzzyMatch<T> | null = null;
	for (const item of items) {
		const score = fuzzySimilarity(normalizedQuery, normalizeFuzzy(getName(item)));
		if (score >= FUZZY_MATCH_THRESHOLD && (!best || score > best.score)) {
			best = { item, score };
		}
	}

	return best;
};
