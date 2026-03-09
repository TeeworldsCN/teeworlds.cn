<script lang="ts">
	import { onMount } from 'svelte';
	import {
		faCoins,
		faXmark,
		faUser,
		faClock,
		faCircle,
		faCircleCheck,
		faListCheck
	} from '@fortawesome/free-solid-svg-icons';
	import Fa from 'svelte-fa';
	import { afterNavigate, goto } from '$app/navigation';
	import { fade } from 'svelte/transition';
	import { encodeAsciiURIComponent } from '$lib/link';
	import { DateTime } from 'luxon';
	import { browser } from '$app/environment';
	import { SvelteSet } from 'svelte/reactivity';

	let {
		name,
		toolEntry,
		toolPoints = $bindable(),
		pendingToolPoints = $bindable()
	}: {
		name: string;
		toolEntry: boolean;
		toolPoints: number;
		pendingToolPoints: number;
	} = $props();

	let loading = $state(true);
	let show = $state(true);
	let expanded = $state(true);
	let innerWidth = $state(0);
	let scale = $derived(innerWidth > 0 && innerWidth < 352 ? innerWidth / 352 : 1);

	let shouldShowIntro = $state(false);

	let displayPointsHundreds = $state(0);
	let points = $state(0);

	const endOfDay = DateTime.now().setZone('Asia/Shanghai').endOf('day');

	const makeRemainingTime = () => {
		const now = new Date();
		const diff = endOfDay.toMillis() - now.getTime();

		if (diff < 0) {
			dayEnded = true;
			return '活动已结束';
		}

		const hours = Math.floor(diff / (1000 * 60 * 60));
		const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
		const seconds = Math.floor((diff % (1000 * 60)) / 1000);

		return `${hours}小时${minutes}分钟${seconds}秒`;
	};

	let remainingTime = $state(makeRemainingTime());
	let count = $state(0);
	let dayEnded = $state(false);
	let claimed = $state(false);

	let showToast = $state(false);
	let showModal = $state(false);
	let copyText = $state('');

	type BoostToast = {
		id: number;
		x: number;
		y: number;
	};
	let boostToasts: BoostToast[] = $state([]);
	let nextToastId = 0;

	const copyLink = async () => {
		if (!saveData) return;

		const url = new URL(
			`/goto#pt26${encodeAsciiURIComponent(name)}`,
			window.location.origin
		).toString();
		copyText = `${name}送你5000里程，助力TA即可获取：${url}`;

		try {
			await navigator.clipboard.writeText(copyText);
			showToast = true;
			setTimeout(() => {
				showToast = false;
			}, 3500);
		} catch (err) {
			showModal = true;
		}

		if (!saveData.initialTask) {
			saveData.initialTask = true;
			commitSave();
			increaseForSelf();
		}
	};

	const updateSave = () => {
		saveData = getSave();
		if (!saveData) return;

		if (!saveData.otherTaskIncreased && saveData.otherTask) {
			saveData.otherTaskIncreased = true;
			commitSave();
			increaseForSelf();
		}
	};

	const increaseForSelf = async () => {
		if (!saveData) return;

		const result = await fetch(`/api/tool/${name}`, {
			method: 'POST'
		});

		updateCount(result);
	};

	const increaseForOthers = async () => {
		updateSave();

		if (!saveData) {
			saveData = createSave();
		}

		// don't increase for already increased name
		if (saveData.names.has(name)) return;
		saveData.names.add(name);

		if (saveData.owner && saveData.owner !== name) {
			saveData.otherTask = true;
		}
		commitSave();

		const result = await fetch(`/api/tool/${name}`, {
			method: 'POST'
		});

		updateCount(result);
	};

	let animationFrameId: number | null = null;

	const animatePointsTo = async (target: number) => {
		const targetPoints = Math.floor(target * 100);
		if (displayPointsHundreds === targetPoints) return;

		if (animationFrameId !== null) {
			cancelAnimationFrame(animationFrameId);
		}

		const startPoints = displayPointsHundreds;
		const startTime = performance.now();
		const duration = 2000; // 2 seconds

		const animate = (currentTime: number) => {
			const elapsed = currentTime - startTime;
			const progress = Math.min(elapsed / duration, 1);

			// easeOutQuart for a nice deceleration effect
			const easeOutQuart = 1 - Math.pow(1 - progress, 4);
			displayPointsHundreds = Math.round(startPoints + (targetPoints - startPoints) * easeOutQuart);

			if (count <= 30) {
				displayPointsHundreds = Math.round(displayPointsHundreds / 100) * 100;
			}

			if (progress < 1) {
				animationFrameId = requestAnimationFrame(animate);
			} else {
				animationFrameId = null;
			}
		};

		animationFrameId = requestAnimationFrame(animate);
	};

	const updateCount = async (result?: Response) => {
		updateSave();

		const res = result ?? (await fetch(`/api/tool/${name}`));
		const data = await res.json();
		const previousCount = count;
		count = data.count;

		// Show toast animation when count increases
		if (count > previousCount && previousCount >= 0) {
			const diff = count - previousCount;
			const mainCard = document.getElementById('main-card');
			if (mainCard) {
				const rect = mainCard.getBoundingClientRect();
				const maxX = rect.width - 32;
				const maxY = 128;

				for (let i = 0; i < diff; i++) {
					setTimeout(
						() => {
							const x = -48 + Math.random() * maxX;
							const y = rect.height - maxY - 64 + Math.random() * maxY;
							const toastId = nextToastId++;
							boostToasts.push({ id: toastId, x, y });
							setTimeout(() => {
								boostToasts = boostToasts.filter((t) => t.id !== toastId);
							}, 1500);
						},
						(i * 500) / diff
					);
				}
			}
		}

		let calculatedPoint = 0;
		if (count == 0) {
			calculatedPoint = 0;
		} else if (count == 1) {
			calculatedPoint = 1000;
		} else if (count <= 5) {
			calculatedPoint = 1000 + (count - 1) * 375;
		} else if (count <= 13) {
			9;
			calculatedPoint = 2500 + (count - 5) * 250;
		} else if (count <= 41) {
			if (count == 27) {
				calculatedPoint = 4996;
			} else if (count == 28) {
				calculatedPoint = 4997;
			} else if (count == 29) {
				calculatedPoint = 4998;
			} else if (count == 30) {
				calculatedPoint = 4999;
			} else {
				const x = count - 13;
				const base = 0.7;
				calculatedPoint = 4500 + 500 * ((1 - Math.pow(base, x)) / (1 - Math.pow(base, 41 - 13)));
			}
			if (count <= 30) {
				calculatedPoint = Math.floor(calculatedPoint);
			}
		} else {
			calculatedPoint = 5000;
		}

		points = calculatedPoint;
		await animatePointsTo(calculatedPoint);
		loading = false;
	};

	const trimZero = (text: string) => {
		while (text.endsWith('0')) text = text.slice(0, -1);
		if (text.endsWith('.')) text += '0';
		return text;
	};

	type SaveData = {
		owner: string;
		expire: number;
		initialTask: boolean;
		otherTask: boolean;
		otherTaskIncreased: boolean;
		claimed: boolean;
		names: SvelteSet<string>;
	} | null;

	let saveData = $state<SaveData | null>(null);

	const getSave = () => {
		const data = JSON.parse(window.localStorage.getItem('ddshare') || 'null');

		if (data && data.expire < Date.now()) {
			window.localStorage.removeItem('ddshare');
			return null;
		}

		if (data && data.names) {
			data.names = new SvelteSet(data.names);
		}

		return data as SaveData;
	};

	const commitSave = () => {
		const clone: any = {};
		Object.assign(clone, saveData);
		clone.names = Array.from(saveData?.names || []);
		window.localStorage.setItem('ddshare', JSON.stringify(clone));
	};

	const createSave = () => {
		// Get end of today in a specific timezone
		const endOfDay = DateTime.now().setZone('Asia/Shanghai').endOf('day');
		const saveData = {
			owner: '',
			expire: endOfDay.toMillis(),
			initialTask: false,
			otherTask: false,
			otherTaskIncreased: false,
			claimed: false,
			names: new SvelteSet<string>()
		};
		return saveData;
	};

	const createSelfSave = () => {
		if (!saveData) {
			saveData = createSave();
		}
		saveData.owner = name;
		saveData.names.add(name);
		commitSave();
		shouldShowIntro = false;
	};

	const claimPoints = () => {
		if (!saveData) return;

		toolPoints = 0;
		pendingToolPoints = 5000;
		saveData.claimed = true;
		commitSave();

		// Add an animation which shrinks the card and makes it fade out
		const mainCard = document.getElementById('main-card');
		if (mainCard) {
			mainCard.classList.add('shrinking');
		}

		setTimeout(() => {
			expanded = false;
			claimed = true;
		}, 1000);

		setTimeout(() => {
			// Make the following score tranfer animation by increasing toolPoints and decreasePendingToolPoints over 1000ms using animationFrame
			const startTime = performance.now();
			const startPendingToolPoints = pendingToolPoints;
			const duration = 1000;
			const startPoints = toolPoints;

			const animateTransfer = (currentTime: number) => {
				const elapsed = currentTime - startTime;
				const progress = Math.min(elapsed / duration, 1);

				// easeOutQuart for a nice deceleration effect
				const easeOutQuart = 1 - Math.pow(1 - progress, 4);

				const transferred = Math.floor(5000 * easeOutQuart);
				pendingToolPoints = startPendingToolPoints - transferred;
				toolPoints = startPoints + transferred;

				if (progress < 1) {
					requestAnimationFrame(animateTransfer);
				}
			};

			requestAnimationFrame(animateTransfer);
		}, 4000);
	};

	onMount(() => {
		saveData = getSave();
		claimed = saveData?.claimed || false;
		if (claimed) {
			pendingToolPoints = 0;
			toolPoints = 5000;
			expanded = false;
		}
		shouldShowIntro = toolEntry && !saveData?.owner;
		updateCount();
		const timerInterval = setInterval(() => (remainingTime = makeRemainingTime()), 1000);
		const updateInterval = setInterval(updateCount, 7500);

		return () => {
			clearInterval(timerInterval);
			clearInterval(updateInterval);
		};
	});

	afterNavigate(() => {
		if (browser) updateCount();
	});
