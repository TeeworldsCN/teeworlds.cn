import { env } from '$env/dynamic/private';
import { Mint } from 'mint-filter';
import { readFileSync } from 'node:fs';

let filter: Mint | null = null;
const dictPath = env.SENSITIVE_LEXICON_PATH || './sensitive-lexicon.txt';

// stream file by line
try {
	console.time('filter loaded');
	const dictStream = readFileSync(dictPath, { encoding: 'utf-8' });
	const lines = dictStream.split('\n');
	filter = new Mint(lines);
	console.timeEnd('filter loaded');
} catch {}

export const filterText = (text: string, replace = true) => {
	if (!filter) return text;
	return filter.filter(text, { replace }).text;
};

export const allowedText = (text: string) => {
	if (!filter) return true;
	return filter.verify(text);
};
