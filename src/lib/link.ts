export const fetchDDNetAsync = async (url: string) => {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}`);
	}
	return response.json();
};
