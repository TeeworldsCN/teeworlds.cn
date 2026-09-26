/**
 * Validation harness for the bot `maps` handler fuzzy matching
 * (`src/lib/server/bots/utils/fuzzy.ts`).
 *
 * Downloads the real DDNet map list and measures, on queries that reach the
 * fuzzy fallback (i.e. the regular `checkMapName` search matched nothing):
 *
 * - recall / top-1 accuracy on perturbed map names (should be high)
 * - false positive rate on random garbage input (should be near zero)
 *
 * Usage: bun run scripts/fuzzy-check.ts
 * Exits non-zero when the guardrails are violated.
 */

import {
	findBestFuzzyMatch,
	FUZZY_MATCH_THRESHOLD,
	normalizeFuzzy
} from '../src/lib/server/bots/utils/fuzzy';
import { checkMapName } from '../src/lib/ddnet/searches';

const MAPS_URL = 'https://ddnet.org/releases/maps.json';

const GUARDRAILS = {
	minTypoRecall: 0.9,
	minTypoTop1Accuracy: 0.95,
	maxRandomFalsePositiveRate: 0.01
};

// deterministic PRNG so runs are comparable
const mulberry32 = (seed: number) => () => {
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const rand = mulberry32(0xddf227);
const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)];
const letters = 'abcdefghijklmnopqrstuvwxyz';

const reachesFuzzy = (names: string[], query: string) =>
	!names.some((name) => checkMapName(name, query));

const mutate = (name: string) => {
	const index = Math.floor(rand() * name.length);
	switch (Math.floor(rand() * 4)) {
		case 0: // deletion
			return name.slice(0, index) + name.slice(index + 1);
		case 1: // insertion
			return name.slice(0, index) + pick([...letters]) + name.slice(index);
		case 2: // substitution
			return name.slice(0, index) + pick([...letters]) + name.slice(index + 1);
		default: // transposition of neighbouring chars
			if (index + 1 < name.length) {
				return name.slice(0, index) + name[index + 1] + name[index] + name.slice(index + 2);
			}
			return name.slice(0, index - 1) + name[index] + name[index - 1];
	}
};

const main = async () => {
	console.log(`Fetching map list from ${MAPS_URL} ...`);
	const response = await fetch(MAPS_URL);
	if (!response.ok) {
		throw new Error(`Failed to fetch map list: ${response.status}`);
	}

	const mapList = (await response.json()) as { name: string }[];
	const names = mapList.map((map) => map.name);
	console.log(`Loaded ${names.length} maps\n`);

	// ---- recall on perturbed map names ----
	type Case = { query: string; expect: string };
	const typoCases: Case[] = [];
	while (typoCases.length < 3000) {
		const name = pick(names);
		const query = mutate(normalizeFuzzy(name));
		if (query.length >= 2 && reachesFuzzy(names, query)) {
			typoCases.push({ query, expect: name });
		}
	}

	let recall = 0;
	let top1 = 0;
	for (const { query, expect } of typoCases) {
		const match = findBestFuzzyMatch(query, names, (name) => name);
		if (match) {
			recall++;
			if (match.item == expect) top1++;
		}
	}

	// ---- false positives on random garbage ----
	const garbageQueries: string[] = [];
	while (garbageQueries.length < 5000) {
		const length = 3 + Math.floor(rand() * 10);
		let query = '';
		for (let i = 0; i < length; i++) query += pick([...letters]);
		if (reachesFuzzy(names, query)) garbageQueries.push(query);
	}

	const garbageMatches = garbageQueries.filter(
		(query) => findBestFuzzyMatch(query, names, (name) => name) != null
	);

	const typoRecall = recall / typoCases.length;
	const typoTop1 = recall > 0 ? top1 / recall : 0;
	const falsePositiveRate = garbageMatches.length / garbageQueries.length;

	console.log(`fuzzy threshold: ${FUZZY_MATCH_THRESHOLD}`);
	console.log(
		`perturbed names (${typoCases.length} queries): answered ${(typoRecall * 100).toFixed(1)}%, ${top1}/${recall} suggestions (${(typoTop1 * 100).toFixed(1)}%) point at the intended map`
	);
	console.log(
		`random input (${garbageQueries.length} queries): ${garbageMatches.length} matched (${(falsePositiveRate * 100).toFixed(2)}%)`
	);
	for (const query of garbageMatches.slice(0, 10)) {
		const match = findBestFuzzyMatch(query, names, (name) => name);
		console.log(`  "${query}" -> ${match?.item} (${match?.score.toFixed(3)})`);
	}

	const failures: string[] = [];
	if (typoRecall < GUARDRAILS.minTypoRecall) {
		failures.push(
			`typo recall ${(typoRecall * 100).toFixed(1)}% < ${GUARDRAILS.minTypoRecall * 100}%`
		);
	}
	if (typoTop1 < GUARDRAILS.minTypoTop1Accuracy) {
		failures.push(
			`typo top-1 accuracy ${(typoTop1 * 100).toFixed(1)}% < ${GUARDRAILS.minTypoTop1Accuracy * 100}%`
		);
	}
	if (falsePositiveRate > GUARDRAILS.maxRandomFalsePositiveRate) {
		failures.push(
			`random input false positives ${(falsePositiveRate * 100).toFixed(2)}% > ${GUARDRAILS.maxRandomFalsePositiveRate * 100}%`
		);
	}

	if (failures.length > 0) {
		console.error(`\nFAILED:\n- ${failures.join('\n- ')}`);
		process.exit(1);
	}

	console.log('\nAll guardrails passed.');
};

main();
