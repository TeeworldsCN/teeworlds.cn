<script lang="ts">
	import { encodeBase64Url } from '$lib/base64url';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import Fa from 'svelte-fa';
	import { faHeart } from '@fortawesome/free-solid-svg-icons';
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
		<div
			class="mb-6 overflow-hidden rounded-xl border border-amber-500/30 bg-linear-to-br from-amber-900/40 via-slate-800 to-slate-900 p-6 shadow-lg shadow-amber-500/10"
		>
			<div class="mb-4 flex items-center gap-3">
				<Fa icon={faHeart} size="1.5x" class="text-amber-400" />
				<h2 class="text-2xl font-bold text-amber-200">感谢您的支持</h2>
				<Fa icon={faHeart} size="1.5x" class="text-amber-400" />
			</div>
			<p class="mb-4 text-lg text-slate-300">以下所有社区项目均是由玩家维护的免费开放开源项目</p>
			<p class="mb-4 text-lg text-amber-300">您的捐赠可以：</p>
			<ul class="mb-4 space-y-3 text-slate-300">
				<li class="flex items-center gap-2">
					<Fa icon={faHeart} size="sm" class="text-amber-400" /> 帮助支撑项目服务器运行成本
				</li>
				<li class="flex items-center gap-2">
					<Fa icon={faHeart} size="sm" class="text-amber-400" /> 鼓励开发新功能和改进现有功能
				</li>
				<li class="flex items-center gap-2">
					<Fa icon={faHeart} size="sm" class="text-amber-400" /> 支持社区活动和比赛
				</li>
				<li class="flex items-center gap-2">
					<Fa icon={faHeart} size="sm" class="text-amber-400" /> 表示对维护志愿者的感谢
				</li>
			</ul>
		</div>
		<div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
			<div
				class="flex flex-col justify-between rounded-lg border border-slate-500 bg-[#2d2d2d] p-6"
			>
				<div>
					<h3 class="mb-3 text-lg font-semibold text-slate-200">支持 DDNet 服务器</h3>
					<div class="mb-4 text-sm text-slate-300">
						<p>・DDNet 依靠社区捐赠来维持运行</p>
						<p>・开发与社区活动均为玩家志愿者无偿提供</p>
					</div>
				</div>
				<div>
					<div class="mb-4 rounded bg-black/30 p-2 text-xs font-bold">
						<p>捐赠 100% 用于支撑 DDNet 服务器成本</p>
						<p>超出本年度成本的部分将用于下一年度</p>
					</div>
					<a
						href="/link?ref={encodeBase64Url('https://ddnet.org/funding')}"
						target="_blank"
						class="inline-flex items-center rounded-lg border-2 border-[#ffa500] bg-[#ffa500] px-4 py-2 font-medium text-black transition-colors hover:bg-[#e19201]"
					>
						查看 DDNet 捐赠页面
					</a>
				</div>
			</div>

			<div
				class="flex flex-col justify-between rounded-lg border border-slate-500 bg-[#0e0e11] p-6"
			>
				<div>
					<h3 class="mb-3 text-lg font-semibold text-slate-200">支持 Axiom 服务器</h3>
					<div class="mb-4 text-sm text-slate-300">
						<p>・Axiom 团队持续维护 Axiom 网站与帐号</p>
						<p>・主要开发与社区活动为 Axiom 团队提供</p>
					</div>
				</div>
				<div>
					<div class="mb-4 rounded bg-black/30 p-2 text-xs font-bold">
						<p>捐赠主要用于支撑 Axiom 服务器成本</p>
						<p>超出成本的部分将用于支撑 Axiom 开发</p>
					</div>
					<a
						href="https://axiom.teeworlds.cn/sponsor"
						class="inline-flex items-center rounded-lg border-2 border-cyan-400 bg-black px-4 py-2 font-medium text-cyan-400 transition-colors hover:bg-cyan-400/10"
						target="_blank"
					>
						查看 Axiom 赞助页面
					</a>
				</div>
			</div>

			<div
				class="flex flex-col justify-between rounded-lg border border-slate-500 bg-slate-900 p-6"
			>
				<div>
					<h3 class="mb-3 text-lg font-semibold text-slate-200">支持 TeeworldsCN</h3>
					<div class="mb-4 text-sm text-slate-300">
						<p>・TeeworldsCN 工具箱由 TsFreddie 个人开发</p>
						<p>・该打赏还包括您对维护QQ群组、QQ频道与定期社区活动的支持</p>
					</div>

					<div class="mb-4 rounded bg-black/30 p-2 text-xs font-bold text-indigo-300">
						<p>打赏主要用于支撑网站成本</p>
						<p>超出成本的部分将打赏给 TsFreddie</p>
					</div>
					<a
						href="https://ifdian.net/order/create?user_id=86452e60dba811ed862c5254001e7c00&remark=%E4%B8%BA%20TeeworldsCN%20%E6%89%93%E8%B5%8F&affiliate_code=ddnet"
						class="inline-flex items-center rounded-lg border-2 border-[#946ce6] bg-[#946ce6] px-4 py-2 font-medium text-white transition-colors hover:bg-purple-500"
						target="_blank"
					>
						打赏 TeeworldsCN 网站
					</a>
				</div>
			</div>
		</div>
	</div>
</div>
