import { formatNumber } from '$lib/helpers';
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

	const allServers = json.servers.filter((server) => !server.type.startsWith('master'));
	const servers = allServers.filter((server) => server.name.startsWith('CHN'));
	const otherServers = allServers.filter((server) => !server.name.startsWith('CHN'));
	const upServer = otherServers.filter((server) => server.online4 || server.online6);
	const attackedServers = upServer.filter(
		(server) => (server.packets_rx || 0) > 275000 || (server.packets_tx || 0) > 300000
	);
	const attackedRegions = attackedServers.reduce(
		(set, server) => set.add(server.name.slice(0, 3)),
		new Set<string>()
	);

	let otherText = `外服正常服务器数量：${upServer.length - attackedServers.length} / ${otherServers.length}`;
	if (attackedServers.length > 0) {
		otherText += `(${Array.from(attackedRegions.values()).join(',')} 正在被攻击 ⚔️)`;
	}

	await reply.text(
		servers
			.map((server) => {
				const loadPercent = Math.round((server.load || 0) * 100);
				const packet = (server.packets_rx || 0) + (server.packets_tx || 0);
				let packetText = formatNumber(packet, { maxFractionDigits: 0, unit: 'pps' });
				let uploadText = formatNumber(server.network_tx || 0, {
					maxFractionDigits: 1
				});
				let downloadText = formatNumber(server.network_rx || 0, {
					maxFractionDigits: 1
				});

				if (!server.uptime || (!server.online4 && !server.online6)) {
					return `🪦 [${server.name}]\t已失联`;
				} else if ((server.packets_rx || 0) > 275000 || (server.packets_tx || 0) > 300000) {
					return `⚔️ [${server.name}]\t负载 ${loadPercent}%\t数据 ${uploadText}↑/${downloadText}↓ (${packetText})\t疑似被攻击`;
				} else if (loadPercent > 100) {
					return `🔥 [${server.name}]\t负载 ${loadPercent}%\t数据 ${uploadText}↑/${downloadText}↓ (${packetText})\t高负载`;
				} else {
					return `✅ [${server.name}]\t负载 ${loadPercent}%\t数据 ${uploadText}↑/${downloadText}↓ (${packetText})\t在线`;
				}
			})
			.join('\n') + `\n${otherText}\n数据有时效性，不保证完全准确`
	);
};
