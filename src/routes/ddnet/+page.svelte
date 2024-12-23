<script lang="ts">
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import ToolboxButton from '$lib/components/ToolboxButton.svelte';
</script>

<Breadcrumbs breadcrumbs={[{ href: '/', text: '首页' }, { text: 'DDNet' }]} />

<div class="mt-8">
	<ToolboxButton href="/ddnet/maps/">查询地图</ToolboxButton>
	<div class="text-semibold text-2xl">查找 DDNet 官方地图</div>
</div>
