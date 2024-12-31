export const numberToStars = (num: number) => {
	const stars = Math.round(num);
	return `${'★'.repeat(stars)}${'☆'.repeat(Math.max(0, 5 - stars))}`;
};

/** Convert ddnet's YYYY-MM-DD HH:MM:SS which is GMT+1 to local time */
export const ddnetDate = (date: string) => {
	return new Date(date.slice(0, 10) + 'T' + date.slice(11, 19) + '+01:00');
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
	fun: '娱乐',
	'ddmax.easy': '古典.Easy',
	'ddmax.next': '古典.Next',
	'ddmax.pro': '古典.Pro',
	'ddmax.nut': '古典.Nut'
};

export const mapType = (type: string) => {
	return MAP_TYPES[type.toLowerCase()] || type;
};

const FLAG_DEFAULT: string = '/assets/flags/default.png';
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
