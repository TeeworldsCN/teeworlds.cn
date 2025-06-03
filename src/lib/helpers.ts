import { decodeBase64Url, encodeBase64Url } from './base64url';

const SUPERSCRIPTS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
const SUBSCRIPTS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];

export const numberToSuper = (num: number) => {
	let result = '';
	num = Math.floor(num);
	while (num > 0) {
		const digit = num % 10;
		result = SUPERSCRIPTS[digit] + result;
		num = Math.floor(num / 10);
	}
	return result;
};

export const numberToSub = (num: number) => {
	let result = '';
	num = Math.floor(num);
	while (num > 0) {
		const digit = num % 10;
		result = SUBSCRIPTS[digit] + result;
		num = Math.floor(num / 10);
	}
	return result;
};

interface FormatNumberOptions {
	/** how many digits must show after the decimal point */
	minFractionDigits?: number;
	/** how many digits can show after the decimal point */
	maxFractionDigits?: number;
	/** unit to append to the end of the number */
	unit?: string;
	/** whether to show a plus sign for positive numbers */
	signed?: boolean;
	/** whether to show a space between the number and the unit */
	space?: 'before suffix' | true | false;
	/** whether to shorten the number by using k,m,g,t suffixes */
	short?: boolean;
}

/**
 * Shorten a number to a more readable format
 * @param num the number to shorten
 * @param options See {@link FormatNumberOptions}
 * @returns formatted string
 */
export const formatNumber = (
	num: number,
	{
		minFractionDigits = 0,
		maxFractionDigits = 2,
		unit = '',
		signed = false,
		space = false,
		short = true
	}: FormatNumberOptions = {}
) => {
	const suffixes = ['', 'k', 'm', 'g', 't'];
	let value = num;
	let suffixIndex = 0;

	// Handle shortening of large numbers
	if (short && Math.abs(value) >= 1000) {
		while (Math.abs(value) >= 1000 && suffixIndex < suffixes.length - 1) {
			value /= 1000;
			suffixIndex++;
		}
	}

	// Format the number with proper decimal places
	const formattedNumber = value.toLocaleString('en-US', {
		minimumFractionDigits: minFractionDigits,
		maximumFractionDigits: maxFractionDigits
	});

	// Build the final string
	let result = '';

	// Add sign if needed
	if (signed && value > 0) {
		result += '+';
	}

	// Add the formatted number
	result += formattedNumber;

	// Handle spacing and suffixes
	if (short && suffixIndex > 0) {
		if (space === 'before suffix') {
			result += ' ' + suffixes[suffixIndex];
		} else {
			result += suffixes[suffixIndex];
		}
	}

	// Add space if needed (only for unit, not for suffix)
	if (unit && space === true) {
		result += ' ';
	}

	// Add unit if provided
	if (unit) {
		result += unit;
	}

	return result;
};

export const unescapeHTML = (str: string) => {
	return str
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#x27;/g, "'");
};

export const escapeHTML = (str: string) => {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#x27;');
};

export const secondsToTime = (totalSeconds: number) => {
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = Math.floor(totalSeconds % 60);

	if (hours > 0)
		return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
	return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export const secondsToChineseTime = (
	totalSeconds: number,
	withoutMillis = false,
	noPad = false
) => {
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = Math.floor(totalSeconds % 60);
	const remainder = Math.floor((totalSeconds - Math.floor(totalSeconds)) * 100);

	const ender =
		remainder == 0 ? '整' : noPad ? remainder.toString() : remainder.toString().padStart(2, '0');

	if (noPad) {
		if (hours > 0)
			return `${hours.toString()}小时${minutes.toString()}分${seconds.toString()}秒${withoutMillis ? '' : ender}`;
		return `${minutes.toString()}分${seconds.toString()}秒${withoutMillis ? '' : ender}`;
	}

	if (hours > 0)
		return `${hours.toString().padStart(2, '0')}时${minutes.toString().padStart(2, '0')}分${seconds.toString().padStart(2, '0')}秒${withoutMillis ? '' : ender}`;
	return `${minutes.toString().padStart(2, '0')}分${seconds.toString().padStart(2, '0')}秒${withoutMillis ? '' : ender}`;
};

export const dateToChineseTime = (date: Date) => {
	return `${date.getHours()}时${date.getMinutes()}分`;
};

export const addrToBase64 = (address: string) => {
	const ipPort = address.split(':');
	if (ipPort.length != 2) {
		return null;
	}
	const ip = ipPort[0];
	const port = parseInt(ipPort[1]);
	const part = ip.split('.');
	const addr = new Uint8Array(6);
	addr[0] = parseInt(part[0]);
	addr[1] = parseInt(part[1]);
	addr[2] = parseInt(part[2]);
	addr[3] = parseInt(part[3]);
	addr[4] = port / 256;
	addr[5] = port % 256;
	return encodeBase64Url(addr);
};

export const ipToNumber = (ip: string) => {
	const parts = ip.split('.');
	return (
		((parseInt(parts[0]) << 24) |
			(parseInt(parts[1]) << 16) |
			(parseInt(parts[2]) << 8) |
			parseInt(parts[3])) >>>
		0
	);
};

export const numberToIp = (num: number) => {
	return `${(num >> 24) & 0xff}.${(num >> 16) & 0xff}.${(num >> 8) & 0xff}.${num & 0xff}`;
};

export const base64ToAddr = (base64: string) => {
	const addr = decodeBase64Url(base64, { buffer: true });
	if (addr.length != 6) {
		return null;
	}
	return `${addr[0]}.${addr[1]}.${addr[2]}.${addr[3]}:${addr[4] * 256 + addr[5]}`;
};

export const uaIsStrict = (ua: string | null) => {
	if (!ua) return false;
	return /(QQ\/|micromessenger)/i.test(ua);
};

export const uaIsQQ = (ua: string | null) => {
	if (!ua) return false;
	return /(QQ\/)/i.test(ua);
};

export const uaIsWechat = (ua: string | null) => {
	if (!ua) return false;
	return /micromessenger/i.test(ua);
};

export const uaNeedBackButton = (ua: string | null) => {
	if (!ua) return false;
	return /(QQ\/)/i.test(ua);
};

export const uaIsMobile = (ua: string | null) => {
	if (!ua) return false;
	const regex =
		/(iPhone|iPad|iPod|Android|BlackBerry|Windows Phone|BB10|webOS|IEMobile|Opera Mini|Mobile|Silk-Accelerated|(hpw|web)OS|Opera Mini)/i;
	return regex.test(ua);
};
