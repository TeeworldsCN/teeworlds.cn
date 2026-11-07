import { describe, expect, test } from 'bun:test';
import { decodeAsciiURIComponent, encodeAsciiURIComponent } from './link';

describe('encodeAsciiURIComponent', () => {
	test('括号也走 base64 段，拼进 markdown 链接不会被截断', () => {
		for (const name of ['a)b(c', 'foo) *bar*', '[D] TsFreddie', 'x!y', '含 空格']) {
			const encoded = encodeAsciiURIComponent(name);
			expect(encoded).not.toMatch(/[()[\]]/);
			expect(decodeAsciiURIComponent(encoded)).toBe(name);
		}
	});
});
