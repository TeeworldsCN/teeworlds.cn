<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import { encodeAsciiURIComponent } from '$lib/link';
	import { faCoins, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
	import { onMount } from 'svelte';
	import Fa from 'svelte-fa';
	import { fade } from 'svelte/transition';

	let revealed = $derived(browser && Date.now() >= new Date('2026-04-02T00:00:00').getTime());

	let playerName = $state('');
	let loaded = $state(false);
	let hasActivated = $state(false);
	let hasClaimed = $state(false);
	let saveDataOwner = $state<string | null>(null);
	let showGiveUpModal = $state(false);

	function gotoPlayer() {
		if (playerName) {
			goto(`/ddnet/players/${encodeAsciiURIComponent(playerName)}?tool=2026#entry`);
		}
	}

	function confirmGiveUpRedPacket() {
		showGiveUpModal = true;
	}

	function giveUpRedPacket() {
		if (browser) {
			const existingData = JSON.parse(window.localStorage.getItem('ddshare') || 'null');
			if (existingData) {
				existingData.owner = '';
				window.localStorage.setItem('ddshare', JSON.stringify(existingData));
				saveDataOwner = '';
				hasActivated = false;
			}
		}
		showGiveUpModal = false;
	}

	function cancelGiveUp() {
		showGiveUpModal = false;
	}

	onMount(() => {
		let existingData = JSON.parse(window.localStorage.getItem('ddshare') || 'null');

		// handle expiring
		if (existingData && existingData.expire < Date.now()) {
			window.localStorage.removeItem('ddshare');
			existingData = null;
		}

		if (existingData && existingData.owner && existingData.owner !== '') {
			hasActivated = true;
			saveDataOwner = existingData.owner;
		}

		if (existingData && existingData.claimed) {
			hasClaimed = true;
		}
		loaded = true;
	});
</script>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'TeeworldsCN' },
		{ href: '/ddnet', text: 'DDNet' },
		{ text: '2026 里程红包', title: 'DDNet 里程红包' }
	]}
/>

