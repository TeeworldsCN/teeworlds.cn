<script>
	import ToolboxButton from '$lib/components/ToolboxButton.svelte';

	const { data } = $props();

	const isAdmin = $derived(() =>
		(data.user?.data?.permissions || []).some(
			(permission) => permission == 'SUPER' || permission.endsWith('_ADMIN')
		)
	);
</script>

<h1 class="text-md">TeeworldsCN 是由个人开发的 Teeworlds 信息查询工具箱</h1>

<div class="mt-6">
	<ToolboxButton href="/ddnet">DDNet 工具箱</ToolboxButton>
	<div class="text-semibold">查询 DDraceNetwork 相关信息</div>
</div>

{#if isAdmin()}
	<div class="mt-6">
		<ToolboxButton href="/admin">管理工具</ToolboxButton>
		<div class="text-semibold">管理员你好，点这里使用管理工具</div>
	</div>
{/if}

<div class="mt-6">
	<ToolboxButton href="https://chat.teeworlds.cn" newTab>加入社区</ToolboxButton>
	<div class="text-semibold">加入社区获取游戏动态与活动消息</div>
</div>