</script>

<svelte:window bind:innerWidth />

{#if show && !loading}
	{#if expanded}
		<div
			class="fixed inset-0 z-50 flex touch-none flex-col items-center justify-center bg-black/90 text-white select-none"
			style="-webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;"
		>
			{#if claimed}
				<!-- Day Ended Simple Card -->
				<div
					id="main-card"
					class="motion-preset-shrink flex w-88 flex-col items-center justify-center"
					style="transform: scale({scale}); transform-origin: center;"
				>
					<!-- Simple Card -->
					<div
						class="relative w-full rounded-4xl bg-linear-to-b from-[#ff512f] to-[#dd2476] p-5 pt-14 shadow-2xl"
					>
						<!-- Top Tab -->
						<div
							class="absolute -top-4 left-1/2 -translate-x-1/2 rounded-t-xl rounded-b-md bg-linear-to-b from-[#ffe259] to-[#ffa751] px-8 py-1.5 text-center text-lg font-bold text-nowrap text-[#c62828] shadow-md"
						>
							已成功领取
						</div>

						<div class="mb-8 text-center font-bold">获得的5000里程已计入总里程</div>

						<button
							class="w-full cursor-pointer rounded-full bg-linear-to-b from-[#ffe259] to-[#ffa751] py-4 text-xl font-bold text-[#c62828] shadow-[0_6px_0_#d84315] transition-all hover:scale-102 active:translate-y-1.5"
							onclick={() => (expanded = false)}
						>
							关闭活动
						</button>
					</div>

					<!-- Close button -->
					<button
						class="/50 hover: mt-4 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/30 transition-colors hover:bg-white/10"
						onclick={() => (expanded = false)}
					>
						<Fa icon={faXmark} size="lg" />
					</button>
				</div>
			{:else if dayEnded}
				<!-- Day Ended Simple Card -->
				<div
					id="main-card"
					class="motion-preset-shrink flex w-88 flex-col items-center justify-center"
					style="transform: scale({scale}); transform-origin: center;"
				>
					<!-- Simple Card -->
					<div
						class="relative w-full rounded-4xl bg-linear-to-b from-[#ff512f] to-[#dd2476] p-5 pt-14 shadow-2xl"
					>
						<!-- Top Tab -->
						<div
							class="absolute -top-4 left-1/2 -translate-x-1/2 rounded-t-xl rounded-b-md bg-linear-to-b from-[#ffe259] to-[#ffa751] px-8 py-1.5 text-center text-lg font-bold text-nowrap text-[#c62828] shadow-md"
						>
							活动已结束
						</div>

						<div class="mb-8 text-center font-bold">本期活动已结束</div>

						<button
							class="w-full cursor-pointer rounded-full bg-linear-to-b from-[#ffe259] to-[#ffa751] py-4 text-xl font-bold text-[#c62828] shadow-[0_6px_0_#d84315] transition-all hover:scale-102 active:translate-y-1.5"
							onclick={() => goto(`/ddnet/players/${encodeAsciiURIComponent(name)}`)}
						>
							离开活动
						</button>
					</div>

					<!-- Close button -->
					<button
						class="/50 hover: mt-4 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/30 transition-colors hover:bg-white/10"
						onclick={() => (expanded = false)}
					>
						<Fa icon={faXmark} size="lg" />
					</button>
				</div>
			{:else if shouldShowIntro}
				<div
					id="main-card"
					class="motion-preset-shrink flex w-88 flex-col items-center justify-center"
					style="transform: scale({scale}); transform-origin: center;"
				>
					<!-- Intro Card -->
					<div
						class="relative w-full rounded-4xl bg-linear-to-b from-[#ff512f] to-[#dd2476] p-5 pt-14 shadow-2xl"
					>
						<!-- Top Tab -->
						<div
							class="absolute -top-4 left-1/2 -translate-x-1/2 rounded-t-xl rounded-b-md bg-linear-to-b from-[#ffe259] to-[#ffa751] px-8 py-1.5 text-center text-lg font-bold text-nowrap text-[#c62828] shadow-md"
						>
							DDNet 里程红包
						</div>

						<div class="mb-1 text-center font-bold">
							您好，{name}
						</div>
						<div class="mb-12 text-center font-bold">您有一份 5000 里程礼包等待领取</div>

						<!-- White Inner Card -->
						<div
							class="relative -mt-4 mb-8 overflow-hidden rounded-2xl bg-white p-5 text-center shadow-inner"
						>
							<!-- Faint background patterns -->
							<div
								class="absolute top-4 left-4 h-12 w-12 rounded-full bg-pink-100 opacity-60"
							></div>
							<div
								class="absolute top-8 left-12 h-16 w-16 rounded-full bg-orange-50 opacity-40"
							></div>
							<div class="absolute top-6 right-6 h-6 w-6 rounded-full bg-pink-100 opacity-60"></div>
							<div
								class="absolute top-6 right-14 h-4 w-4 rounded-full bg-pink-100 opacity-60"
							></div>

							<div class="relative z-10 flex items-baseline justify-center text-[#ea3d31]">
								<span class="text-6xl font-bold tracking-tighter">5000</span>
								<span class="ml-1 text-2xl font-bold">pts</span>
							</div>
						</div>

						<!-- Bottom Button -->
						<button
							class="mb-6 w-full cursor-pointer rounded-full bg-linear-to-b from-[#ffe259] to-[#ffa751] py-4 text-xl font-bold text-[#c62828] shadow-[0_6px_0_#d84315] transition-all hover:scale-102 active:translate-y-1.5"
							onclick={() => createSelfSave()}
						>
							立即领取
						</button>
					</div>

					<!-- Close button -->
					<button
						class="/50 hover: mt-4 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/30 transition-colors hover:bg-white/10"
						onclick={() => (expanded = false)}
					>
						<Fa icon={faXmark} size="lg" />
					</button>
				</div>
			{:else}
				<div
					id="main-card"
					class="motion-preset-shrink flex w-88 flex-col items-center justify-center"
					style="transform: scale({scale}); transform-origin: center;"
				>
					<!-- Top text -->
					<div
						class="mb-8 text-center text-xl font-bold text-[#ffebc8]"
						style="text-shadow: 0 0 10px #ff8c00, 0 0 20px #ff8c00;"
					>
						{saveData?.owner == name ? '恭喜获得 DDNet 里程助力红包！' : `${name} 邀请你为TA助力！`}
					</div>

					<!-- Main Card -->
					<div
						class="relative w-full rounded-4xl bg-linear-to-b from-[#ff512f] to-[#dd2476] px-5 py-2 pt-14 shadow-2xl"
					>
						<!-- Top Tab -->
						<div
							class="absolute -top-4 left-1/2 -translate-x-1/2 rounded-t-xl rounded-b-md bg-linear-to-b from-[#ffe259] to-[#ffa751] px-8 py-1.5 text-lg font-bold text-nowrap text-[#c62828] shadow-md"
						>
							待领取里程
						</div>

						<!-- White Inner Card -->
						<div
							class="relative -mt-4 mb-2 overflow-hidden rounded-2xl bg-white p-5 text-center shadow-inner"
						>
							<!-- Faint background patterns -->
							<div
								class="absolute top-4 left-4 h-12 w-12 rounded-full bg-pink-100 opacity-60"
							></div>
							<div
								class="absolute top-8 left-12 h-16 w-16 rounded-full bg-orange-50 opacity-40"
							></div>
							<div class="absolute top-6 right-6 h-6 w-6 rounded-full bg-pink-100 opacity-60"></div>
							<div
								class="absolute top-6 right-14 h-4 w-4 rounded-full bg-pink-100 opacity-60"
							></div>

							<div class="relative z-10 flex items-baseline justify-center text-[#ea3d31]">
								<span class="text-6xl font-bold tracking-tighter"
									>{displayPointsHundreds / 100}</span
								>
								<span class="ml-1 text-2xl font-bold">pts</span>
							</div>
						</div>

						<!-- Progress Section -->
						<div class="relative mt-4 mb-6 px-2">
							{#if count >= 15}
								<!-- Tooltip -->
								<div
									in:fade
									class="absolute -top-7 right-0 animate-bounce rounded bg-[#ffe259] px-2 py-0.5 text-sm font-bold text-[#c62828]"
								>
									{#if points < 5000}
										仅差{trimZero(
											(((5000 - displayPointsHundreds / 100) / 5000) * 100).toFixed(4)
										)}%
									{:else}
										已达成！
									{/if}
									<div class="absolute right-2 -bottom-1 h-2 w-2 rotate-45 bg-[#ffe259]"></div>
								</div>
							{/if}

							<!-- Progress Bar -->
							<div class="relative h-3.5 w-full rounded-full bg-[#a72020]/40">
								<div
									class="absolute top-0 left-0 h-full rounded-full bg-linear-to-r from-[#ffe259] to-[#ffa751]"
									style="width: {(displayPointsHundreds / 100 / 5000) * 100}%"
								></div>

								<!-- Markers -->
								<div
									class="absolute top-1/2 left-[20%] flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full {points >=
									1000
										? 'bg-[#ffe259] text-[#c62828]'
										: 'bg-white/50 text-transparent'} text-[10px] shadow-sm transition-colors duration-500"
								>
									✓
								</div>
								<div
									class="absolute top-1/2 left-[50%] flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full {points >=
									2500
										? 'bg-[#ffe259] text-[#c62828]'
										: 'bg-white/50 text-transparent'} text-[10px] shadow-sm transition-colors duration-500"
								>
									✓
								</div>
								<div
									class="absolute top-1/2 left-full flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full {points >=
									5000
										? 'bg-[#ffe259] text-[#c62828]'
										: 'bg-white/50 text-transparent'} text-[10px] shadow-sm transition-colors duration-500"
								>
									✓
								</div>
							</div>

							<!-- Labels -->
							<div class="relative mt-2 flex w-full justify-between px-2 text-sm text-[#ffebc8]/80">
								<span class="absolute left-[12.5%]">1000pts</span>
								<span class="absolute left-[42%]">2500pts</span>
								<span class="absolute right-[0%]">5000pts</span>
							</div>
						</div>

						<div
							class="px-2rounded-2xl mx-4 mb-2 flex h-26 flex-col items-start justify-center gap-1 text-sm"
						>
							<!-- Initial task -->
							{#if saveData?.owner === name && points <= 5000}
								<div class="flex items-center justify-center">
									<Fa icon={faListCheck} class="mr-1.5 " />
									助力加速任务
								</div>
								<div class="flex w-full items-center justify-between px-4 font-bold">
									<span
										class="justify-left flex items-center"
										class:line-through={!!saveData?.initialTask}
									>
										<Fa icon={!saveData?.initialTask ? faCircle : faCircleCheck} class="mr-1.5 " />
										分享助力链接
									</span>
									<span
										class="rounded-full border border-[#c62828] bg-linear-to-b from-[#ffe259] to-[#ffa751] px-2 font-bold text-[#c62828]"
										class:opacity-50={!!saveData?.initialTask}>助力 +1</span
									>
								</div>
								<div class="flex w-full items-center justify-between px-4 font-bold">
									<span
										class="justify-left flex items-center"
										class:line-through={!!saveData?.otherTask}
									>
										<Fa icon={!saveData?.otherTask ? faCircle : faCircleCheck} class="mr-1.5 " />
										为他人助力
									</span>
									<span
										class="rounded-full border border-[#c62828] bg-linear-to-b from-[#ffe259] to-[#ffa751] px-2 font-bold text-[#c62828]"
										class:opacity-50={!!saveData?.otherTask}>助力 +1</span
									>
								</div>
								<div class="flex items-center justify-center">
									<Fa icon={points < 5000 ? faCircle : faCircleCheck} class="mr-1.5 " />
									满5000里程即可结算
								</div>
							{:else}
								<div
									class="flex items-center justify-center font-bold"
									class:line-through={saveData?.names.has(name)}
								>
									<Fa icon={saveData?.names.has(name) ? faCircleCheck : faCircle} class="mr-1.5 " />
									{name} 邀请你为TA助力
								</div>
								<div class="text mt-5 flex w-full items-center justify-around">
									<span>想要和TA一样领取里程？</span>
									<a
										href="/ddnet/tool/zhuli"
										class="rounded-full border border-[#c62828] bg-linear-to-b from-[#ffe259] to-[#ffa751] px-3 py-0.5 text-xl font-bold text-[#c62828] transition-all hover:scale-105"
									>
										{#if saveData?.owner}
											查看进度
										{:else}
											点击领取
										{/if}
									</a>
								</div>
							{/if}
						</div>

						{#if points >= 5000 && saveData?.owner == name}
							<button
								class="h-16 w-full cursor-pointer rounded-full bg-linear-to-b from-[#ffe259] to-[#ffa751] text-xl font-bold text-[#c62828] [box-shadow:0_6px_0_#d84315,0_0_15px_#ffe259] transition-all hover:scale-102 hover:[box-shadow:0_6px_0_#d84315,0_0_20px_#ffe259] active:translate-y-1.5"
								onclick={claimPoints}
							>
								助力达成，结算里程
							</button>
						{:else if saveData?.owner != name}
							{#if !saveData || !saveData.names.has(name)}
								<button
									class="h-16 w-full cursor-pointer rounded-full bg-linear-to-b from-[#d946ef] to-[#a855f7] text-xl font-bold [box-shadow:0_6px_0_#7e22ce,0_0_15px_#ffe259] transition-all hover:scale-102 hover:[box-shadow:0_6px_0_#7e22ce,0_0_20px_#ffe259] active:translate-y-1.5"
									onclick={() => increaseForOthers()}
								>
									给TA助力
								</button>
							{:else if saveData?.owner}
								<button
									class="h-16 w-full cursor-pointer rounded-full bg-linear-to-b from-[#ffe259] to-[#ffa751] text-lg font-bold text-[#c62828] [box-shadow:0_6px_0_#d84315,0_0_15px_#ffe259] transition-all hover:scale-102 hover:[box-shadow:0_6px_0_#d84315,0_0_20px_#ffe259] active:translate-y-1.5"
									onclick={() => goto('/ddnet/tool/zhuli')}
								>
									<p>为TA助力成功</p>
									<p>点击查看自己的红包进度</p>
								</button>
							{:else}
								<button
									class="h-16 w-full cursor-pointer rounded-full bg-linear-to-b from-[#ffe259] to-[#ffa751] text-lg font-bold text-[#c62828] [box-shadow:0_6px_0_#d84315,0_0_15px_#ffe259] transition-all hover:scale-102 hover:[box-shadow:0_6px_0_#d84315,0_0_20px_#ffe259] active:translate-y-1.5"
									onclick={() => goto('/ddnet/tool/zhuli')}
								>
									<p>为TA助力成功</p>
									<p>点击领取你的里程红包</p>
								</button>
							{/if}
						{:else}
							<button
								class="h-16 w-full cursor-pointer rounded-full bg-linear-to-b from-[#d74848] to-[#e72d2d] text-xl font-bold [box-shadow:0_6px_0_#b91c1c,0_0_15px_#ffe259] transition-all hover:scale-102 hover:[box-shadow:0_6px_0_#b91c1c,0_0_20px_#ffe259] active:translate-y-1.5"
								onclick={copyLink}
							>
								请好友助力
							</button>
						{/if}

						<div class="-mt-4 w-full rounded-b-4xl bg-red-900/30 py-0.5 pt-2">
							<div class="/70 mt-4 flex items-center justify-center text-xs">
								<Fa icon={faUser} class="mr-1.5 " />
								已有{count}人助力
							</div>
							<div class="/70 flex items-center justify-center text-xs">
								<Fa icon={faClock} class="text-#bd5959 mr-1.5" />
								剩余时间：{remainingTime}
							</div>
						</div>

						<!-- Boost Toasts -->
						{#each boostToasts as toast (toast.id)}
							<div
								class="boost-toast pointer-events-none fixed z-[55] flex items-center justify-center px-4 py-2 text-xl font-bold text-nowrap text-[#ffd6ba]"
								style="left: {toast.x}px; top: {toast.y}px; text-shadow: 0 0 10px #643c14, 0 0 20px #644014, 0 0 30px #4a2308;"
							>
								获得 +1 助力
							</div>
						{/each}
					</div>

					<!-- Close button -->
					<button
						class="/50 hover: mt-4 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/30 transition-colors hover:bg-white/10"
						onclick={() => (expanded = false)}
					>
						<Fa icon={faXmark} size="lg" />
					</button>
				</div>
			{/if}
		</div>
	{:else if !loading}
		<button
			class="fixed right-4 bottom-4 z-50 flex h-12 touch-none items-center justify-center gap-1 rounded-full bg-red-700 px-4 shadow-lg select-none hover:bg-red-800"
			onclick={() => (expanded = true)}
			style="-webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;"
			oncontextmenu={(e) => e.preventDefault()}
		>
			<Fa icon={faCoins} />
			<span class="text-sm">红包进度</span>
		</button>
	{/if}
{/if}

<!-- Toast -->
{#if showToast}
	<div
		in:fade={{ duration: 100 }}
		out:fade={{ duration: 100 }}
		class="motion-preset-shake fixed top-1/2 left-1/2 z-[60] w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-linear-to-b from-[#ffe259] to-[#ffa751] px-6 py-3 text-center font-bold text-[#c62828] shadow-2xl shadow-black/80"
	>
		<p>已成功复制助力链接！</p>
		<p>快发送给好友吧！</p>
	</div>
{/if}

<!-- Custom Modal -->
{#if showModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
		onclick={() => (showModal = false)}
	>
		<div
			class="relative w-full max-w-sm rounded-3xl bg-linear-to-b from-[#ff512f] to-[#dd2476] p-6 shadow-2xl"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="mb-4 text-center text-xl font-bold text-white">复制失败！请手动复制链接</div>
			<div class="rounded-xl bg-white p-2 shadow-inner">
				<textarea
					class="w-full resize-none rounded-lg border-none bg-transparent p-2 text-sm text-gray-600 focus:outline-none"
					rows="3"
					readonly
					value={copyText}
				></textarea>
			</div>
			<button
				class="mt-6 w-full cursor-pointer rounded-full bg-linear-to-b from-[#ffe259] to-[#ffa751] py-3 text-lg font-bold text-[#c62828] shadow-[0_4px_0_#d84315] transition-all hover:scale-102 active:translate-y-1 active:shadow-none"
				onclick={() => (showModal = false)}
			>
				关闭
			</button>
		</div>
	</div>
{/if}

<div class="shrinking hidden"></div>

<style>
	.boost-toast {
		animation: slideUpFade 1.5s ease-out forwards;
	}

	@keyframes slideUpFade {
		0% {
			opacity: 0;
			transform: translateY(20px) scale(1.5);
		}
		10% {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
		80% {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
		100% {
			opacity: 0;
			transform: translateY(-10px) scale(1);
		}
	}

	.shrinking {
		animation: shrinkFade 1s ease-in forwards;
	}

	@keyframes shrinkFade {
		0% {
			opacity: 1;
			transform: scale(1) translateX(0) translateY(0);
		}
		100% {
			opacity: 0;
			transform: scale(0) translateX(-100%) translateY(-100%);
		}
	}
</style>
