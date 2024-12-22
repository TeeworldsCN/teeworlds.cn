import FLAG_GER from '$lib/ddnet/assets/DE.png';
import FLAG_CHN from '$lib/ddnet/assets/CN.png';
import FLAG_JPN from '$lib/ddnet/assets/JP.png';
import FLAG_KOR from '$lib/ddnet/assets/KR.png';
import FLAG_RUS from '$lib/ddnet/assets/RU.png';
import FLAG_SGP from '$lib/ddnet/assets/SG.png';
import FLAG_IND from '$lib/ddnet/assets/IN.png';
import FLAG_AUS from '$lib/ddnet/assets/AU.png';
import FLAG_ZAF from '$lib/ddnet/assets/ZA.png';
import FLAG_USA from '$lib/ddnet/assets/US.png';
import FLAG_BRA from '$lib/ddnet/assets/BR.png';
import FLAG_CHL from '$lib/ddnet/assets/CL.png';
import FLAG_POL from '$lib/ddnet/assets/PL.png';
import FLAG_IRN from '$lib/ddnet/assets/IR.png';
import FLAG_BHR from '$lib/ddnet/assets/BH.png';
import FLAG_FIN from '$lib/ddnet/assets/FI.png';
import FLAG_UKR from '$lib/ddnet/assets/UA.png';
import FLAG_TUR from '$lib/ddnet/assets/TR.png';
import FLAG_ARG from '$lib/ddnet/assets/AR.png';

import FLAG_EUR from '$lib/ddnet/assets/EU.png';
import FLAG_DEFAULT from '$lib/ddnet/assets/default.png';

export const numberToStars = (num: number) => {
	const stars = Math.round(num);
	return `${'★'.repeat(stars)}${'☆'.repeat(Math.max(0, 5 - stars))}`;
};

const FLAG_MAP: { [key: string]: typeof FLAG_DEFAULT } = {
	EUR: FLAG_EUR,
	GER: FLAG_GER,
	CHN: FLAG_CHN,
	JPN: FLAG_JPN,
	KOR: FLAG_KOR,
	RUS: FLAG_RUS,
	SGP: FLAG_SGP,
	IND: FLAG_IND,
	AUS: FLAG_AUS,
	ZAF: FLAG_ZAF,
	USA: FLAG_USA,
	BRA: FLAG_BRA,
	CHL: FLAG_CHL,
	POL: FLAG_POL,
	IRN: FLAG_IRN,
	BHR: FLAG_BHR,
	FIN: FLAG_FIN,
	UKR: FLAG_UKR,
	TUR: FLAG_TUR,
    ARG: FLAG_ARG,
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
