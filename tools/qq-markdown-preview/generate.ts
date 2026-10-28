/**
 * 本地生成 QQ 机器人指令 markdown 预览。
 * 用法: bun run tools/qq-markdown-preview/generate.ts
 * 输出 preview.html 与脚本同目录，该文件已加入 .gitignore，不随站点发布。
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';
import {
	bindErrorMarkdown,
	bindMissingMarkdown,
	bindRemovedMarkdown,
	bindSuccessMarkdown,
	deleteUserMarkdown,
	donateMarkdown,
	errorMarkdown,
	findMarkdown,
	findMissingMarkdown,
	findOfflineMarkdown,
	helpMarkdown,
	identityMarkdown,
	mapEmptyMarkdown,
	mapMarkdown,
	mapMissingMarkdown,
	mapNotFoundMarkdown,
	noticeMarkdown,
	pointsErrorMarkdown,
	pointsMarkdown,
	pointsMissingMarkdown,
	pointsNotFoundMarkdown,
	rateLimitMarkdown,
	registerLinkMarkdown,
	resetPasswordMarkdown,
	statsErrorMarkdown,
	statsMarkdown,
	successMarkdown,
	toolboxMarkdown,
	usageMarkdown
} from '../../src/lib/server/bots/markdown';
import { escapeMarkdown, markdownToText } from '../../src/lib/server/bots/utils/markdown';

const md = new MarkdownIt({ html: false, linkify: true, breaks: false });

// 预览页直接用 ddnet.org 源图；机器人实际发送的是 convert() 后的 teeworlds.cn/api/img 代理地址。
const MAP_IMAGE = 'https://ddnet.org/ranks/maps/Midsummer_Night.png';
const RANDOM_MAP_IMAGE = 'https://ddnet.org/ranks/maps/Just_DoubleJump.png';
const TOOLBOX_URL = 'https://teeworlds.cn/ddnet';
const POINTS_URL = 'https://teeworlds.cn/goto#pTsFreddie';
const MAP_URL = 'https://teeworlds.cn/goto#mMidsummer%20Night';
const FIND_URL = 'https://teeworlds.cn/goto#sAAAAAA';

type Sample = {
	id: string;
	group: string;
	command: string;
	title: string;
	markdown: string;
};

const samples: Sample[] = [
	{
		id: 'help',
		group: 'query',
		command: '/帮助',
		title: '帮助菜单',
		markdown: helpMarkdown('/', TOOLBOX_URL)
	},
	{
		id: 'points',
		group: 'query',
		command: '/分数',
		title: '玩家分数与排位',
		markdown: pointsMarkdown(
			'TsFreddie',
			[
				{ label: '🌎 里程', points: 123456, rank: 1234 },
				{ label: '📅 近年里程', points: 2345, rank: 5678 },
				{ label: '👤 个人排位', points: 1234, rank: 234 },
				{ label: '👥 团队排位', points: 555, rank: 999 },
				{ label: '🇨🇳 国服个人排位', points: 4321, rank: 12 },
				{ label: '🇨🇳 国服团队排位', points: 222, rank: 45 }
			],
			POINTS_URL
		)
	},
	{
		id: 'points-missing',
		group: 'query',
		command: '/分数',
		title: '缺少玩家名',
		markdown: pointsMissingMarkdown('/', 'https://teeworlds.cn/goto#p')
	},
	{
		id: 'points-error',
		group: 'query',
		command: '/分数',
		title: '数据异常',
		markdown: pointsErrorMarkdown()
	},
	{
		id: 'points-notfound',
		group: 'query',
		command: '/分数',
		title: '玩家不存在',
		markdown: pointsNotFoundMarkdown()
	},
	{
		id: 'points-no-rank',
		group: 'query',
		command: '/分数',
		title: '玩家暂无排位记录',
		markdown: pointsMarkdown(
			'Newbie',
			[
				{ label: '🌎 里程', points: 0, rank: 0 },
				{ label: '📅 近年里程', points: 0, rank: 0 }
			],
			'https://teeworlds.cn/goto#pNewbie'
		)
	},
	{
		id: 'map',
		group: 'query',
		command: '/地图',
		title: '地图详情（含缩略图与链接）',
		markdown: mapMarkdown(
			{
				name: 'Midsummer Night',
				mapper: 'pinfandsj',
				type: 'brutal',
				difficulty: 3,
				points: 24,
				thumbnail: MAP_IMAGE
			},
			{
				link: { label: '地图详情', url: MAP_URL }
			}
		)
	},
	{
		id: 'map-random',
		group: 'query',
		command: '/地图 -bru',
		title: '随机地图（引用 + 图片）',
		markdown: mapMarkdown(
			{
				name: 'Just DoubleJump',
				mapper: 'Tropo',
				type: 'solo',
				difficulty: 2,
				points: 8,
				thumbnail: RANDOM_MAP_IMAGE
			},
			{
				title: '🎲 随机地图',
				intro: '随机找了一张 TsFreddie 未完成的 单人 ★★☆☆☆ 图',
				link: {
					label: '查看所有 单人 ★★☆☆☆ 图',
					url: 'https://teeworlds.cn/goto#mstype=solo&diff=2'
				}
			}
		)
	},
	{
		id: 'map-missing',
		group: 'query',
		command: '/地图',
		title: '缺少地图名',
		markdown: mapMissingMarkdown('/', 'https://teeworlds.cn/goto#m')
	},
	{
		id: 'map-notfound',
		group: 'query',
		command: '/地图',
		title: '地图不存在',
		markdown: mapNotFoundMarkdown('Midsummer Nihgt')
	},
	{
		id: 'map-empty',
		group: 'query',
		command: '/地图 -ins 5',
		title: '筛选结果为空',
		markdown: mapEmptyMarkdown('疯狂 ★★★★★')
	},
	{
		id: 'find',
		group: 'query',
		command: '/找人',
		title: '玩家在线（带同名提醒）',
		markdown: findMarkdown({
			name: 'TsFreddie',
			server: 'CHN #1',
			gameType: 'DDNet',
			map: 'Midsummer Night',
			others: 1,
			self: true,
			url: FIND_URL
		})
	},
	{
		id: 'find-offline',
		group: 'query',
		command: '/找人',
		title: '玩家不在线',
		markdown: findOfflineMarkdown('TsFreddie')
	},
	{
		id: 'find-missing',
		group: 'query',
		command: '/找人',
		title: '缺少玩家名',
		markdown: findMissingMarkdown('/', 'https://teeworlds.cn/goto#s')
	},
	{
		id: 'stats',
		group: 'query',
		command: '/状态',
		title: '服务器状态（分组列表）',
		markdown: statsMarkdown(
			[
				{
					name: 'CHN #1',
					online: true,
					load: 23,
					upload: '1.2 MB/s',
					download: '3.4 MB/s',
					packet: '12.3k pps'
				},
				{
					name: 'CHN #2',
					online: true,
					attacked: true,
					load: 180,
					upload: '8.8 MB/s',
					download: '9.1 MB/s',
					packet: '210k pps'
				},
				{
					name: 'CHN #3',
					online: true,
					highLoad: true,
					load: 135,
					upload: '2.1 MB/s',
					download: '4.2 MB/s',
					packet: '18.7k pps'
				},
				{ name: 'CHN #4', online: false }
			],
			{
				total: 24,
				up: 18,
				attacked: [
					{ name: 'GER #2', packet: '210k pps' },
					{ name: 'USA #1', packet: '180k pps' }
				]
			}
		)
	},
	{
		id: 'stats-error',
		group: 'query',
		command: '/状态',
		title: '状态查询失败',
		markdown: statsErrorMarkdown()
	},
	{
		id: 'bind',
		group: 'social',
		command: '/绑定',
		title: '绑定成功',
		markdown: bindSuccessMarkdown('TsFreddie')
	},
	{
		id: 'bind-removed',
		group: 'social',
		command: '/绑定',
		title: '已解绑',
		markdown: bindRemovedMarkdown('TsFreddie')
	},
	{
		id: 'bind-missing',
		group: 'social',
		command: '/绑定',
		title: '缺少玩家名',
		markdown: bindMissingMarkdown('/', 'https://teeworlds.cn/goto#p')
	},
	{
		id: 'bind-error',
		group: 'social',
		command: '/绑定',
		title: '绑定失败',
		markdown: bindErrorMarkdown()
	},
	{
		id: 'donate',
		group: 'social',
		command: '/赞助',
		title: '赞助渠道',
		markdown: donateMarkdown('https://teeworlds.cn/goto#donate')
	},
	{
		id: 'toolbox',
		group: 'social',
		command: '/工具箱',
		title: '工具箱入口',
		markdown: toolboxMarkdown(TOOLBOX_URL)
	},
	{
		id: 'uid',
		group: 'social',
		command: '/__uid__',
		title: '查询 UID',
		markdown: identityMarkdown('你的 UID', 'qq:7A3B9C1D5E2F4A6B8C0D1E3F5A7B9C2D')
	},
	{
		id: 'gid',
		group: 'social',
		command: '/__gid__',
		title: '查询 GID',
		markdown: identityMarkdown('这里的 GID', 'B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5')
	},
	{
		id: 'rate-limit',
		group: 'social',
		command: '（系统）',
		title: '群聊频率限制',
		markdown: rateLimitMarkdown(TOOLBOX_URL)
	},
	{
		id: 'register',
		group: 'account',
		command: '/register',
		title: '注册链接（autolink）',
		markdown: registerLinkMarkdown('https://teeworlds.cn/login/register?token=abc_def-ghi_jkl')
	},
	{
		id: 'reset',
		group: 'account',
		command: '/reset-pw',
		title: '重置密码链接',
		markdown: resetPasswordMarkdown('https://teeworlds.cn/login/reset?token=xyz_123-456')
	},
	{
		id: 'delete-user',
		group: 'account',
		command: '/delete-user',
		title: '删除用户',
		markdown: deleteUserMarkdown('TsFreddie')
	},
	{
		id: 'register-group-error',
		group: 'account',
		command: '/register',
		title: '群聊中禁止注册',
		markdown: errorMarkdown('请不要在群里生成注册链接。')
	},
	{
		id: 'admin-perm-add',
		group: 'admin',
		command: '/perm-add',
		title: '添加权限',
		markdown: successMarkdown(
			'Permission **REGISTER** has been given to **qq:7A3B9C1D5E2F4A6B8C0D1E3F5A7B9C2D**'
		)
	},
	{
		id: 'admin-perm-check',
		group: 'admin',
		command: '/perm',
		title: '查询权限',
		markdown: noticeMarkdown(
			'🔐 权限查询',
			'User **qq:7A3B9C1D5E2F4A6B8C0D1E3F5A7B9C2D** has permission **REGISTER**, **SUPER**'
		)
	},
	{
		id: 'admin-perm-remove',
		group: 'admin',
		command: '/perm-rm',
		title: '移除权限',
		markdown: successMarkdown(
			'All permissions have been removed from **qq:7A3B9C1D5E2F4A6B8C0D1E3F5A7B9C2D**'
		)
	},
	{
		id: 'admin-perm-empty',
		group: 'admin',
		command: '/perm',
		title: '没有权限',
		markdown: noticeMarkdown(
			'🔐 权限查询',
			'User **qq:7A3B9C1D5E2F4A6B8C0D1E3F5A7B9C2D** has no permission.'
		)
	},
	{
		id: 'admin-usage',
		group: 'admin',
		command: '/perm-add',
		title: '用法提示',
		markdown: usageMarkdown('/perm-add uid permission')
	},
	{
		id: 'admin-allow-link',
		group: 'admin',
		command: '/allow-link',
		title: '允许链接',
		markdown: successMarkdown('已允许机器人在本群查询链接')
	},
	{
		id: 'admin-rate-limit',
		group: 'admin',
		command: '/rate-limit',
		title: '限制频率',
		markdown: successMarkdown('已限制群组中机器人的查询频率')
	},
	{
		id: 'admin-token',
		group: 'admin',
		command: '/wechat-token',
		title: 'WeChat Access Token',
		markdown: noticeMarkdown(
			'🔑 WeChat Access Token',
			escapeMarkdown('eyJhbGciOiJIUzI1NiJ9.eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9_abc_def')
		)
	},
	{
		id: 'admin-error',
		group: 'admin',
		command: '/allow-link',
		title: '仅群聊可用',
		markdown: errorMarkdown('仅支持在群里设置')
	}
];

const groups = [
	{
		id: 'query',
		label: '查询类',
		blurb: '玩家分数、地图、找人和服务器状态；包含图片、引用、列表与链接。'
	},
	{
		id: 'social',
		label: '社交与账号',
		blurb: '绑定、赞助、工具箱、身份查询和频率限制提示。'
	},
	{
		id: 'account',
		label: '注册相关',
		blurb: '私聊中发送注册/重置链接；链接使用 autolink，避免 token 里的下划线被当成强调。'
	},
	{
		id: 'admin',
		label: '管理指令',
		blurb: '权限、链接开关、频率限制和微信 token；统一使用成功/用法/错误卡片。'
	}
];

const escapeHtml = (text: string) =>
	text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const renderGroup = (group: (typeof groups)[number]) => {
	const items = samples.filter((sample) => sample.group === group.id);
	if (items.length === 0) return '';

	const cards = items
		.map((sample) => {
			const rendered = md.render(sample.markdown);
			const plain = markdownToText(sample.markdown);
			return `<article class="card" id="${sample.id}">
	<header class="card-head">
		<div class="card-title">
			<span class="command">${escapeHtml(sample.command)}</span>
			<h3>${escapeHtml(sample.title)}</h3>
		</div>
		<button class="copy" type="button" data-copy="${sample.id}-src">复制 Markdown</button>
	</header>
	<div class="panes">
		<section class="pane preview">
			<div class="pane-label">QQ 内效果</div>
			<div class="bubble markdown-body">${rendered}</div>
		</section>
		<section class="pane source">
			<div class="pane-label">Markdown 源</div>
			<pre class="code" id="${sample.id}-src"><code>${escapeHtml(sample.markdown)}</code></pre>
			<details class="fallback">
				<summary>纯文本回退（微信 / 频道）</summary>
				<pre class="code"><code>${escapeHtml(plain)}</code></pre>
			</details>
		</section>
	</div>
</article>`;
		})
		.join('\n');

	return `<section class="group" id="group-${group.id}">
	<div class="group-head">
		<div>
			<h2>${group.label}</h2>
			<p>${group.blurb}</p>
		</div>
		<span class="count">${items.length} 条</span>
	</div>
	<div class="cards">${cards}</div>
</section>`;
};

const nav = groups.map((group) => `<a href="#group-${group.id}">${group.label}</a>`).join('');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>QQ 机器人指令 Markdown 预览 · DDNet 豆豆</title>
<style>
:root {
	color-scheme: dark;
	--bg: #080c14;
	--panel: #111827;
	--panel-2: #151f2f;
	--text: #e6edf7;
	--muted: #8fa1ba;
	--accent: #4cc2ff;
	--accent-2: #7ef0c0;
	--border: #243247;
	--bubble: #202938;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
	margin: 0;
	background:
		radial-gradient(1200px 600px at 10% -10%, rgba(76, 194, 255, .14), transparent 60%),
		radial-gradient(900px 500px at 95% 0%, rgba(126, 240, 192, .08), transparent 55%),
		var(--bg);
	color: var(--text);
	font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, -apple-system, sans-serif;
	line-height: 1.6;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.hero {
	max-width: 1380px;
	margin: 0 auto;
	padding: 56px 28px 20px;
}
.hero-top { display: flex; align-items: center; gap: 12px; justify-content: space-between; }
.eyebrow { margin: 0; color: var(--accent-2); font-size: 13px; letter-spacing: .16em; text-transform: uppercase; }
.badge {
	border: 1px solid rgba(76, 194, 255, .35);
	background: rgba(76, 194, 255, .08);
	color: var(--accent);
	border-radius: 999px;
	padding: 5px 12px;
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 12px;
}
.hero h1 {
	margin: 18px 0 10px;
	font-size: clamp(30px, 4.5vw, 52px);
	line-height: 1.1;
	letter-spacing: -.03em;
}
.lede { margin: 0; max-width: 780px; color: var(--muted); font-size: 16px; }
.meta { display: flex; flex-wrap: wrap; gap: 18px; margin-top: 18px; color: var(--muted); font-size: 13px; }
.toc {
	position: sticky;
	top: 0;
	z-index: 20;
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
	max-width: 1380px;
	margin: 18px auto 0;
	padding: 12px 28px;
	background: rgba(8, 12, 20, .82);
	backdrop-filter: blur(14px);
	border-bottom: 1px solid rgba(36, 50, 71, .7);
}
.toc a {
	color: var(--muted);
	border: 1px solid var(--border);
	border-radius: 999px;
	padding: 5px 12px;
	font-size: 13px;
}
.toc a:hover { color: var(--text); border-color: var(--accent); text-decoration: none; }
main { max-width: 1380px; margin: 0 auto; padding: 8px 28px 80px; }
.syntax {
	margin-top: 24px;
	padding: 22px 24px;
	background: linear-gradient(180deg, rgba(21, 31, 47, .95), rgba(17, 24, 39, .95));
	border: 1px solid var(--border);
	border-radius: 18px;
}
.syntax h2 { margin: 0 0 6px; font-size: 20px; }
.syntax p { margin: 0; color: var(--muted); }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.chip {
	border: 1px solid var(--border);
	background: rgba(8, 12, 20, .55);
	border-radius: 10px;
	padding: 8px 11px;
	font-size: 13px;
	color: #cfe0f4;
}
.chip b { color: var(--accent); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 600; }
.warn {
	margin-top: 16px !important;
	padding: 10px 12px;
	border-left: 3px solid #f5b544;
	background: rgba(245, 181, 68, .07);
	color: #e8c98b !important;
	border-radius: 0 8px 8px 0;
	font-size: 13px;
}
.group { margin-top: 46px; scroll-margin-top: 84px; }
.group-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; margin-bottom: 16px; }
.group-head h2 { margin: 0; font-size: 26px; letter-spacing: -.02em; }
.group-head p { margin: 4px 0 0; color: var(--muted); font-size: 14px; max-width: 760px; }
.count { color: var(--muted); font-size: 12px; border: 1px solid var(--border); border-radius: 999px; padding: 4px 10px; white-space: nowrap; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(620px, 1fr)); gap: 20px; }
.card {
	background: linear-gradient(180deg, rgba(21, 31, 47, .98), rgba(13, 19, 30, .98));
	border: 1px solid var(--border);
	border-radius: 18px;
	overflow: hidden;
	box-shadow: 0 24px 60px rgba(0, 0, 0, .22);
}
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 16px 18px; border-bottom: 1px solid var(--border); }
.card-title { min-width: 0; }
.command { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--accent); font-size: 12px; }
.card-title h3 { margin: 3px 0 0; font-size: 16px; line-height: 1.35; }
.copy {
	border: 1px solid rgba(76, 194, 255, .35);
	background: rgba(76, 194, 255, .08);
	color: var(--accent);
	border-radius: 9px;
	padding: 7px 11px;
	font-size: 12px;
	cursor: pointer;
	white-space: nowrap;
}
.copy:hover { background: rgba(76, 194, 255, .16); }
.panes { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.pane { min-width: 0; padding: 16px; }
.preview { background: rgba(8, 12, 20, .35); }
.source { background: rgba(8, 12, 20, .62); border-left: 1px solid var(--border); }
.pane-label {
	margin-bottom: 10px;
	color: var(--muted);
	font-size: 11px;
	letter-spacing: .12em;
	text-transform: uppercase;
}
.bubble {
	background: var(--bubble);
	border: 1px solid rgba(255, 255, 255, .04);
	border-radius: 14px;
	padding: 16px 18px;
	font-size: 15px;
	line-height: 1.72;
	overflow-wrap: anywhere;
}
.code {
	margin: 0;
	padding: 14px;
	background: #070b12;
	border: 1px solid var(--border);
	border-radius: 10px;
	color: #c9d8ec;
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 12px;
	line-height: 1.65;
	white-space: pre-wrap;
	word-break: break-word;
	max-height: 420px;
	overflow: auto;
}
.fallback { margin-top: 12px; }
.fallback summary { cursor: pointer; color: var(--muted); font-size: 12px; }
.fallback .code { margin-top: 10px; color: #9fb2c9; }
.markdown-body h1, .markdown-body h2, .markdown-body h3 { line-height: 1.3; margin: 0 0 10px; }
.markdown-body h1 { font-size: 23px; letter-spacing: -.02em; }
.markdown-body h2 { font-size: 19px; }
.markdown-body h3 { font-size: 16px; }
.markdown-body p { margin: 0 0 11px; }
.markdown-body p:last-child { margin-bottom: 0; }
.markdown-body ul, .markdown-body ol { margin: 8px 0 12px; padding-left: 22px; }
.markdown-body li { margin: 4px 0; }
.markdown-body strong { color: #fff; }
.markdown-body em { color: #cfe6ff; }
.markdown-body blockquote {
	margin: 10px 0 14px;
	padding: 9px 13px;
	border-left: 3px solid var(--accent);
	background: rgba(76, 194, 255, .08);
	color: #cfe0f4;
	border-radius: 0 8px 8px 0;
}
.markdown-body blockquote p { margin: 0; }
.markdown-body img { display: block; max-width: 100%; height: auto; margin: 10px 0 14px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, .08); }
.markdown-body hr { border: 0; border-top: 1px solid var(--border); margin: 14px 0; }
.markdown-body a { color: var(--accent); }
footer { max-width: 1380px; margin: 0 auto; padding: 0 28px 48px; color: var(--muted); font-size: 12px; }
@media (max-width: 980px) {
	.cards { grid-template-columns: 1fr; }
	.panes { grid-template-columns: 1fr; }
	.source { border-left: 0; border-top: 1px solid var(--border); }
}
@media (max-width: 640px) {
	.hero, .toc, main, footer { padding-left: 16px; padding-right: 16px; }
	.hero { padding-top: 32px; }
	.group-head { align-items: flex-start; flex-direction: column; gap: 8px; }
	.bubble { font-size: 14px; }
}
</style>
</head>
<body>
<header class="hero">
	<div class="hero-top">
		<p class="eyebrow">DDNet 豆豆 · QQ Bot</p>
		<span class="badge">msg_type = 2</span>
	</div>
	<h1>指令回复 Markdown 预览</h1>
	<p class="lede">这里列出机器人所有指令回复的 markdown 排版。左侧模拟 QQ 内的渲染效果，右侧是实际发送的 markdown 源文本，并附上微信/频道的纯文本回退。</p>
	<div class="meta">
		<span>生成时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</span>
		<span>本地预览 · 不随站点发布</span>
		<a href="https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/type/markdown.html" target="_blank" rel="noreferrer">QQ 官方 Markdown 文档 ↗</a>
	</div>
</header>
<nav class="toc">${nav}</nav>
<main>
	<section class="syntax">
		<h2>使用的语法</h2>
		<p>只使用 QQ 官方文档列出的原生 markdown 能力，避免在手机端出现兼容问题。</p>
		<div class="chips">
			<span class="chip"><b>#</b> 标题</span>
			<span class="chip"><b>**粗体**</b></span>
			<span class="chip"><b>_斜体_</b></span>
			<span class="chip"><b>~~删除线~~</b></span>
			<span class="chip"><b>-</b> 无序列表</span>
			<span class="chip"><b>1.</b> 有序列表</span>
			<span class="chip"><b>&gt;</b> 引用</span>
			<span class="chip"><b>[文本](url)</b> 链接</span>
			<span class="chip"><b>![说明 #宽px #高px](url)</b> 图片</span>
			<span class="chip"><b>***</b> 分割线</span>
		</div>
		<p class="warn">未使用表格、代码块和 HTML：官方文档没有列出这些能力，部分 QQ 客户端也不支持。图片必须带 #宽px #高px 尺寸提示，否则 QQ 会显示 [说明] 文本。预览图使用 ddnet.org 上游原图；机器人实际发送的是 teeworlds.cn/api/img 代理 URL。</p>
	</section>
	${groups.map(renderGroup).join('\n')}
</main>
<footer>
	<p>预览使用 markdown-it 近似渲染，实际 QQ 客户端（安卓 / iOS / 桌面）的字体、间距和图片尺寸可能略有差异。</p>
	<p>生成脚本：<code>tools/qq-markdown-preview/generate.ts</code> · 模板：<code>src/lib/server/bots/markdown.ts</code></p>
</footer>
<script>
async function copyText(text) {
	if (navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {}
	}
	const area = document.createElement('textarea');
	area.value = text;
	document.body.appendChild(area);
	area.select();
	let ok = false;
	try {
		ok = document.execCommand('copy');
	} catch {}
	area.remove();
	return ok;
}

document.querySelectorAll('button[data-copy]').forEach((button) => {
	button.addEventListener('click', async () => {
		const target = document.getElementById(button.dataset.copy);
		if (!target) return;
		const text = target.textContent || '';
		const original = button.textContent;
		const ok = await copyText(text);
		button.textContent = ok ? '已复制' : '复制失败';
		setTimeout(() => (button.textContent = original), 1200);
	});
});
</script>
</body>
</html>`;

const outputPath = fileURLToPath(new URL('./preview.html', import.meta.url));
await writeFile(outputPath, html, 'utf8');
console.log(`Wrote ${outputPath} (${samples.length} samples, ${html.length} bytes)`);
