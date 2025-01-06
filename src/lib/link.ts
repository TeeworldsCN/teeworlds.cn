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

export const encodeAsciiURIComponent = (str: string) => {
	let result = '';
	let segment = '';

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
