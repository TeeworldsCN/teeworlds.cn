import type { RequestHandler } from './$types';
import { gameInfo, servers } from '$lib/server/fetches/servers';
import { error, json } from '@sveltejs/kit';
import { primaryAddress } from '$lib/ddnet/helpers';

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

export const POST: RequestHandler = async ({ request, url }) => {
	try {
		const body = await request.json();

		// Validate the request body structure
		if (!Array.isArray(body)) {
			return error(400, 'Request body must be an array of player search criteria');
		}

		// Validate each player search criteria
		for (const criteria of body) {
			if (!criteria.name || typeof criteria.name !== 'string') {
				return error(400, 'Each player criteria must have a name field');
			}
			if (criteria.clan !== undefined && typeof criteria.clan !== 'string') {
				return error(400, 'Clan field must be a string if provided');
			}
			if (criteria.region !== undefined && typeof criteria.region !== 'string') {
				return error(400, 'Region field must be a string if provided');
			}
		}

		let list = (await servers.fetchCache()).result;
		const community = url.searchParams.get('community');
		if (community) {
			const info = await gameInfo.fetchCache();

			// Set up community server lists
			const ddnet = info.result.communities.find((c) => c.id === 'ddnet');
			if (ddnet) ddnet.icon.servers = info.result.servers;
			const kog = info.result.communities.find((c) => c.id === 'kog');
			if (kog) kog.icon.servers = info.result['servers-kog'];

			// Find the target community
			const targetCommunity = info.result.communities.find((c) => c.id === community);
			if (!targetCommunity) {
				return error(400, `Community '${community}' not found`);
			}

			// Get all IP addresses for this community
			const communityIPs = new Set<string>();
			if (targetCommunity.icon.servers) {
				for (const server of targetCommunity.icon.servers) {
					for (const serverList of Object.values(server.servers)) {
						for (const ip of serverList) {
							communityIPs.add(ip);
						}
					}
				}
			}

			// Filter servers to only include those from the specified community
			list = {
				servers: list.servers.filter((server) => {
					const ip = primaryAddress(server.addresses);
					return communityIPs.has(ip);
				})
			};
		}

		const results = [];

		// Search for each player criteria
		for (const criteria of body) {
			const matchingServers = list.servers
				.map((server) => {
					// Check region match if provided
					if (criteria.region !== undefined) {
						if (!server.location || !server.location.startsWith(criteria.region)) {
							return false;
						}
					}

					// Find clients that match the name
					const matchingClients = server.info.clients.filter((client) => {
						// Check name match
						if (client.name !== criteria.name) {
							return false;
						}

						// Check clan match if provided
						if (criteria.clan !== undefined && client.clan !== criteria.clan) {
							return false;
						}

						return true;
					});

					// If no matching clients, skip this server
					if (matchingClients.length === 0) {
						return false;
					}

					const client = matchingClients[0];

					return {
						server: {
							name: server.info.name,
							addresses: primaryAddress(server.addresses),
							location: server.location,
							game_type: server.info.game_type,
							map: server.info.map.name
						},
						client: {
							name: client.name,
							clan: client.clan,
							skin: client.skin
						}
					};
				})
				.filter((server) => server !== false);

			results.push(...matchingServers);
		}
		return json(results);
	} catch (err) {
		console.error('Error in POST /api/find:', err);
		return error(500, 'Internal server error');
	}
};
