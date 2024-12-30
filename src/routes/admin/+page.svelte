<script lang="ts">
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import ToolboxButton from '$lib/components/ToolboxButton.svelte';

	const { data } = $props();

	const hasPermission = $derived((perm: string) =>
		(data.user?.data?.permissions || []).some(
			(permission) => permission == perm || permission == 'SUPER'
		)
	);
</script>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'Teeworlds 中文社区' },
		{ text: '管理工具', title: '管理工具' }
	]}
/>

{#if hasPermission('SUPER')}
	<div class="mt-8">
		<ToolboxButton href="/admin/subs">订阅管理</ToolboxButton>
		<div class="text-semibold text-2xl">管理机器人自动发布消息的订阅功能</div>
	</div>
{/if}
