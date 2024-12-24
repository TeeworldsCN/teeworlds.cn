export const fetchDDNetAsync = async (url: string) => {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}`);
	}
	return response.json();
};

export const encodeURIComponentAscii = (str: string) => {
	return encodeURIComponent(str).replace(/%20/g, '+');
};
