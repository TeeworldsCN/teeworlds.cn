import type { ServerInfo } from '$lib/server/fetches/servers';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, parent }) => {
	const data = (await (await fetch('/ddnet/servers')).json()) as {
		servers: ServerInfo;
	};
	return { ...data, ...(await parent()) };
};
