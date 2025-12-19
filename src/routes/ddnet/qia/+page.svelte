<script lang="ts">
	import { goto } from '$app/navigation';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import { encodeAsciiURIComponent } from '$lib/link';
	import {
		faGamepad,
		faHandshake,
		faDatabase,
		faShieldHalved,
		faServer,
		faRobot,
		faLock,
		faGlobe,
		faChartLine,
		faCode,
		faUserShield,
		faCalendarDay
	} from '@fortawesome/free-solid-svg-icons';
	import Fa from 'svelte-fa';

	let playerName = $state('');

	function gotoPlayer() {
		if (playerName) {
			goto(`/ddnet/players/${encodeAsciiURIComponent(playerName)}?tool=true`);
		}
	}
</script>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'TeeworldsCN' },
		{ href: '/ddnet', text: 'DDNet' },
		{ text: '恰分工具', title: 'DDNet 恰分工具' }
	]}
/>

<div class="mt-8 flex flex-col items-center">
	<div class="mb-8 text-center">
		<div class="mb-2 flex items-center justify-center">
			<Fa icon={faGamepad} class="mr-2 text-4xl text-blue-400" />
			<h1 class="text-4xl font-bold text-slate-100">恰分工具</h1>
		</div>
		<p class="text-slate-300">2025年愚人节活动</p>
	</div>

	<div class="w-full max-w-md rounded-lg bg-slate-700 p-6 shadow-lg">
		<div class="flex flex-col space-y-6">
			<div class="flex flex-col space-y-2">
				<label for="player-name" class="text-sm font-medium text-slate-300">玩家名称</label>
				<input
					id="player-name"
					type="text"
					class="w-full rounded border border-slate-500 bg-slate-600 px-3 py-2 text-sm font-normal shadow-md placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 focus:outline-none"
					placeholder="输入你的游戏名称..."
					bind:value={playerName}
					onkeydown={(ev) => {
						if (ev.key === 'Enter') {
							gotoPlayer();
						}
					}}
				/>
			</div>

			<button
				class="w-full transform rounded bg-blue-500 px-4 py-2 text-white transition-all duration-200 hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-blue-500 disabled:opacity-50"
				onclick={gotoPlayer}
				disabled={!playerName}
			>
				开始恰分
			</button>
		</div>
	</div>

	<div class="mt-8 w-full max-w-2xl rounded-lg bg-slate-700 p-6 shadow-lg">
		<h2 class="mb-4 text-2xl font-bold text-slate-100">工具说明</h2>

		<div class="mb-6 flex flex-wrap gap-4">
			<div class="flex items-center rounded-full bg-slate-600 px-4 py-2">
				<Fa icon={faGlobe} class="mr-2 text-green-400" />
				<span>DDNet 官方授权</span>
			</div>
			<div class="flex items-center rounded-full bg-slate-600 px-4 py-2">
				<Fa icon={faServer} class="mr-2 text-blue-400" />
				<span>实时数据同步</span>
			</div>
			<div class="flex items-center rounded-full bg-slate-600 px-4 py-2">
				<Fa icon={faUserShield} class="mr-2 text-yellow-400" />
				<span>安全可靠</span>
			</div>
		</div>

		<div class="space-y-4 text-slate-300">
			<div class="flex items-start gap-3">
				<Fa icon={faHandshake} class="mt-1 text-green-400" />
				<p>
					我们很荣幸地宣布，TeeworldsCN 已与 DDNet
					官方达成深度战略合作伙伴关系。通过这次合作，我们获得了直接访问 DDNet
					核心数据库的权限，这使得我们能够为中国玩家提供前所未有的游戏体验提升服务。
				</p>
			</div>

			<div class="flex items-start gap-3">
				<Fa icon={faDatabase} class="mt-1 text-blue-400" />
				<p>
					本次推出的"恰分工具"是基于 DDNet 最新的 API v3.0 开发，采用了独特的 WebSocket
					实时同步技术，可以直接连接到 DDNet
					位于法兰克福的主数据中心。通过这个工具，玩家可以实时调整自己的游戏记录，所有更改都会即时同步到官方数据库。
				</p>
			</div>

			<div class="flex items-start gap-3">
				<Fa icon={faRobot} class="mt-1 text-purple-400" />
				<p>
					为确保公平性，系统采用了先进的 AI
					模型来分析玩家的历史数据和游戏表现，自动计算合理的里程上限。同时，所有操作都会经过 DDNet
					反作弊系统的严格审核，确保竞技环境的公平性。
				</p>
			</div>

			<div class="flex items-start gap-3">
				<Fa icon={faCalendarDay} class="mt-1 text-red-400" />
				<p>特别说明：本功能限时开放。请珍惜这个难得的机会，合理调整自己的游戏记录！</p>
			</div>

			<div class="mt-6 rounded-lg bg-slate-600 p-4">
				<div class="mb-2 flex items-center gap-2 text-yellow-300">
					<Fa icon={faLock} />
					<p class="font-semibold">技术规格：</p>
				</div>
				<div class="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
					<div class="flex items-center gap-2">
						<Fa icon={faCode} class="text-blue-300" />
						<span>WebSocket 实时同步</span>
					</div>
					<div class="flex items-center gap-2">
						<Fa icon={faServer} class="text-green-300" />
						<span>法兰克福主节点</span>
					</div>
					<div class="flex items-center gap-2">
						<Fa icon={faShieldHalved} class="text-purple-300" />
						<span>HMAC-SHA256 加密</span>
					</div>
					<div class="flex items-center gap-2">
						<Fa icon={faLock} class="text-yellow-300" />
						<span>RSA-4096 签名</span>
					</div>
					<div class="flex items-center gap-2">
						<Fa icon={faChartLine} class="text-red-300" />
						<span>AI 智能限制</span>
					</div>
					<div class="flex items-center gap-2">
						<Fa icon={faUserShield} class="text-orange-300" />
						<span>反作弊保护</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
