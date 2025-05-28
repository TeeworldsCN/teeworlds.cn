<script lang="ts">
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import ToolboxButton from '$lib/components/ToolboxButton.svelte';
	import { type PERMISSIONS } from '$lib/types.js';

	const { data } = $props();

	const hasPermission = (perm: (typeof PERMISSIONS)[number]) =>
		(data.user?.data?.permissions || []).some(
			(permission) => permission == perm || permission == 'SUPER'
		);
</script>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'Teeworlds 中文社区' },
		{ text: '管理工具', title: '管理工具' }
	]}
/>

{#if hasPermission('SUPER')}
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
		<ToolboxButton href="/admin/tickets">反馈和举报管理</ToolboxButton>
		<div class="text-semibold">管理反馈和举报</div>
	</div>
{/if}

{#if hasPermission('CHANNEL_SETTINGS')}
	<div class="mt-6">
		<ToolboxButton href="/admin/roles">角色管理</ToolboxButton>
		<div class="text-semibold">管理频道中的角色</div>
	</div>
{/if}
