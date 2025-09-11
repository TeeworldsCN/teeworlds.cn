<script lang="ts">
	import { onMount } from 'svelte';
	import Fa from 'svelte-fa';
	import { faXmark, faCoins, faGamepad } from '@fortawesome/free-solid-svg-icons';
	import TeeRender from './TeeRender.svelte';
	import { browser } from '$app/environment';

	let { points = $bindable(0), skin, body, feet, name } = $props();

	let show = $state(true);
	let expanded = $state(true);
	let pointsPerClick = $state(1);
	let pointsPerSecond = $state(0);

	// Track discovered upgrades
	let discovered = $state({
		autoFinish: false,
		hammer: false,
		hook: false,
		jetpack: false,
		grenade: false,
		laser: false
	}) as { [key: string]: boolean };

	// Define upgrade levels separately
	let levels = $state({
		autoFinish: 0,
		hammer: 0,
		hook: 0,
		jetpack: 0,
		grenade: 0,
		laser: 0
	}) as { [key: string]: number };

	// Upgrades definition without levels
	let upgrades = $state({
		autoFinish: {
			cost: 10,
			name: '自动完成',
			description: '每秒自动获得点数',
			getEffect: (level: number) => level * 1.2,
			getCost: (level: number) => Math.floor(10 * Math.pow(1.3, level))
		},
		hammer: {
			cost: 50, // Increased from 25 (5x of previous)
			name: '锤子升级',
			description: '增加点击获得的点数',
			getEffect: (level: number) => level * 3,
			getCost: (level: number) => Math.floor(50 * Math.pow(1.4, level))
		},
		hook: {
			cost: 250, // Increased from 100 (5x of previous)
			name: '钩子升级',
			description: '大幅提升每秒获得的点数',
			getEffect: (level: number) => level * 8,
			getCost: (level: number) => Math.floor(250 * Math.pow(1.6, level))
		},
		jetpack: {
			cost: 1000, // Increased from 250 (4x of previous)
			name: '喷气背包',
			description: '显著提升每秒获得的点数',
			getEffect: (level: number) => level * 12,
			getCost: (level: number) => Math.floor(1000 * Math.pow(1.7, level))
		},
		grenade: {
			cost: 5000, // Increased from 1000 (5x of previous)
			name: '弹射榴弹',
			description: '大幅提升点击获得的点数',
			getEffect: (level: number) => level * 15,
			getCost: (level: number) => Math.floor(5000 * Math.pow(1.8, level))
		},
		laser: {
			cost: 25000, // Increased from 2500 (5x of previous)
			name: '解冻激光',
			description: '极大提升每秒获得的点数',
			getEffect: (level: number) => level * 25,
			getCost: (level: number) => Math.floor(25000 * Math.pow(2.0, level))
		}
	}) as {
		[key: string]: {
			cost: number;
			name: string;
			description: string;
			getEffect: (level: number) => number;
			getCost: (level: number) => number;
		};
	};

	const STORAGE_KEY = 'ddidle:';

	// Save game state
	const saveGame = () => {
		if (!browser) return;
		if (points < 10 && levels.autoFinish == 0) return;
		const gameState = {
			p: points,
			l: levels,
			d: discovered
		};
		localStorage.setItem(STORAGE_KEY + name, JSON.stringify(gameState));
	};

	// Auto-collect points
	onMount(() => {
		if (browser) {
			const savedState = localStorage.getItem(STORAGE_KEY + name);
			if (savedState) {
				const state = JSON.parse(savedState);
				points = state.p || 0;
				levels = state.l ?? levels;
				discovered = state.d ?? discovered;
				// update costs
				Object.keys(upgrades).forEach((key) => {
					upgrades[key].cost = upgrades[key].getCost(levels[key]);
				});
			}
		}

		const interval = setInterval(() => {
			// Calculate points per second
			const autoFinishPoints = upgrades.autoFinish.getEffect(levels.autoFinish);
			const hookPoints = upgrades.hook.getEffect(levels.hook);
			const jetpackPoints = upgrades.jetpack.getEffect(levels.jetpack);
			const laserPoints = upgrades.laser.getEffect(levels.laser);
			pointsPerSecond = autoFinishPoints + hookPoints + jetpackPoints + laserPoints;
			points += pointsPerSecond / 10;

			// Calculate points per click
			const hammerBonus = upgrades.hammer.getEffect(levels.hammer);
			const grenadeBonus = upgrades.grenade.getEffect(levels.grenade);
			pointsPerClick = 1 + hammerBonus + grenadeBonus;

			Object.keys(upgrades).forEach((key) => {
				if (!discovered[key] && points >= upgrades[key].cost / 2) {
					discovered[key] = true;
					discovered = discovered;
				}
			});
		}, 100);

		const saveInterval = setInterval(saveGame, 1000);

		return () => {
			clearInterval(interval);
			clearInterval(saveInterval);
			saveGame();
		};
	});

	function clickTee() {
		points += pointsPerClick;
	}

	function buyUpgrade(upgradeKey: keyof typeof upgrades) {
		const upgrade = upgrades[upgradeKey];
		if (points >= upgrade.cost) {
			points -= upgrade.cost;
			levels[upgradeKey]++;
			upgrade.cost = upgrade.getCost(levels[upgradeKey]);
			upgrades = upgrades; // trigger reactivity
			levels = levels; // trigger reactivity
		}
	}
