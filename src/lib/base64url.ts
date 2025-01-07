export function encodeBase64Url(str: string | Uint8Array) {
	if (typeof str == 'string') {
		str = new TextEncoder().encode(str);
	}
	return btoa(String.fromCodePoint(...str))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

export function decodeBase64Url(str: string, options?: { buffer: false }): string;
export function decodeBase64Url(str: string, options: { buffer: true }): Uint8Array;
export function decodeBase64Url(
	str: string,
	{ buffer = false }: { buffer?: boolean } = {}
): string | Uint8Array {
	const result = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
	const array = Uint8Array.from(result.split('').map((char) => char.codePointAt(0)));
	return buffer ? array : new TextDecoder().decode(array);
}
