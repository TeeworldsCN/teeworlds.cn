<script lang="ts">
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import ToolboxButton from '$lib/components/ToolboxButton.svelte';
	import { type Permission } from '$lib/types.js';

	const { data } = $props();

	const hasPermission = (perm: Permission) =>
		(data.user?.data?.permissions || []).some(
			(permission) => permission == perm || permission == 'SUPER'
		);
</script>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'TeeworldsCN' },
		{ text: '管理工具', title: '管理工具' }
	]}
/>

{#if hasPermission('SUPER')}
	<div class="mt-6">
		<ToolboxButton href="/admin/users">用户管理</ToolboxButton>
		<div class="text-semibold">管理用户和权限</div>
	</div>

	<div class="mt-6">
		<ToolboxButton href="/admin/posts">文章管理</ToolboxButton>
		<div class="text-semibold">管理网站文章内容</div>
	</div>

	<div class="mt-6">
		<ToolboxButton href="/admin/subs">订阅管理</ToolboxButton>
		<div class="text-semibold">管理机器人自动发布消息的订阅功能</div>
	</div>

	<div class="mt-6">
		<ToolboxButton href="/admin/wechat-menu">微信菜单管理</ToolboxButton>
		<div class="text-semibold">管理微信公众号的自定义菜单</div>
	</div>

	<div class="mt-6">
		<ToolboxButton href="/admin/wechat-materials">微信素材管理</ToolboxButton>
		<div class="text-semibold">管理微信公众号的永久素材</div>
	</div>

	<div class="mt-6">
		<ToolboxButton href="/admin/bot-replies">机器人关键词回复</ToolboxButton>
		<div class="text-semibold">管理机器人关键词自动回复功能</div>
	</div>
{/if}


{#if hasPermission('POSTING')}
	<div class="mt-6">
		<ToolboxButton href="/admin/qq-threads">QQ 机器人发帖</ToolboxButton>
		<div class="text-semibold">使用机器人在 QQ 频道发布帖子</div>
	</div>
{/if}

{#if hasPermission('CHANNEL_SETTINGS')}
	<div class="mt-6">
		<ToolboxButton href="/admin/roles">角色管理</ToolboxButton>
		<div class="text-semibold">管理频道中的角色</div>
	</div>
{/if}