{#if loaded}
	<div class="mt-8 flex flex-col items-center" in:fade>
		<div class="mb-8 text-center">
			<div class="mb-2 flex items-center justify-center">
				<Fa icon={faCoins} class="mr-2 text-4xl text-[#ffe259]" />
				<h1 class="text-3xl font-bold text-slate-100">春季里程红包</h1>
			</div>
			<p class="text-slate-300">
				{revealed ? '2026 年愚人节活动' : '快速解锁 5000 里程分数奖励！'}
			</p>
		</div>

		{#if hasActivated}
			<!-- Already claimed page -->
			<div
				class="relative w-full max-w-md rounded-4xl bg-linear-to-b from-[#ff512f] to-[#dd2476] p-6 shadow-2xl"
			>
				<!-- Top Tab -->
				<div
					class="absolute -top-4 left-1/2 -translate-x-1/2 rounded-t-xl rounded-b-md bg-linear-to-b from-[#ffe259] to-[#ffa751] px-8 py-1.5 text-center text-lg font-bold text-nowrap text-[#c62828] shadow-md"
				>
					DDNet 里程红包
				</div>

				<div class="mt-4 flex flex-col items-center space-y-6">
					<div class="text-center">
						<p class="text-2xl font-bold text-white">
							{#if hasClaimed}你已成功结算5000里程！{:else}你已经领取过里程红包了！{/if}
						</p>
						{#if saveDataOwner}
							<p class="mt-2 text-lg text-white/80">领取玩家：{saveDataOwner}</p>
						{/if}
					</div>
					{#if hasClaimed}
						<div class="flex w-full flex-col space-y-4">
							<button
								class="w-full cursor-pointer rounded-full bg-linear-to-b from-[#ffe259] to-[#ffa751] py-4 text-xl font-bold text-[#c62828] shadow-[0_6px_0_#d84315] transition-all hover:scale-102 active:translate-y-1.5"
								onclick={() =>
									goto(
										`/ddnet/players/${encodeAsciiURIComponent(saveDataOwner || '')}?tool=2026#entry`
									)}
							>
								查看你的里程
							</button>
						</div>
					{:else}
						<div class="flex w-full flex-col space-y-4">
							<button
								class="w-full cursor-pointer rounded-full bg-linear-to-b from-[#ffe259] to-[#ffa751] py-4 text-xl font-bold text-[#c62828] shadow-[0_6px_0_#d84315] transition-all hover:scale-102 active:translate-y-1.5"
								onclick={() =>
									goto(
										`/ddnet/players/${encodeAsciiURIComponent(saveDataOwner || '')}?tool=2026#entry`
									)}
							>
								查看你的红包进度
							</button>

							<button
								class="w-full cursor-pointer rounded-full bg-linear-to-b from-[#d946ef] to-[#a855f7] py-4 text-xl font-bold text-white shadow-[0_6px_0_#7e22ce] transition-all hover:scale-102 active:translate-y-1.5"
								onclick={confirmGiveUpRedPacket}
							>
								放弃红包
							</button>
						</div>
					{/if}
				</div>
			</div>
		{:else}
			<!-- Original page -->
			<div
				class="relative w-full max-w-md rounded-4xl bg-linear-to-b from-[#ff512f] to-[#dd2476] p-6 shadow-2xl"
			>
				<!-- Top Tab -->
				<div
					class="absolute -top-4 left-1/2 -translate-x-1/2 rounded-t-xl rounded-b-md bg-linear-to-b from-[#ffe259] to-[#ffa751] px-8 py-1.5 text-center text-lg font-bold text-nowrap text-[#c62828] shadow-md"
				>
					DDNet 里程红包
				</div>

				<div class="mt-4 flex flex-col space-y-6">
					<div class="flex flex-col space-y-4">
						<label for="player-name" class="text-center text-lg font-bold text-white"
							>领取 5000 里程礼包</label
						>
						<input
							id="player-name"
							type="text"
							class="w-full rounded-xl border-none bg-white/90 px-4 py-3 text-center text-lg font-bold text-[#c62828] shadow-inner placeholder:text-[#c62828]/50 focus:bg-white focus:ring-4 focus:ring-[#ffe259]/50 focus:outline-none"
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
						class="motion-preset-oscillate-sm motion-duration-1000 motion-loop-infinite w-full cursor-pointer rounded-full bg-linear-to-b from-[#ffe259] to-[#ffa751] py-4 text-xl font-bold text-[#c62828] shadow-[0_6px_0_#d84315] transition-all hover:scale-102 active:translate-y-1.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:active:translate-y-0"
						onclick={gotoPlayer}
						disabled={!playerName}
					>
						立即领取
					</button>
				</div>
			</div>
		{/if}

		<!-- Give Up Confirmation Modal (Custom Overlay) -->
		{#if showGiveUpModal}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div
				class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
				onclick={cancelGiveUp}
			>
				<div
					class="motion-preset-shrink relative w-full max-w-md rounded-4xl bg-linear-to-b from-[#ff512f] to-[#dd2476] p-6 shadow-2xl"
					onclick={(e) => e.stopPropagation()}
				>
					<!-- Top Tab -->
					<div
						class="absolute -top-4 left-1/2 -translate-x-1/2 rounded-t-xl rounded-b-md bg-linear-to-b from-[#ffe259] to-[#ffa751] px-8 py-1.5 text-center text-lg font-bold text-nowrap text-[#c62828] shadow-md"
					>
						<div class="flex items-center justify-center">
							<Fa icon={faTriangleExclamation} class="mr-2 text-xl" />
							确认放弃红包？
						</div>
					</div>

					<div class="mt-4 flex flex-col items-center space-y-6">
						<p class="text-center text-xl font-bold text-white">确定要放弃这 5000 里程吗？</p>

						<div class="flex w-full flex-col space-y-4">
							<button
								class="w-full cursor-pointer rounded-full bg-linear-to-b from-[#ffe259] to-[#ffa751] py-4 text-xl font-bold text-[#c62828] shadow-[0_6px_0_#d84315] transition-all hover:scale-102 active:translate-y-1.5"
								onclick={cancelGiveUp}
							>
								保留 5000 里程红包奖励
							</button>
							<div class="flex gap-5">
								<p class="text-left text-sm text-[#ffe259]/90">
									* 若放弃红包奖励，您需要重新输入游戏名才能再次领取红包。若已了解，可以<button
										onclick={giveUpRedPacket}
										class="inline cursor-pointer text-[#fdd8b6] underline">确认放弃</button
									>。
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}

		<div
			class="mt-12 w-full max-w-2xl rounded-2xl border border-white/20 bg-white/10 p-6 shadow-lg backdrop-blur-sm"
		>
			<h2 class="mb-4 text-center text-2xl font-bold text-[#ffe259]">活动说明</h2>

			<div class="space-y-4 text-slate-200">
				<p class="text-center">
					为回馈广大玩家，DDNet 官方特别推出春季里程红包活动，输入您的游戏名称即可领取 5000
					里程红包！
				</p>
				<p class="text-center text-sm opacity-80">* 本活动最终解释权归 TeeworldsCN 所有</p>
			</div>
		</div>
	</div>
{/if}
