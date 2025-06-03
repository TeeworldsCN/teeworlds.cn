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
	return MAP_TYPES[type?.toLowerCase?.()] || type;
};

const FLAG_DEFAULT: string = '/assets/flags/default.png';
const FLAG_MAP: { [key: string]: typeof FLAG_DEFAULT } = {
	CHN: '/assets/flags/CN.png',
	NLD: '/assets/flags/NL.png',
	FRA: '/assets/flags/FR.png',
	GER: '/assets/flags/DE.png',
	POL: '/assets/flags/PL.png',
	FIN: '/assets/flags/FI.png',
	UKR: '/assets/flags/UA.png',
	RUS: '/assets/flags/RU.png',
	TUR: '/assets/flags/TR.png',
	IRN: '/assets/flags/IR.png',
	BHR: '/assets/flags/BH.png',
	CHL: '/assets/flags/CL.png',
	BRA: '/assets/flags/BR.png',
	ARG: '/assets/flags/AR.png',
	PER: '/assets/flags/PE.png',
	USA: '/assets/flags/US.png',
	KOR: '/assets/flags/KR.png',
	SGP: '/assets/flags/SG.png',
	ZAF: '/assets/flags/ZA.png',
	IND: '/assets/flags/IN.png',
	AUS: '/assets/flags/AU.png',
	EUR: '/assets/flags/EU.png',
	JPN: '/assets/flags/JP.png'
};

export const KNOWN_REGIONS: Record<string, string> = {
	CHN: '中国服',
	NLD: '荷兰服',
	FRA: '法国服',
	GER: '德国服',
	POL: '波兰服',
	FIN: '芬兰服',
	UKR: '乌克兰服',
	RUS: '俄罗斯服',
	TUR: '土耳其服',
	IRN: '伊朗服',
	BHR: '巴林服',
	CHL: '智利服',
	BRA: '巴西服',
	ARG: '阿根廷服',
	PER: '秘鲁服',
	USA: '美国服',
	KOR: '韩国服',
	TWN: '台服',
	SGP: '新加坡服',
	ZAF: '南非服',
	IND: '印度服',
	AUS: '澳大利亚服',
	OLD: '历史遗留服'
};

export const flagAsset = (flag: string) => {
	return FLAG_MAP[flag] || FLAG_DEFAULT;
};

export const showScore = (score: number, kind: string) => {
	if (kind == 'time') {
		if (score <= 0) return '';
		const total = score;
		const hours = Math.floor(total / 3600);
		const minutes = Math.floor((total % 3600) / 60);
		const seconds = Math.floor(total % 60);
		if (hours > 0)
			return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
		return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
	}
	return score.toString();
};

export const sortPlayers = <T extends { name: string; score: number; is_player: boolean }>(
	players: T[],
	kind: string
) => {
	players.sort((a, b) => {
		if (a.is_player && !b.is_player) return -1;
		if (!a.is_player && b.is_player) return 1;

		if (kind == 'time') {
			if (a.score < 0 && b.score > 0) return 1;
			if (a.score >= 0 && b.score < 0) return -1;
		}

		if (a.score != b.score) {
			if (kind == 'time') {
				return a.score - b.score;
			} else {
				return b.score - a.score;
			}
		}

		return a.name.localeCompare(b.name);
	});
	return players;
};

export const joinViaSteam = (addresses: string[]) => {
	for (const address of addresses) {
		if (address.startsWith('tw-0.6+udp://')) {
			return `steam://rungameid/412220//${encodeURIComponent(address.slice(13))}`;
		}
	}
	return null;
};

export const joinViaDDNet = (addresses: string[]) => {
	for (const address of addresses) {
		if (address.startsWith('tw-0.6+udp://')) {
			return `ddnet://${address.slice(13)}`;
		}
	}
};

export const primaryAddress = (addresses: string[]) => {
	for (const address of addresses) {
		if (address.startsWith('tw-0.6+udp://')) {
			return address.slice(13);
		}
	}
	for (const address of addresses) {
		if (address.startsWith('tw-0.7+udp://')) {
			return address.slice(13);
		}
	}
	return addresses[0];
};

export const isAddressValid = (addresses: string[]) => {
	// ignore non-tw protocols
	return addresses.some(
		(address) => address.startsWith('tw-0.6+udp://') || address.startsWith('tw-0.7+udp://')
	);
};

const REGION_MAP: { [key: string]: string } = {
	'as:cn': '中国',
	as: '亚洲',
	eu: '欧洲',
	na: '北美',
	oc: '南美',
	sa: '南非',
	af: '非洲'
};

export const region = (region?: string) => {
	if (!region) return '未知';
	return REGION_MAP[region] || REGION_MAP[region.split(':')[0]] || region;
};

export const ddnetColorToRgb = (color: number) => {
	const h = ((color >> 16) & 0xff) / 255;
	const s = ((color >> 8) & 0xff) / 255;
	const l = 0.5 + ((color & 0xff) / 255) * 0.5;

	const h1 = h * 6;
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs((h1 % 2) - 1));

	let r = 0;
	let g = 0;
	let b = 0;

	switch (Math.floor(h1)) {
		case 0:
			r = c;
			g = x;
			break;
		case 1:
			r = x;
			g = c;
			break;
		case 2:
			g = c;
			b = x;
			break;
		case 3:
			g = x;
			b = c;
			break;
		case 4:
			r = x;
			b = c;
			break;
		case 5:
			r = c;
			b = x;
			break;
		case 6:
			r = c;
			b = x;
			break;
	}

	const m = l - c / 2;
	return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
};

export const normalizeMapname = (name: string) => name.replace(/\W/g, '_');

export const TILES = [
	'BONUS',
	'BOOST',
	'CHECKPOINT_FIRST',
	'CRAZY_SHOTGUN',
	'DEATH',
	'DFREEZE',
	'DOOR',
	'DRAGGER',
	'EHOOK_START',
	'HIT_END',
	'JETPACK_START',
	'JUMP',
	'LASER_STOP',
	'NPC_START',
	'NPH_START',
	'OLDLASER',
	'PLASMAE',
	'PLASMAF',
	'PLASMAU',
	'POWERUP_NINJA',
	'SOLO_START',
	'STOP',
	'SUPER_START',
	'SWITCH',
	'SWITCH_TIMED',
	'TELECHECK',
	'TELEIN',
	'TELEINEVIL',
	'TELEINHOOK',
	'TELEINWEAPON',
	'TELE_GRENADE',
	'TELE_GUN',
	'TELE_LASER',
	'THROUGH',
	'THROUGH_ALL',
	'TUNE',
	'WALLJUMP',
	'WEAPON_GRENADE',
	'WEAPON_RIFLE',
	'WEAPON_SHOTGUN'
];

export const parseDemoName = (name: string) => {
	if (!name.endsWith('.demo')) {
		return null;
	}
	name = name.slice(0, -5);
	const parts = name.split('_');
	for (let i = 1; i < parts.length - 1; i++) {
		const part = parts[i];
		if (part[part.length - 4] === '.') {
			const time = parseFloat(part);
			if (isNaN(time)) {
				continue;
			}
			return {
				map: parts.slice(0, i).join('_'),
				time,
				name: parts.slice(i + 1).join('_')
			};
		}
	}

	return null;
};
