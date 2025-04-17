<script lang="ts">
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import ToolboxButton from '$lib/components/ToolboxButton.svelte';
</script>

<svelte:head>
	<meta property="og:title" content="DDNet 工具箱 - TeeworldsCN" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://teeworlds.cn/ddnet" />
	<meta property="og:description" content="DDraceNetwork 信息查询工具，包括玩家排名、地图、服务器和皮肤" />
	<meta property="og:image" content="https://teeworlds.cn/shareicon.png" />
	<meta name="title" content="DDNet 工具箱 - TeeworldsCN" />
	<meta name="description" content="DDraceNetwork 信息查询工具，包括玩家排名、地图、服务器和皮肤" />
</svelte:head>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'Teeworlds 中文社区' },
		{ text: 'DDNet', title: 'DDNet 工具箱' }
	]}
/>

<div class="mt-8">
	<ToolboxButton href="/ddnet/players">查看排名</ToolboxButton>
	<div class="text-semibold text-2xl">查看 DDNet 排名与玩家分数</div>
</div>

<div class="mt-8">
	<ToolboxButton href="/ddnet/maps">查询地图</ToolboxButton>
	<div class="text-semibold text-2xl">查找 DDNet 官方地图</div>
</div>

<div class="mt-8">
	<ToolboxButton href="/ddnet/servers">服务器列表</ToolboxButton>
	<div class="text-semibold text-2xl">显示 DDNet 服务器列表</div>
</div>

<div class="mt-8">
	<ToolboxButton href="/ddnet/skins">皮肤列表</ToolboxButton>
	<div class="text-semibold text-2xl">浏览和复制 DDNet 皮肤</div>
</div>

<div class="mt-8">
	<ToolboxButton href="/link/?ref={encodeURIComponent('https://wiki.ddnet.org/wiki/Main_Page/zh')}"
		>中文 Wiki</ToolboxButton
	>
	<div class="text-semibold text-2xl">详细教程与操作指南</div>
</div>

<div class="mt-8">
	<ToolboxButton href="/link/?ref={encodeURIComponent('https://ddnet.org/')}"
		>DDNet 官网</ToolboxButton
	>
	<div class="text-semibold text-2xl">前往 DDraceNetwork 官方网站</div>
</div>
