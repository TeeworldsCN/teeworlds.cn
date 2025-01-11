type RGB = { r: number; g: number; b: number };
type HSL = { h: number; s: number; l: number };
type SPSA = { values: number[]; loss: number };
type Target = { rgb: RGB; hsl: HSL };

const fmt = (filters: number[], idx: number, multiplier = 1): number =>
	Math.round(filters[idx] * multiplier);

const clamp = (value: number): number => Math.min(Math.max(value, 0), 255);

const hsl = (rgb: RGB): HSL => {
	const r = rgb.r / 255;
	const g = rgb.g / 255;
	const b = rgb.b / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	let h = 0;
	let s = 0;
	let l = (max + min) / 2;

	if (max === min) {
		h = s = 0;
	} else {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case r:
				h = (g - b) / d + (g < b ? 6 : 0);
				break;

			case g:
				h = (b - r) / d + 2;
				break;

			case b:
				h = (r - g) / d + 4;
				break;
		}
		h /= 6;
	}

	return {
		h: h * 100,
		s: s * 100,
		l: l * 100
	};
};

const mul = (color: RGB, matrix: number[]) => {
	const newR = clamp(color.r * matrix[0] + color.g * matrix[1] + color.b * matrix[2]);
	const newG = clamp(color.r * matrix[3] + color.g * matrix[4] + color.b * matrix[5]);
	const newB = clamp(color.r * matrix[6] + color.g * matrix[7] + color.b * matrix[8]);
	color.r = newR;
	color.g = newG;
	color.b = newB;
};

const loss = (filters: number[], target: Target): number => {
	const color = { r: 0, g: 0, b: 0 };
	const invert = filters[0] / 100;
	color.r = clamp((invert + (color.r / 255) * (1 - 2 * invert)) * 255);
	color.g = clamp((invert + (color.g / 255) * (1 - 2 * invert)) * 255);
	color.b = clamp((invert + (color.b / 255) * (1 - 2 * invert)) * 255);
	const sepia = 1 - filters[1] / 100;
	mul(color, [
		0.393 + 0.607 * sepia,
		0.769 - 0.769 * sepia,
		0.189 - 0.189 * sepia,
		0.349 - 0.349 * sepia,
		0.686 + 0.314 * sepia,
		0.168 - 0.168 * sepia,
		0.272 - 0.272 * sepia,
		0.534 - 0.534 * sepia,
		0.131 + 0.869 * sepia
	]);
	const saturate = filters[2] / 100;
	mul(color, [
		0.213 + 0.787 * saturate,
		0.715 - 0.715 * saturate,
		0.072 - 0.072 * saturate,
		0.213 - 0.213 * saturate,
		0.715 + 0.285 * saturate,
		0.072 - 0.072 * saturate,
		0.213 - 0.213 * saturate,
		0.715 - 0.715 * saturate,
		0.072 + 0.928 * saturate
	]);
	const hueRotate = ((filters[3] * 3.6) / 180) * Math.PI;
	const sin = Math.sin(hueRotate);
	const cos = Math.cos(hueRotate);
	mul(color, [
		0.213 + cos * 0.787 - sin * 0.213,
		0.715 - cos * 0.715 - sin * 0.715,
		0.072 - cos * 0.072 + sin * 0.928,
		0.213 - cos * 0.213 + sin * 0.143,
		0.715 + cos * 0.285 + sin * 0.14,
		0.072 - cos * 0.072 - sin * 0.283,
		0.213 - cos * 0.213 - sin * 0.787,
		0.715 - cos * 0.715 + sin * 0.715,
		0.072 + cos * 0.928 + sin * 0.072
	]);
	const brightness = filters[4] / 100;
	color.r = clamp(color.r * brightness);
	color.g = clamp(color.g * brightness);
	color.b = clamp(color.b * brightness);
	const contrast = filters[5] / 100;
	const offset = -(0.5 * contrast) + 0.5;
	color.r = clamp(color.r * contrast + offset * 255);
	color.g = clamp(color.g * contrast + offset * 255);
	color.b = clamp(color.b * contrast + offset * 255);
	const currentHsl = hsl(color);
	return Math.abs(color.r - target.rgb.r) + Math.abs(color.g - target.rgb.g) + Math.abs(color.b - target.rgb.b) + Math.abs(currentHsl.h - target.hsl.h) + Math.abs(currentHsl.s - target.hsl.s) + Math.abs(currentHsl.l - target.hsl.l);
};

