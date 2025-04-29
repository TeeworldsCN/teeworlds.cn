<script lang="ts">
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import ToolboxButton from '$lib/components/ToolboxButton.svelte';
	import { faFaceSmile, faGamepad, faGlobe, faInfo, faInfoCircle, faMap, faRankingStar, faServer } from '@fortawesome/free-solid-svg-icons';
	import Fa from 'svelte-fa';
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

<div class="mt-6">
	<ToolboxButton href="/ddnet/players"><Fa icon={faRankingStar} class="inline"></Fa> 排名查分</ToolboxButton>
	<div class="text-semibold">DDNet 排名与玩家分数</div>
</div>

<div class="mt-6">
	<ToolboxButton href="/ddnet/maps"><Fa icon={faMap} class="inline"></Fa> 查找地图</ToolboxButton>
	<div class="text-semibold">DDNet 官方地图列表</div>
</div>

<div class="mt-6">
	<ToolboxButton href="/ddnet/servers"><Fa icon={faServer} class="inline"></Fa> 服务器列表</ToolboxButton>
	<div class="text-semibold">DDNet 服务器列表</div>
</div>

<div class="mt-6">
	<ToolboxButton href="/ddnet/skins"><Fa icon={faFaceSmile} class="inline"></Fa> 皮肤列表</ToolboxButton>
	<div class="text-semibold">浏览和复制 DDNet 皮肤</div>
</div>

<div class="mt-6">
	<ToolboxButton href="/ddnet/nouis"><Fa icon={faGamepad} class="inline"></Fa> 合成超大Tee</ToolboxButton>
	<div class="text-semibold">游玩搞怪小游戏</div>
</div>

<div class="mt-6">
	<ToolboxButton href="/link/?ref={encodeURIComponent('https://wiki.ddnet.org/wiki/Main_Page/zh')}"
		><Fa icon={faInfoCircle} class="inline"></Fa> 中文 Wiki</ToolboxButton
	>
	<div class="text-semibold">详细教程与操作指南</div>
</div>

<div class="mt-6">
	<ToolboxButton href="/link/?ref={encodeURIComponent('https://ddnet.org/')}"
		><Fa icon={faGlobe} class="inline"></Fa> DDNet 官网</ToolboxButton
	>
	<div class="text-semibold">前往 DDraceNetwork 官方网站</div>
</div>
