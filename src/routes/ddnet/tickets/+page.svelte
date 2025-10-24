<script lang="ts">
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import Link from '$lib/components/Link.svelte';
</script>

<svelte:head>
	<title>服务通知 - TeeworldsCN</title>
	<meta name="description" content="TeeworldsCN 与 DDNet 合作结束通知" />
</svelte:head>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'TeeworldsCN' },
		{ href: '/ddnet', text: 'DDNet' },
		{ text: '举报与反馈', title: 'DDNet 举报与反馈' }
	]}
/>

<div class="mt-6">
	<h1 class="text-2xl font-bold">服务通知</h1>

	<div class="mt-6 rounded-lg border border-slate-700 bg-slate-800 p-6">
		<p class="text-lg leading-relaxed text-slate-200">
			TeeworldsCN 与 DDNet 的合作已结束，今后不再提供举报与反馈渠道。信息查询仍将保留。
		</p>

		<p class="mt-4 text-lg leading-relaxed text-slate-200">
			如果需要提交举报，请前往<Link ref="https://ddnet.org/discord" type="main"
				>DDNet 官方 Discord</Link
			>进行举报。
		</p>

		<p class="mt-4 leading-relaxed text-slate-300">
			你也可以加入
			<Link href="https://chat.teeworlds.cn" type="main">TeeworldsCN</Link>
			了解动态（社区不再提供管理服务）。
		</p>
	</div>
</div>
