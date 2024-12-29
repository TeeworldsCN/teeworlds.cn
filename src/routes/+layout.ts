import type { LayoutLoad } from './$types';

export const load: LayoutLoad = ({ data }) => {
	return { ...data };
};
