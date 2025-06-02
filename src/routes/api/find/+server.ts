import type { RequestHandler } from './$types';
import { servers } from '$lib/server/fetches/servers';
import { error, json } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url }) => {
	const name = url.searchParams.get('name');
	const list = (await servers.fetchCache()).result;

	const playerServers = list.servers.filter((server) =>
		server.info.clients.some((client) => client.name == name)
	);

	if (playerServers.length < 5) {
		return json(
			playerServers.map((server) => ({
				name: server.info.name,
				addresses: server.addresses
			}))
		);
	}

	const cnServers = playerServers.filter((server) => server.location == 'as:cn');

	if (cnServers.length > 0 && cnServers.length < 5) {
		return json(
			cnServers.map((server) => ({
				name: server.info.name,
				addresses: server.addresses
			}))
		);
	}

	return error(400, 'Indecisive');
};