const clampSpsa = (value: number, idx: number): number => {
	let max = 100;
	if (idx === 2) {
		max = 7500;
	} else if (idx === 4 || idx === 5) {
		max = 200;
	}
	if (idx === 3) {
		if (value > max) {
			value %= max;
		} else if (value < 0) {
			value = max + (value % max);
		}
	} else if (value < 0) {
		value = 0;
	} else if (value > max) {
		value = max;
	}
	return value;
};

const spsa = (
	target: Target,
	A: number,
	a: number[],
	c: number,
	values: number[],
	iters: number
): SPSA => {
	const alpha = 1;
	const gamma = 0.16666666666666666;

	let best: number[] = [];
	let bestLoss = Infinity;
	const deltas: number[] = new Array(6);
	const highArgs: number[] = new Array(6);
	const lowArgs: number[] = new Array(6);

	for (let k = 0; k < iters; k += 1) {
		const ck = c / Math.pow(k + 1, gamma);
		for (let i = 0; i < 6; i += 1) {
			deltas[i] = Math.random() > 0.5 ? 1 : -1;
			highArgs[i] = values[i] + ck * deltas[i];
			lowArgs[i] = values[i] - ck * deltas[i];
		}

		const lossDiff = loss(highArgs, target) - loss(lowArgs, target);
		for (let i = 0; i < 6; i += 1) {
			const g = (lossDiff / (2 * ck)) * deltas[i];
			const ak = a[i] / Math.pow(A + k + 1, alpha);
			values[i] = clampSpsa(values[i] - ak * g, i);
		}

		const lossValue = loss(values, target);
		if (lossValue < bestLoss) {
			best = values.slice(0);
			bestLoss = lossValue;
		}
	}
	return { values: best, loss: bestLoss };
};

const solveNarrow = (target: Target, wide: SPSA): SPSA => {
	const A = wide.loss;
	const c = 2;
	const A1 = A + 1;
	const a = [0.25 * A1, 0.25 * A1, A1, 0.25 * A1, 0.2 * A1, 0.2 * A1];
	return spsa(target, A, a, c, wide.values, 500);
};

const solveWide = (target: Target): SPSA => {
	const A = 5;
	const c = 15;
	const a = [60, 180, 18000, 600, 1.2, 1.2];

	let best: SPSA = { values: [], loss: Infinity };
	for (let i = 0; best.loss > 25 && i < 3; i += 1) {
		const initial = [50, 20, 3750, 50, 100, 100];
		const result = spsa(target, A, a, c, initial, 1000);
		if (result.loss < best.loss) {
			best = result;
		}
	}
	return best;
};

export const rgbToFilter = (color: RGB, maxLossIter = 1) => {
	const target = { rgb: color, hsl: hsl(color) };
	let result: SPSA = solveNarrow(target, solveWide(target));

	for (let i = 0; i < maxLossIter - 1; i++) {
		if (result.loss < 0.8) {
			break;
		}
		const current = solveNarrow(target, solveWide(target));
		if (current.loss < result.loss) {
			result = current;
		}
	}

	const filters = result.values;
	return {
		loss: result.loss,
		color: `invert(${fmt(filters, 0)}%) sepia(${fmt(filters, 1)}%) saturate(${fmt(filters, 2)}%) hue-rotate(${fmt(filters, 3, 3.6)}deg) brightness(${fmt(filters, 4)}%) contrast(${fmt(filters, 5)}%)`
	};
};