</script>

{#if show}
	{#if expanded}
		<div
			class="fixed bottom-4 right-4 z-50 flex max-h-[calc(100svh-2rem)] w-80 max-w-[calc(100svw-2rem)] touch-none select-none flex-col rounded-lg border border-slate-500 bg-slate-800 text-slate-300 shadow-lg"
			style="-webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;"
		>
			<div class="pointer-events-auto flex items-center justify-between p-4">
				<h2 class="text-lg font-bold">DDNet 恰分工具</h2>
				<div class="flex gap-2">
					<button class="text-slate-400 hover:text-slate-200" onclick={() => (expanded = false)}>
						<Fa icon={faXmark} />
					</button>
				</div>
			</div>

			<div class="pointer-events-none px-4 text-center">
				<div class="flex items-center justify-center gap-2 text-xl font-bold">
					<Fa icon={faCoins} />
					<span>{Math.floor(points)} 里程</span>
				</div>
				<div class="text-sm text-slate-400">
					每秒: {Math.round(pointsPerSecond)} | 每次点击: {pointsPerClick}
				</div>
			</div>

			<div class="flex justify-center px-4 py-4">
				<button
					class="relative h-20 w-20 select-none rounded-lg bg-slate-700 transition-all hover:bg-slate-600 active:scale-95"
					onclick={clickTee}
				>
					<TeeRender
						useDefault
						name={skin}
						{body}
						{feet}
						className="w-full h-full pointer-events-none"
					/>
				</button>
			</div>

			<div class="scrollbar-subtle flex-1 overflow-y-auto px-4 pb-4">
				<div class="space-y-2">
					{#each Object.entries(upgrades) as [key, upgrade]}
						<button
							class="w-full rounded bg-slate-700 p-2 hover:bg-slate-600 disabled:opacity-50 disabled:hover:bg-slate-700"
							disabled={points < upgrade.cost}
							onclick={() => buyUpgrade(key as keyof typeof upgrades)}
						>
							<div class="flex items-center justify-between">
								<span>
									{discovered[key] ? `${upgrade.name} (Lv.${levels[key]})` : '??? (Lv.0)'}
								</span>
								<span>
									{discovered[key] ? `${Math.floor(upgrade.cost)} 点数` : '???'}
								</span>
							</div>
							<div class="text-left text-sm text-slate-400">
								{discovered[key] ? upgrade.description : '???'}
							</div>
						</button>
					{/each}
				</div>
			</div>
		</div>
	{:else}
		<button
			class="fixed bottom-4 right-4 z-50 flex h-12 w-12 touch-none select-none items-center justify-center rounded-full bg-slate-800 text-slate-300 shadow-lg hover:bg-slate-700"
			onclick={() => (expanded = true)}
			style="-webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;"
			oncontextmenu={(e) => e.preventDefault()}
		>
			<div class="relative">
				<Fa icon={faGamepad} />
			</div>
		</button>
	{/if}
{/if}

<style>
	button {
		transition: all 0.2s ease;
		touch-action: manipulation;
	}
</style>
