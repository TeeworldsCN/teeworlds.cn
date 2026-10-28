import { mapType, numberToStars } from '../../ddnet/helpers';
import { escapeMarkdown } from './utils/markdown';

export type MarkdownLink = {
	label: string;
	url: string;
};

export type MarkdownMap = {
	name: string;
	mapper?: string;
	type: string;
	difficulty: number;
	points: number;
	thumbnail?: string;
};

export type PointsRank = {
	label: string;
	points?: number;
	rank?: number;
};

export type FindResult = {
	name: string;
	server: string;
	gameType: string;
	map: string;
	others?: number;
	url: string;
	self?: boolean;
};

export type StatsServer = {
	name: string;
	online: boolean;
	attacked?: boolean;
	highLoad?: boolean;
	load?: number;
	upload?: string;
	download?: string;
	packet?: string;
};

export type StatsOther = {
	total: number;
	up: number;
	attacked: { name: string; packet: string }[];
};

export const helpMarkdown = (prefix: string, toolboxUrl: string) => `# 🫘 DDNet 豆豆

目前豆豆可以提供以下查询功能：

- **${prefix}分数** 玩家名 — 查询里程与分数
- **${prefix}地图** 地图名 — 查询地图
- **${prefix}找人** 玩家名 — 查询玩家在线状态
- **${prefix}状态** — 查询服务器运行状态
- **${prefix}绑定** 玩家名 — 绑定玩家名
- **${prefix}赞助** — 了解如何赞助服务器

更多功能请使用 DDNet 工具箱。

[🔗 打开 DDNet 工具箱](${toolboxUrl})`;

export const pointsMarkdown = (
	name: string,
	ranks: PointsRank[],
	detailUrl: string
) => `# 🏆 ${escapeMarkdown(name)}

> DDNet 全球排行数据

${ranks
	.map((rank) =>
		rank.rank
			? `- **${rank.label}**：${rank.points ?? 0} pts（第 ${rank.rank} 名）`
			: `- **${rank.label}**：无记录`
	)
	.join('\n')}

[🔗 查看玩家详情](${detailUrl})`;

export const pointsMissingMarkdown = (prefix: string, url: string) => `## 🏆 查分

请提供玩家名，例如：

- **${prefix}分数** 玩家名

也可以直接使用 [🔗 排名查询工具](${url})。`;

export const pointsErrorMarkdown = () => `## ⚠️ 查询失败

啊，豆豆的数据代码出问题了，快叫人来修复豆豆。`;

export const pointsNotFoundMarkdown = () => `## 🔍 未找到玩家

未找到相关的玩家信息。`;

export const mapMarkdown = (
	map: MarkdownMap,
	options: { title?: string; intro?: string; link?: MarkdownLink } = {}
) => {
	const title = options.title || '🗺️ 地图详情';
	const intro = options.intro ? `> ${options.intro}\n\n` : '';
	// QQ markdown 图片必须带尺寸提示，否则客户端会退化成 [说明] 文本。
	// DDNet 的 ranks/maps 缩略图统一为 360x225。
	const image = map.thumbnail ? `![地图缩略图 #360px #225px](${map.thumbnail})\n\n` : '';
	const link = options.link ? `[🔗 ${options.link.label}](${options.link.url})` : '';

	return `# ${title}

${intro}${image}## ${escapeMarkdown(map.name)}

- **作者**：${map.mapper ? escapeMarkdown(map.mapper) : '未知'}
- **类型**：${mapType(map.type)} ${numberToStars(map.difficulty)}
- **分数**：${map.points} pts

${link}`.trim();
};

export const mapMissingMarkdown = (prefix: string, url: string) => `## 🗺️ 查图

请提供地图名，例如：

- **${prefix}地图** 地图名
- **${prefix}地图** -nov 1 地图名

也可以直接使用 [🔗 地图查询工具](${url})。`;

export const mapNotFoundMarkdown = (name: string) => `## 🔍 未找到地图

没有找到名为 **${escapeMarkdown(name)}** 的地图。`;

export const mapEmptyMarkdown = (descriptor: string) => `## 😵 没有找到地图

${descriptor ? `不存在 ${descriptor} 图。` : '没有找到符合条件的地图。'}`;

