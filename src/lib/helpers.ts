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
