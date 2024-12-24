<script lang="ts">
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import ToolboxButton from '$lib/components/ToolboxButton.svelte';
</script>

<Breadcrumbs breadcrumbs={[{ href: '/', text: '首页' }, { text: 'DDNet' }]} />

<div class="mt-8">
	<ToolboxButton href="/ddnet/players/">查看排名</ToolboxButton>
	<div class="text-semibold text-2xl">查看 DDNet 排名与玩家分数</div>
</div>

<div class="mt-8">
	<ToolboxButton href="/ddnet/maps/">查询地图</ToolboxButton>
	<div class="text-semibold text-2xl">查找 DDNet 官方地图</div>
</div>

<div class="mt-8">
	<ToolboxButton href="/link/?ref={encodeURIComponent("https://wiki.ddnet.org/wiki/Main_Page/zh")}">中文 Wiki</ToolboxButton>
	<div class="text-semibold text-2xl">详细教程与操作指南</div>
</div>
