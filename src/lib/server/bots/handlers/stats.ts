import type { Handler } from '../protocol/types';

export const handleStats: Handler = async ({ reply }) => {
	const data = await fetch('https://ddnet.org/status/json/stats.json');
	if (!data.ok) {
		return await reply.text('服务器状态查询失败，可能为全局服务器故障。');
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

	const servers = json.servers.filter((server) => server.name.startsWith('CHN'));

	await reply.text(
		servers
			.map((server) => {
				const loadPercent = Math.round((server.load || 0) * 100);
				const packet = (server.packets_rx || 0) + (server.packets_tx || 0);
				let packetText = '';
				if (packet > 1000000) {
					packetText = `${Math.round(packet / 1000000)}m`;
				} else if (packet > 1000) {
					packetText = `${Math.round(packet / 1000)}k`;
				} else {
					packetText = `${packet}`;
				}

				if (!server.uptime || (!server.online4 && !server.online6)) {
					return `🪦 [${server.name}] 已失联`;
				} else if ((server.packets_rx || 0) > 275000 || (server.packets_tx || 0) > 300000) {
					return `⚔️ [${server.name}] 负载 ${loadPercent}% - 数据量 ${packetText} - 疑似被攻击`;
				} else if (loadPercent > 100) {
					return `🔥 [${server.name}] 负载 ${loadPercent}% - 数据量 ${packetText} - 高负载`;
				} else {
					return `✅ [${server.name}] 负载 ${loadPercent}% - 数据量 ${packetText} - 在线`;
				}
			})
			.join('\n') + '\n数据有时效性，不保证完全准确'
	);
};
