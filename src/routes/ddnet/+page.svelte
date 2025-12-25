<script lang="ts">
	import { encodeBase64Url } from '$lib/base64url';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import ToolboxButton from '$lib/components/ToolboxButton.svelte';
	import LatestRecordsSidebar from '$lib/components/LatestRecordsSidebar.svelte';
	import {
		faFaceSmile,
		faGamepad,
		faGlobe,
		faHeart,
		faInfoCircle,
		faMap,
		faRankingStar,
		faServer
	} from '@fortawesome/free-solid-svg-icons';
	import Fa from 'svelte-fa';
</script>

<svelte:head>
	<meta property="og:title" content="DDNet 工具箱 - TeeworldsCN" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://teeworlds.cn/ddnet" />
	<meta
		property="og:description"
		content="DDraceNetwork 信息查询工具，包括玩家排名、地图、服务器和皮肤"
	/>
	<meta property="og:image" content="https://teeworlds.cn/shareicon.png" />
	<meta name="title" content="DDNet 工具箱 - TeeworldsCN" />
	<meta name="description" content="DDraceNetwork 信息查询工具，包括玩家排名、地图、服务器和皮肤" />
</svelte:head>

<div class="flex flex-col gap-6 sm:flex-row">
	<div class="flex-1">
		<Breadcrumbs
			breadcrumbs={[
				{ href: '/', text: '首页', title: 'TeeworldsCN' },
				{ text: 'DDNet 工具箱', title: 'DDNet 工具箱' }
			]}
		/>
		<div class="mt-4">
			<img src="/logos/ddnet.svg" alt="DDNet" class="h-14" />
		</div>

		<div class="mt-6">
			<ToolboxButton href="/ddnet/players"
				><Fa icon={faRankingStar} class="inline"></Fa> 排名查分</ToolboxButton
			>
			<div class="text-semibold">DDNet 玩家里程、排名与分数</div>
		</div>

		<div class="mt-6">
			<ToolboxButton href="/ddnet/maps"
				><Fa icon={faMap} class="inline"></Fa> 查找地图</ToolboxButton
			>
			<div class="text-semibold">DDNet 官方地图列表</div>
		</div>

		<div class="mt-6">
			<ToolboxButton href="/ddnet/servers"
				><Fa icon={faServer} class="inline"></Fa> 服务器列表</ToolboxButton
			>
			<div class="text-semibold">DDNet 服务器列表</div>
		</div>

		<div class="mt-6">
			<ToolboxButton href="/ddnet/skins"
				><Fa icon={faFaceSmile} class="inline"></Fa> 皮肤列表</ToolboxButton
			>
			<div class="text-semibold">浏览和复制 DDNet 皮肤</div>
		</div>

		<div class="mt-6">
			<ToolboxButton href="/donate" newTab
				><Fa icon={faHeart} class="inline text-red-400" /> 捐赠支持</ToolboxButton
			>
			<div class="text-semibold">打赏与支持</div>
		</div>

		<div class="mt-6 flex items-start">
			<div class="h-px grow bg-linear-to-r from-slate-600 to-transparent"></div>
		</div>

		<div class="mt-6">
			<ToolboxButton ref="https://wiki.ddnet.org/wiki/Main_Page/zh"
				><Fa icon={faInfoCircle} class="inline"></Fa> 中文 Wiki</ToolboxButton
			>
			<div class="text-semibold">详细教程与操作指南</div>
		</div>

		<div class="mt-6">
			<ToolboxButton ref="https://ddnet.org/"
				><Fa icon={faGlobe} class="inline"></Fa> DDNet 官网</ToolboxButton
			>
			<div class="text-semibold">前往 DDraceNetwork 官方网站</div>
		</div>
	</div>

	<div class="shrink-0 sm:w-72">
		<LatestRecordsSidebar />
	</div>
</div>
