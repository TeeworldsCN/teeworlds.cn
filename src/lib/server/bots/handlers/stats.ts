import { formatNumber } from '$lib/helpers';
import type { Handler } from '../protocol/types';
import { statsErrorMarkdown, statsMarkdown, type StatsServer } from '../markdown';

export const handleStats: Handler = async ({ reply }) => {
	const data = await fetch('https://ddnet.org/status/json/stats.json');
	if (!data.ok) {
		return await reply.markdown(statsErrorMarkdown());
	}

	const json = (await data.json()) as {
		servers: {
			name: string;
			type: string;
			location: string;
			online4: boolean;
			online6: boolean;
			uptime?: number;
			load?: number;
			network_rx?: number;
			network_tx?: number;
			packets_rx?: number;
			packets_tx?: number;
			cpu?: number;
			memory_total?: number;
			memory_used?: number;
			swap_total?: number;
			swap_used?: number;
			hdd_total?: number;
			hdd_used?: number;
		}[];
	};

	const allServers = json.servers.filter((server) => !server.type.startsWith('master'));
	const servers = allServers.filter((server) => server.name.startsWith('CHN'));
	const otherServers = allServers.filter((server) => !server.name.startsWith('CHN'));
	const upServer = otherServers.filter((server) => server.online4 || server.online6);
	const attackedServers = upServer.filter(
		(server) => (server.packets_rx || 0) > 150000 || (server.packets_tx || 0) > 150000
	);

	const chnServers: StatsServer[] = servers.map((server) => {
		const online = !!server.uptime && (server.online4 || server.online6);
		if (!online) {
			return { name: server.name, online: false };
		}

		const load = Math.round((server.load || 0) * 100);
		const packet = (server.packets_rx || 0) + (server.packets_tx || 0);

		return {
			name: server.name,
			online: true,
			attacked: packet > 150000,
			highLoad: load > 100,
			load,
			packet: formatNumber(packet, { maxFractionDigits: 0, unit: 'pps' }),
			upload: formatNumber(server.network_tx || 0, { maxFractionDigits: 1 }),
			download: formatNumber(server.network_rx || 0, { maxFractionDigits: 1 })
		};
	});

	await reply.markdown(
		statsMarkdown(chnServers, {
			total: otherServers.length,
			up: upServer.length,
			attacked: attackedServers.map((server) => ({
				name: server.name,
				packet: formatNumber((server.packets_rx || 0) + (server.packets_tx || 0), {
					maxFractionDigits: 0,
					unit: 'pps'
				})
			}))
		})
	);
};
