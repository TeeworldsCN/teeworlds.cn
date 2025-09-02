<script lang="ts">
	import type { PageData } from './$types';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';

	let { data }: { data: PageData } = $props();

	const { donateInfo } = data;

	function getProgressColor(percentage: number): string {
		if (percentage >= 100) return '#059669'; // emerald-600
		if (percentage >= 75) return '#0d9488'; // teal-600
		if (percentage >= 50) return '#0891b2'; // cyan-600
		return '#0284c7'; // sky-600
	}

	function formatEuro(amount: number): string {
		return amount.toFixed(0);
	}
</script>

<svelte:head>
	<title>DDNet 捐赠支持 - TeeworldsCN</title>
	<meta name="description" content="支持 DDNet 服务器运营的捐赠信息" />
</svelte:head>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'Teeworlds 中文社区' },
		{ href: '/ddnet', text: 'DDNet', title: 'DDNet 相关页面' },
		{ text: '捐赠支持', title: 'DDNet 捐赠支持' }
	]}
/>

<div class="grid grid-cols-1 gap-4 md:grid-cols-1">
	{#if donateInfo}
		<!-- Funding Overview -->
		<div class="rounded-lg bg-slate-700 p-2 shadow-md md:p-4">
			<h1 class="mb-3 text-xl font-bold">DDNet 服务器资助</h1>
			<p class="mb-6 text-slate-300">
				由于您可以在 DDNet 上免费游戏，我们通过赞助（提供整个服务器费用）或捐赠来承担服务器成本。
				以下是服务器的成本以及已通过捐赠覆盖的部分：
			</p>

			<!-- Total Progress -->
			<div class="mb-6">
				<h2 class="mb-3 text-xl font-semibold text-slate-200">
					总计 {donateInfo.funding.total.year}
				</h2>
				<div class="relative h-8 rounded-lg bg-slate-600">
					<div
						class="h-full rounded-lg transition-all duration-300"
						style="width: {Math.min(
							donateInfo.funding.total.percentage,
							100
						)}%; background-color: {getProgressColor(donateInfo.funding.total.percentage)}"
					></div>
					<div
						class="absolute inset-0 flex items-center justify-center text-sm font-medium text-white"
					>
						{formatEuro(donateInfo.funding.total.donated)} € 已捐赠 / {formatEuro(
							donateInfo.funding.total.cost
						)} € 总成本
					</div>
				</div>
			</div>

			<!-- Server List -->
			<div class="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
				{#each donateInfo.funding.servers as server}
					<div class="rounded-lg bg-slate-600 px-3 py-1 shadow-md sm:py-3">
						<div class="mb-2 flex items-center justify-between">
							<h3 class="mb-1 text-base font-bold">{server.displayName}</h3>
							{#if server.sponsor}
								<span class="text-sm text-green-400">
									由 {server.sponsor} 赞助
								</span>
							{/if}
						</div>
						<div class="relative h-6 rounded bg-slate-500">
							<div
								class="h-full rounded transition-all duration-300"
								style="width: {Math.min(
									server.percentage,
									100
								)}%; background-color: {getProgressColor(server.percentage)}"
							></div>
							<div
								class="absolute inset-0 flex items-center justify-center text-xs font-medium text-white"
							>
								{#if server.cost > 0}
									{formatEuro(server.donated)} / {formatEuro(server.cost)} €
								{:else}
									完全赞助
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>

			<!-- Historical Funding -->
			{#if donateInfo.funding.old.cost > 0}
				<div class="mt-6">
					<p class="mb-3 text-slate-300">当本年度完全覆盖时，我们仍然感谢捐赠以覆盖往年的成本：</p>
					<h2 class="mb-3 text-xl font-semibold text-slate-200">
						总计 {donateInfo.funding.old.years}
					</h2>
					<div class="relative h-8 rounded-lg bg-slate-600">
						<div
							class="h-full rounded-lg transition-all duration-300"
							style="width: {Math.min(
								donateInfo.funding.old.percentage,
								100
							)}%; background-color: {getProgressColor(donateInfo.funding.old.percentage)}"
						></div>
						<div
							class="absolute inset-0 flex items-center justify-center text-sm font-medium text-white"
						>
							{formatEuro(donateInfo.funding.old.donated)} € / {formatEuro(
								donateInfo.funding.old.cost
							)} € 成本 {donateInfo.funding.old.years}
						</div>
					</div>
				</div>
			{/if}
		</div>

		<!-- Donations Section -->
		<div class="rounded-lg bg-slate-700 p-2 shadow-md md:p-4">
			<h2 class="mb-3 text-xl font-bold">捐赠</h2>
			<p class="mb-4 text-slate-300">
				运行 DDNet 服务器需要资金。我们感谢任何金额的捐赠，这些捐赠将专门用于服务器成本。
				请不要忘记在捐赠者列表中注明您希望列出的游戏内姓名：
			</p>

			{#if donateInfo.donateLinks.paypal}
				<div class="mb-6">
					<a
						href={donateInfo.donateLinks.paypal}
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex items-center rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
					>
						通过 PayPal 捐赠
					</a>
				</div>
			{/if}

			<p class="text-sm text-slate-400">
				如果您想赞助特定服务器，您应该至少捐赠其全年总成本的一半。<br />
				如果您有俄罗斯银行账户并希望为 DDNet RUS1/2 捐赠，请在 Discord 上联系 0xdeen。
			</p>
		</div>

		<!-- Donors List -->
		{#if donateInfo.donors.length > 0}
			<div class="rounded-lg bg-slate-700 p-2 shadow-md md:p-4">
				<h2 class="mb-3 text-xl font-bold">捐赠者</h2>
				<p class="mb-4 text-slate-300">
					这些人通过捐赠和赞助服务器慷慨支持 DDNet（按时间顺序排列）：
				</p>
				<div class="flex flex-wrap gap-2">
					{#each donateInfo.donors as donor}
						<span class="rounded bg-slate-600 px-3 py-1 text-sm text-slate-300">
							{donor}
						</span>
					{/each}
				</div>
				<p class="mt-4 text-sm text-slate-400">
					谢谢！没有您的支持，DDNet 今天就不会存在。其他人通过投入时间、精力和知识来帮助 DDNet。
				</p>
			</div>
		{/if}
	{:else}
		<div class="rounded-lg bg-slate-700 p-2 shadow-md md:p-4">
			<h1 class="mb-3 text-xl font-bold">DDNet 捐赠支持</h1>
			<p class="text-slate-300">抱歉，无法加载捐赠信息。请稍后再试。</p>
		</div>
	{/if}
</div>
