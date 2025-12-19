<script lang="ts">
	import { encodeBase64Url } from '$lib/base64url';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
</script>

<svelte:head>
	<title>捐赠支持 - TeeworldsCN</title>
	<meta name="description" content="捐赠服务器成本" />
</svelte:head>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'TeeworldsCN' },
		{ text: '捐赠支持', title: '捐赠支持' }
	]}
/>

<div class="container mx-auto max-w-4xl">
	<div class="mt-6 rounded-lg bg-slate-800">
		<h2 class="mb-4 text-xl font-semibold text-slate-200">选择捐赠社区</h2>
		<div class="mb-3 text-sm">本站导航的所有项目均为免费与自由的开源项目</div>
		<div class="grid gap-6 md:grid-cols-3">
			<div
				class="flex flex-col justify-between rounded-lg border border-slate-500 bg-[#2d2d2d] p-6"
			>
				<div>
					<h3 class="mb-3 text-lg font-semibold text-slate-200">支持 DDNet 服务器</h3>
					<p class="mb-4 text-sm text-slate-300">
						DDNet 依靠社区捐赠来维持服务器运营。您可以通过以下方式支持 DDNet
					</p>
				</div>
				<a
					href="/link?ref={encodeBase64Url('https://ddnet.org/funding')}"
					target="_blank"
					class="inline-flex items-center rounded-lg bg-[#ffa500] px-4 py-2 font-medium text-black transition-colors hover:bg-[#e19201]"
				>
					官方捐赠页面
				</a>
			</div>

			<div
				class="flex flex-col justify-between rounded-lg border border-slate-500 bg-[#0e0e11] p-6"
			>
				<div>
					<h3 class="mb-3 text-lg font-semibold text-slate-200">支持 Axiom 服务器</h3>
					<p class="mb-4 text-sm text-slate-300">
						Axiom 团队持续维护 Axiom 网站与帐号。通过捐赠支持开发与游戏服务器成本
					</p>
				</div>
				<a
					href="https://axiom.teeworlds.cn/sponsor"
					class="inline-flex items-center rounded-lg border-2 border-cyan-400 bg-black px-4 py-2 font-medium text-cyan-400 transition-colors hover:bg-cyan-400/10"
					target="_blank"
				>
					查看 Axiom 捐赠详细
				</a>
			</div>

			<div
				class="flex flex-col justify-between rounded-lg border border-slate-500 bg-slate-900 p-6"
			>
				<div>
					<h3 class="mb-3 text-lg font-semibold text-slate-200">支持 TeeworldsCN</h3>
					<p class="mb-4 text-sm text-slate-300">
						TeeworldsCN 工具箱由 TsFreddie 个人进行维护与跟进功能
					</p>
				</div>
				<div>
					<p class="mb-4 text-xs text-indigo-300">
						捐赠本项目主要用于支持维护查询站，可能不会用于提供游戏服
					</p>
					<a
						href="https://ifdian.net/order/create?user_id=86452e60dba811ed862c5254001e7c00&remark=%E4%B8%BA%20TeeworldsCN%20%E6%89%93%E8%B5%8F&affiliate_code=ddnet"
						class="inline-flex items-center rounded-lg bg-[#946ce6] px-4 py-2 font-medium text-white transition-colors hover:bg-purple-500"
						target="_blank"
					>
						通过爱发电打赏
					</a>
				</div>
			</div>
		</div>
	</div>
	<div class="mt-6 rounded-lg bg-slate-800">
		<h2 class="mb-4 text-xl font-semibold text-slate-200">感谢您的支持</h2>
		<p class="mb-4 text-slate-300">
			多数 Teeworlds 与 DDRaceNetwork 均是由社区驱动的开源项目 您的捐赠将驱动开发并支持项目运行成本
		</p>
		<ul class="mb-4 space-y-2 text-slate-300">
			<li>• 维护项目服务器运行成本</li>
			<li>• 开发新功能和改进现有功能</li>
			<li>• 支持社区活动和比赛</li>
		</ul>
	</div>
</div>