export const findMarkdown = (result: FindResult) => `## 🔎 ${escapeMarkdown(result.name)} 正在游戏

- **服务器**：${escapeMarkdown(result.server)}
- **模式**：${escapeMarkdown(result.gameType)}
- **地图**：${escapeMarkdown(result.map)}

${result.others ? `> 另有 ${result.others} 个同名玩家在其他服务器，还请注意。\n\n` : ''}${
	result.self ? '快来加入吧！\n\n' : ''
}[🔗 查看服务器信息](${result.url})`;

export const findMissingMarkdown = (prefix: string, url: string) => `## 🔎 找人

请提供玩家名，例如：

- **${prefix}找人** 玩家名

也可以直接使用 [🔗 服务器列表](${url})。`;

export const findOfflineMarkdown = (name: string) => `## 💤 玩家不在线

玩家 **${escapeMarkdown(name)}** 似乎不在线。`;

export const statsMarkdown = (servers: StatsServer[], other: StatsOther) => {
	const lines = servers.map((server) => {
		const name = escapeMarkdown(server.name);
		if (!server.online) {
			return `- 🪦 **${name}** — 已失联`;
		}
		const icon = server.attacked ? '⚔️' : server.highLoad ? '🔥' : '✅';
		const state = server.attacked ? '疑似被攻击' : server.highLoad ? '高负载' : '在线';
		return `- ${icon} **${name}** — 负载 ${server.load ?? 0}% · ↑${server.upload ?? '0'} / ↓${server.download ?? '0'} · ${server.packet ?? '0'}（${state}）`;
	});

	const attacked = other.attacked.length
		? `\n\n**正在被攻击：**\n${other.attacked
				.map((server) => `- ⚔️ **${escapeMarkdown(server.name)}** — ${server.packet}`)
				.join('\n')}`
		: '';

	return `# 📡 DDNet 服务器状态

## 🇨🇳 国服

${lines.length ? lines.join('\n') : '- 暂无数据'}

## 🌍 外服

外服正常服务器数量：**${other.up - other.attacked.length} / ${other.total}**${attacked}

***
数据有时效性，不保证完全准确`;
};

export const statsErrorMarkdown = () => `## 📡 服务器状态

服务器状态查询失败，可能为全局服务器故障。`;

export const bindSuccessMarkdown = (name: string) => `## ✅ 绑定成功

已记住了你的游戏名 **${escapeMarkdown(name)}**，之后的查询会默认使用这个名字。`;

export const bindRemovedMarkdown = (name: string) => `## ✅ 已解绑

已解绑 **${escapeMarkdown(name)}**。`;

export const bindMissingMarkdown = (prefix: string, url: string) => `## 🔗 绑定

绑定名字请提供玩家名，例如：

- **${prefix}绑定** 玩家名

也可以直接使用 [🔗 排名查询工具](${url})。`;

export const bindErrorMarkdown = () => `## ⚠️ 绑定失败

豆豆好像出了点问题。。。豆豆也不知道该怎么办了。。。要不等下重试一下？`;

export const donateMarkdown = (url: string) => `# ❤️ 赞助 DDNet 官服

DDNet 官服由玩家赞助以支撑服务器成本。

[🔗 前往赞助渠道](${url})`;

export const registerLinkMarkdown = (url: string) => `# 🔐 注册链接

注册链接生成完成，有效期 **12 小时**，请发送给被邀请的人：

<${url}>

> 链接仅可使用一次，请勿公开分享。`;

export const resetPasswordMarkdown = (url: string) => `# 🔑 重置密码

重置密码链接生成完成，有效期 **12 小时**，请发送给需要重置密码的人：

<${url}>

> 链接仅可使用一次，请勿公开分享。`;

export const deleteUserMarkdown = (username: string) => `## 🗑️ 已删除用户

用户 **${escapeMarkdown(username)}** 已删除。`;

export const toolboxMarkdown = (url: string) => `## 🧰 DDNet 工具箱

[🔗 打开 DDNet 工具箱](${url})`;

export const identityMarkdown = (label: string, id: string) => `## 🪪 ${label}

**${escapeMarkdown(id)}**`;

export const rateLimitMarkdown = (url: string) => `## ⏳ 操作太频繁

请 **5 分钟** 后再试。需要大量查询请私聊豆豆。

[🔗 或者直接使用 DDNet 工具箱](${url})`;

export const noticeMarkdown = (title: string, body: string) => `## ${title}

${body}`;

export const successMarkdown = (body: string) => noticeMarkdown('✅ 操作成功', body);

export const errorMarkdown = (body: string) => noticeMarkdown('⚠️ 操作失败', body);

export const usageMarkdown = (usage: string) => noticeMarkdown('📖 用法', usage);
