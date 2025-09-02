<script lang="ts">
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
</script>

<svelte:head>
	<title>捐赠支持 - TeeworldsCN</title>
	<meta name="description" content="支持 TeeworldsCN 的发展" />
</svelte:head>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'Teeworlds 中文社区' },
		{ text: '捐赠支持', title: '捐赠支持' }
	]}
/>

<div class="container mx-auto max-w-4xl">
	<div class="mb-6 rounded-lg bg-slate-800">
		<h2 class="mb-4 text-xl font-semibold text-slate-200">感谢您的支持</h2>
		<p class="mb-4 text-slate-300">
			Teeworlds 与 DDRaceNetwork 是由社区驱动的项目 您的捐赠将帮助游戏与社区维护服务器运行成本
		</p>
		<ul class="mb-4 space-y-2 text-slate-300">
			<li>• 维护服务器运行成本</li>
			<li>• 开发新功能和改进现有功能</li>
			<li>• 支持社区活动和比赛</li>
		</ul>
	</div>

	<div class="rounded-lg bg-slate-800">
		<h2 class="mb-4 text-xl font-semibold text-slate-200">捐赠方式</h2>

		<div class="mb-6">
			<h3 class="mb-3 text-lg font-semibold text-slate-200">支持 DDNet 服务器</h3>
			<p class="mb-3 text-slate-300">
				DDNet 依靠社区捐赠来维持服务器运营。您可以通过以下方式支持 DDNet：
			</p>
			<a
				href="/ddnet/donate"
				class="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700"
			>
				查看 DDNet 捐赠详情
			</a>
		</div>
	</div>
</div>
