export const checkMapName = (name: string, search: string) => {
	if (!search) {
		return true;
	}

	let mapInitial = '';
	let mapNameNoSeparator = '';
	let prevIsUpper = false;
	let prevIsSeparator = true;
	for (let i = 0; i < name.length; i++) {
		const char = name[i];
		const isUpper = !!char.match(/[A-Z]/);
		const isLetter = isUpper || char.match(/[a-z]/);
		const isSeparator = char == '-' || char == '_' || char == ' ';
		const isNumber = char.match(/[0-9\.]/);
		if (isUpper) {
			if (!prevIsUpper || prevIsSeparator) {
				mapInitial += char;
			}
		} else if (isLetter) {
			if (prevIsSeparator) {
				mapInitial += char;
			}
		} else if (isNumber) {
			mapInitial += char;
		}
		prevIsUpper = isUpper;
		prevIsSeparator = isSeparator;
		if (!isSeparator) {
			mapNameNoSeparator += char;
		}
	}

	let searchNoSeparator = '';
	for (let i = 0; i < search.length; i++) {
		const char = search[i];
		const isSeparator = char == '-' || char == '_' || char == ' ';
		if (!isSeparator) {
			searchNoSeparator += char;
		}
	}

	const mapName = name.toLowerCase();
	const searchTextLower = search.toLowerCase();
	const searchTextNoSeparatorLower = searchNoSeparator.toLowerCase();

	return (
		mapInitial.toLowerCase().startsWith(searchTextNoSeparatorLower) ||
		mapNameNoSeparator.toLowerCase().includes(searchTextNoSeparatorLower) ||
		mapName.includes(searchTextLower)
	);
};

export const checkMapper = (mapper: string, search: string) => {
	if (!search) {
		return true;
	}

	const mapperString = mapper || '不详';

	if (search.startsWith('"') && search.endsWith('"')) {
		// exact match
		const mappers = (mapperString as string)
			.split(',')
			.flatMap((mapper) => mapper.split('&'))
			.map((mapper) => mapper.trim());

		search = search.slice(1, -1).toLowerCase();
		return mappers.some((mapper) => mapper.toLowerCase() == search);
	}

	return mapperString.toLowerCase().includes(search.toLowerCase());
};
