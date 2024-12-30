export const numberToStars = (num: number) => {
	const stars = Math.round(num);
	return `${'★'.repeat(stars)}${'☆'.repeat(Math.max(0, 5 - stars))}`;
};

export const unescapeHTML = (str: string) => {
	return str
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#x27;/g, "'");
};

const MAP_TYPES: { [key: string]: string } = {
	solo: '单人',
	dummy: '分身',
	novice: '新手',
	moderate: '中阶',
	brutal: '高阶',
	insane: '疯狂',
	oldschool: '传统',
	race: '竞速',
	fun: '娱乐'
};

export const mapType = (type: string) => {
	return MAP_TYPES[type.toLowerCase()] || type;
};

const FLAG_DEFAULT: string = '/assets/flags/default.png'
const FLAG_MAP: { [key: string]: typeof FLAG_DEFAULT } = {
	GER: '/assets/flags/DE.png',
	CHN: '/assets/flags/CN.png',
	JPN: '/assets/flags/JP.png',
	KOR: '/assets/flags/KR.png',
	RUS: '/assets/flags/RU.png',
	SGP: '/assets/flags/SG.png',
	IND: '/assets/flags/IN.png',
	AUS: '/assets/flags/AU.png',
	ZAF: '/assets/flags/ZA.png',
	USA: '/assets/flags/US.png',
	BRA: '/assets/flags/BR.png',
	CHL: '/assets/flags/CL.png',
	POL: '/assets/flags/PL.png',
	IRN: '/assets/flags/IR.png',
	BHR: '/assets/flags/BH.png',
	FIN: '/assets/flags/FI.png',
	UKR: '/assets/flags/UA.png',
	TUR: '/assets/flags/TR.png',
	ARG: '/assets/flags/AR.png',
	EUR: '/assets/flags/EU.png'
};

export const flagAsset = (flag: string) => {
	return FLAG_MAP[flag] || FLAG_DEFAULT;
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
