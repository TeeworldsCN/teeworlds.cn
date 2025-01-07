export function encodeBase64(str: string | Uint8Array) {
	if (typeof str == 'string') {
		str = new TextEncoder().encode(str);
	}
	return btoa(String.fromCodePoint(...str));
}

export function decodeBase64(str: string, options?: { buffer: false }): string;
export function decodeBase64(str: string, options: { buffer: true }): Uint8Array;
export function decodeBase64(
	str: string,
	{ buffer = false }: { buffer?: boolean } = {}
): string | Uint8Array {
	const result = atob(str);
	const array = Uint8Array.from(result.split('').map((char) => char.codePointAt(0)));
	return buffer ? array : new TextDecoder().decode(array);
}
