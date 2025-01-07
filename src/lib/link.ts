import { encode, decode } from '$lib/base64url';

export const fetchDDNetAsync = async (url: string) => {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}`);
	}
	return response.json();
};

const URL_ALLOWED_CHARS = new Set(
	`abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~*()`
);
const isURLAllowed = (char: string) => URL_ALLOWED_CHARS.has(char);

export const encodeAsciiURIComponent = (str: string, stamped = false) => {
	let result = '';
	let segment = '';

	if (stamped) {
		const nowSeconds = Math.floor(Date.now() / 1000);
		const time = new Uint8Array(4);
		time.set([nowSeconds >> 24, nowSeconds >> 16, nowSeconds >> 8, nowSeconds]);
		result += '!!';
		result += encode(time);
		result += '!!';
	}

	const commit = () => {
		if (segment) {
			result += `!${encode(segment)}!`;
			segment = '';
		}
	};

	for (const char of str) {
		if (isURLAllowed(char)) {
			commit();
			result += char;
		} else if (char == ' ') {
			commit();
			result += '+';
		} else {
			segment += char;
		}
	}
	commit();
	return encodeURIComponent(result).replace(/%2B/g, '+');
};

export const decodeAsciiURIComponent = (str: string) => {
	let result = '';
	let segment = '';

	if (str.startsWith('!!')) {
		// remove time stamp
		str = str.slice(2);
		const index = str.indexOf('!!', 2);
		if (index >= 0) {
			str = str.slice(index + 2);
		}
	}

	for (const char of str) {
		if (char == '!') {
			if (segment) {
				result += decode(segment.slice(1));
				segment = '';
			} else {
				segment += char;
			}
		} else if (segment) {
			segment += char;
		} else if (char == '+') {
			result += ' ';
		} else {
			result += char;
		}
	}
	return result;
};
