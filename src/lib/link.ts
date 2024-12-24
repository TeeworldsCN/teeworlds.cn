export const fetchDDNetAsync = async (url: string) => {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}`);
	}
	return response.json();
};

export const encodeURIComponentAscii = (str: string) => {
	// swap + and %20 to make it look better
	return encodeURIComponent(normalizeURIAscii(str)).replace(/%2B/g, '+');
};

export const normalizeURIAscii = (str: string) => {
	return str
		.replace(/ /g, '<plus>')
		.replace(/\+/g, ' ')
		.replace(/<plus>/g, '+');
};
