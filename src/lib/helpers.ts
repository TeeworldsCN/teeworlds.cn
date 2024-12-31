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

export const unescapeHTML = (str: string) => {
	return str
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#x27;/g, "'");
};

export const secondsToTime = (totalSeconds: number) => {
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = Math.floor(totalSeconds % 60);

	if (hours > 0)
		return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
	return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export const secondsToChineseTime = (totalSeconds: number) => {
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = Math.floor(totalSeconds % 60);
	const remainder = Math.floor((totalSeconds - Math.floor(totalSeconds)) * 100);

	const ender = remainder == 0 ? '整' : remainder.toString().padStart(2, '0');

	if (hours > 0)
		return `${hours.toString().padStart(2, '0')}时${minutes.toString().padStart(2, '0')}分${seconds.toString().padStart(2, '0')}秒${ender}`;
	return `${minutes.toString().padStart(2, '0')}分${seconds.toString().padStart(2, '0')}秒${ender}`;
};
