<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { alert, tippy } from '$lib/tippy';
	import Fa from 'svelte-fa';
	import {
		faPlus,
		faTrash,
		faRefresh,
		faUser,
		faBell,
		faBellSlash
	} from '@fortawesome/free-solid-svg-icons';
	import { SvelteMap } from 'svelte/reactivity';
	import TeeRender from '$lib/components/TeeRender.svelte';

	const { show }: { show: boolean } = $props();

	type PlayerTarget = {
		id: string;
		name: string;
		clan?: string;
		region?: string;
		enabled: boolean;
		lastSeen?: number; // timestamp when last found
		lastNotified?: number; // timestamp when last notified
	};

	type PlayerResult = {
		server: {
			name: string;
			addresses: string;
			location?: string;
			game_type: string;
			map: string;
		};
		client: {
			name: string;
			clan: string;
			skin: any;
		};
	};

	type FoundPlayer = {
		target: PlayerTarget;
		results: PlayerResult[];
	};

	// Cache configuration
	const STORAGE_KEY = 'player_finder_targets';
	const COMMUNITY_STORAGE_KEY = 'player_finder_community';
	const SEARCH_INTERVAL = 5 * 60 * 1000; // 5 minutes
	const OFFLINE_THRESHOLD = 15 * 60 * 1000; // 15 minutes

	let targets: PlayerTarget[] = $state([]);
	let loading = $state(false);
	let searchInterval: NodeJS.Timeout | null = null;
	let targetServers: SvelteMap<string, PlayerResult[]> = $state(new SvelteMap());

	// Form states
	let showAddForm = $state(false);
	let formData = $state({
		name: '',
		clan: '',
		region: ''
	});

	// Community selector state
	let selectedCommunity = $state('');

	// Component root element reference
	let rootElement: HTMLElement;

	// Generate unique ID for new targets
	const generateId = () => {
		return crypto.randomUUID();
	};

	// Load targets from localStorage
	const loadTargets = () => {
		if (typeof window === 'undefined') return;
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				targets = JSON.parse(stored);
			}
		} catch (err) {
			console.warn('Failed to load player targets from storage:', err);
			targets = [];
		}
	};

	// Load community setting from localStorage
	const loadCommunity = () => {
		if (typeof window === 'undefined') return;
		try {
			const stored = localStorage.getItem(COMMUNITY_STORAGE_KEY);
			if (stored) {
				selectedCommunity = stored;
			}
		} catch (err) {
			console.warn('Failed to load community setting from storage:', err);
			selectedCommunity = '';
		}
	};

	// Save targets to localStorage
	const saveTargets = () => {
		if (typeof window === 'undefined') return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(targets));
		} catch (err) {
			console.warn('Failed to save player targets to storage:', err);
		}
	};

	// Save community setting to localStorage
	const saveCommunity = () => {
		if (typeof window === 'undefined') return;
		try {
			localStorage.setItem(COMMUNITY_STORAGE_KEY, selectedCommunity);
		} catch (err) {
			console.warn('Failed to save community setting to storage:', err);
		}
	};

	// Add new target
	const addTarget = () => {
		if (!formData.name.trim()) {
			alert({ message: '请输入玩家名称', type: 'error', attachTo: rootElement });
			return;
		}

		// Check if target already exists
		const exists = targets.some(
			(t) =>
				t.name === formData.name.trim() &&
				t.clan === formData.clan.trim() &&
				t.region === formData.region.trim()
		);

		if (exists) {
			alert({ message: '该目标已存在', type: 'error', attachTo: rootElement });
			return;
		}

		const newTarget: PlayerTarget = {
			id: generateId(),
			name: formData.name.trim(),
			clan: formData.clan.trim() || undefined,
			region: formData.region.trim() || undefined,
			enabled: true
		};

		targets.push(newTarget);
		saveTargets();

		// Reset form
		formData = { name: '', clan: '', region: '' };
		showAddForm = false;
		alert({ message: `新的追踪目标: ${newTarget.name}`, type: 'success', attachTo: rootElement });
	};

	// Remove target
	const removeTarget = (id: string) => {
		alert({
			message: `已删除追踪目标: ${targets.find((t) => t.id === id)!.name}`,
			type: 'success',
			attachTo: rootElement
		});
		targets = targets.filter((t) => t.id !== id);
		saveTargets();
	};

	// Toggle target enabled state
	const toggleTarget = (id: string) => {
		const target = targets.find((t) => t.id === id);
		if (target) {
			target.enabled = !target.enabled;
			saveTargets();
		}
	};

	// Search for players
	const searchPlayers = async (firstTime = false) => {
		if (loading) return;

		const enabledTargets = targets.filter((t) => t.enabled);
		if (enabledTargets.length === 0) return;

		loading = true;

		try {
			// Prepare search criteria for API
			const searchCriteria = enabledTargets.map((target) => ({
				name: target.name,
				clan: target.clan,
				region: target.region
			}));

			// Build URL with community parameter if selected
			const url = new URL('/api/find', window.location.origin);
			if (selectedCommunity) {
				url.searchParams.set('community', selectedCommunity);
			}

			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(searchCriteria)
			});

			if (!response.ok) {
				throw new Error(`搜索失败: ${response.status}`);
			}

			const results: PlayerResult[] = await response.json();
			const now = Date.now();
			const foundPlayers: FoundPlayer[] = [];

			// Clear previous server mappings
			targetServers.clear();

			// Process results and collect found players
			for (const result of results) {
				const target = enabledTargets.find(
					(t) =>
						t.name === result.client.name &&
						(!t.clan || t.clan === result.client.clan) &&
						(!t.region || result.server.location?.startsWith(t.region))
				);

				if (target) {
					// Store server for this target
					if (!targetServers.has(target.id)) {
						targetServers.set(target.id, []);
					}
					targetServers.get(target.id)!.push(result);

					const wasOffline =
						firstTime || !target.lastSeen || now - target.lastSeen > OFFLINE_THRESHOLD;

					target.lastSeen = now;

					if (wasOffline) {
						target.lastNotified = now;

						// Find or create entry for this target
						let foundPlayer = foundPlayers.find((fp) => fp.target.id === target.id);
						if (!foundPlayer) {
							foundPlayer = { target, results: [] };
							foundPlayers.push(foundPlayer);
						}
						foundPlayer.results.push(result);
					}
				}
			}

			// Send single notification if any players were found
			if (foundPlayers.length > 0) {
				showPlayersNotification(foundPlayers);
			}

			// No need to track offline status anymore since we simplified the logic

			saveTargets();
		} catch (err) {
			console.error('Failed to search players:', err);
			alert({
				message: err instanceof Error ? err.message : '搜索失败',
				type: 'error',
				attachTo: rootElement
			});
		} finally {
			loading = false;
		}
	};

	// Show notification for found players
	const showPlayersNotification = (foundPlayers: FoundPlayer[]) => {
		let title: string;
		let body: string;

		if (foundPlayers.length === 1) {
			const player = foundPlayers[0];
			title = `玩家 ${player.target.name} 上线了！`;
			if (player.results.length === 1) {
				const result = player.results[0];
				body = `在 ${result.server.name} 玩 ${result.server.game_type} - ${result.server.map}`;
			} else {
				body = `在 ${player.results.length} 个服务器上发现`;
			}
		} else {
			title = `发现 ${foundPlayers.length} 个目标玩家上线！`;
			const playerNames = foundPlayers.map((fp) => fp.target.name).join(', ');
			body = playerNames;
		}

		// Browser notification
		if ('Notification' in window && Notification.permission === 'granted') {
			try {
				new Notification(title, {
					body,
					icon: '/favicon.png',
					badge: '/favicon.png',
					tag: 'player-finder-batch'
				});
			} catch (error) {
				console.error('Error showing notification:', error);
			}
		}

		console.log(`Player Finder: ${title} - ${body}`);
	};

	let lastAutoSearchTime = $state(Date.now());

	// Start automatic searching
	const startSearching = () => {
		if (searchInterval) return;

		searchInterval = setInterval(() => {
			lastAutoSearchTime = Date.now();
			searchPlayers();
		}, SEARCH_INTERVAL);
		// Also search immediately
		searchPlayers(true);
	};

	// Stop automatic searching
	const stopSearching = () => {
		if (searchInterval) {
			clearInterval(searchInterval);
			searchInterval = null;
		}
	};

	// Format time display
	const formatTime = (timestamp?: number) => {
		if (!timestamp) return '从未';
		return new Date(timestamp).toLocaleString('zh-CN', {
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
	};

	// Sort targets by last seen (most recent first)
	const sortedTargets = $derived(() => {
		return [...targets].sort((a, b) => {
			// Put targets with lastSeen first, then sort by timestamp (most recent first)
			if (!a.lastSeen && !b.lastSeen) return 0;
			if (!a.lastSeen) return 1;
			if (!b.lastSeen) return -1;
			return b.lastSeen - a.lastSeen;
		});
	});

	// Copy server address to clipboard
	const copyServerAddress = async (address: string) => {
		try {
			await navigator.clipboard.writeText(address);
			alert({ message: '服务器地址已复制到剪贴板', type: 'success', attachTo: rootElement });
		} catch (err) {
			console.error('Failed to copy address:', err);
			alert({ message: '复制失败', type: 'error', attachTo: rootElement });
		}
	};

	let realtimeTick = $state(0);
	let realtimeInterval: NodeJS.Timeout | null = null;

	onMount(() => {
		loadTargets();
		loadCommunity();
		startSearching();
		realtimeInterval = setInterval(() => {
			realtimeTick++;
		}, 1000);
	});

	onDestroy(() => {
		stopSearching();
		if (realtimeInterval) {
			clearInterval(realtimeInterval);
			realtimeInterval = null;
		}
	});
</script>

<div
	bind:this={rootElement}
	class="scrollbar-subtle container max-h-[calc(100svh-8rem)] overflow-y-auto rounded-l-lg rounded-br-lg bg-slate-700 p-3 text-left shadow-lg"
>
	<!-- Header -->
	<div class="mb-4 flex items-center justify-between">
		<h2 class="mr-8 text-xl font-bold text-slate-300">玩家追踪工具</h2>
		<div class="flex items-center gap-2">
			<!-- Community Selector -->
			<select
				id="community-select"
				bind:value={selectedCommunity}
				onchange={() => {
					saveCommunity();
					searchPlayers();
				}}
				class="rounded border border-slate-500 bg-slate-800 px-3 py-1 text-slate-300"
				use:tippy={{ content: '选择服务器社区' }}
			>
				<option value="">任意</option>
				<option value="ddnet">DDNet</option>
			</select>

			{#if showAddForm}
				<button
					onclick={() => (showAddForm = false)}
					class="flex items-center gap-2 rounded bg-slate-600 px-3 py-1 text-white hover:bg-slate-500"
				>
					<Fa icon={faUser} />
					目标列表
				</button>
			{:else}
				<button
					onclick={() => (showAddForm = true)}
					class="flex items-center gap-2 rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700"
				>
					<Fa icon={faPlus} />
					添加目标
				</button>
				<button
					onclick={() => searchPlayers()}
					disabled={loading}
					class="flex items-center gap-2 rounded bg-green-600 px-3 py-1 text-white hover:bg-green-700 disabled:opacity-50"
				>
					<Fa icon={faRefresh} />
					立即搜索
				</button>
			{/if}
		</div>
	</div>

	<!-- Add Target Form -->
	{#if showAddForm}
		<div class="mb-6 rounded-lg bg-slate-600 p-4">
			<h3 class="mb-3 text-lg font-bold">添加搜索目标</h3>
			<form
				onsubmit={(e) => {
					e.preventDefault();
					addTarget();
				}}
				class="space-y-3"
			>
				<div>
					<label for="target-name" class="mb-1 block text-sm font-medium">玩家名称 *</label>
					<input
						id="target-name"
						type="text"
						placeholder="玩家名称"
						class="w-full rounded border border-slate-500 bg-slate-800 px-3 py-1 text-slate-300"
						bind:value={formData.name}
						required
					/>
				</div>
				<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
					<div>
						<label for="target-clan" class="mb-1 block text-sm font-medium">战队 (可选)</label>
						<input
							id="target-clan"
							type="text"
							placeholder="战队名称"
							class="w-full rounded border border-slate-500 bg-slate-800 px-3 py-1 text-slate-300"
							bind:value={formData.clan}
						/>
					</div>
					<div>
						<label for="target-region" class="mb-1 block text-sm font-medium">地区 (可选)</label>
						<div class="flex flex-col gap-2 sm:flex-row">
							<input
								id="target-region"
								type="text"
								placeholder="如: as, eu, na"
								class="w-full rounded border border-slate-500 bg-slate-800 px-3 py-1 text-slate-300"
								bind:value={formData.region}
							/>
							<div class="flex gap-1">
								<button
									type="button"
									onclick={() => {
										formData.region = 'as:cn';
									}}
									class="whitespace-nowrap rounded bg-slate-600 px-2 py-1 text-xs text-white hover:bg-slate-500"
									title="as:cn"
								>
									国服
								</button>
							</div>
						</div>
					</div>
				</div>
				<div class="flex gap-2">
					<button
						type="submit"
						class="flex items-center gap-2 rounded bg-blue-600 px-4 py-1 text-white hover:bg-blue-700"
					>
						<Fa icon={faPlus} />
						添加目标
					</button>
				</div>
			</form>
		</div>
	{:else}
		<!-- Target List -->
		<div class="mb-4">
			<div class="mb-2 flex items-center justify-between">
				<div class="text-sm text-slate-400">
					共 {targets.length} 个目标，{targets.filter((t) => t.enabled).length} 个启用
				</div>
				<div class="text-xs text-slate-500">
					{#key realtimeTick}
						{loading
							? '搜索中...'
							: `${Math.floor((SEARCH_INTERVAL - (Date.now() - lastAutoSearchTime)) / 1000)}秒后自动搜索`}
					{/key}
				</div>
			</div>
		</div>

		{#if targets.length === 0}
			<div class="py-8 text-center">
				<div class="text-slate-400">暂无搜索目标</div>
				<div class="mt-2 text-sm text-slate-500">点击"添加目标"开始监控玩家</div>
			</div>
		{:else}
			<!-- Target List -->
			<div class="space-y-2">
				{#each sortedTargets() as target (target.id)}
					<div
						class="rounded-lg border border-slate-600 bg-slate-800 p-3"
						class:opacity-50={!target.enabled}
					>
						<div class="flex items-center justify-between">
							<div class="flex-1">
								<div class="flex items-center gap-2">
									<span class="font-medium text-slate-200">{target.name}</span>
									{#if target.clan}
										<span class="text-sm text-slate-400">[{target.clan}]</span>
									{/if}
									{#if target.region}
										<span class="text-xs text-slate-500">({target.region})</span>
									{/if}
								</div>
								<div class="mt-1 text-xs text-slate-500">
									最后发现: {formatTime(target.lastSeen)}
								</div>
							</div>
							<div class="flex gap-1">
								<button
									onclick={() => toggleTarget(target.id)}
									class="flex items-center gap-1 rounded px-2 py-1 text-xs"
									class:bg-green-600={target.enabled}
									class:hover:bg-green-700={target.enabled}
									class:text-white={target.enabled}
									class:bg-slate-600={!target.enabled}
									class:hover:bg-slate-500={!target.enabled}
									class:text-slate-300={!target.enabled}
									use:tippy={{ content: target.enabled ? '点击禁用' : '点击启用' }}
								>
									<Fa icon={target.enabled ? faBell : faBellSlash} />
								</button>
								<button
									onclick={() => removeTarget(target.id)}
									class="flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
									use:tippy={{ content: '删除目标' }}
								>
									<Fa icon={faTrash} />
								</button>
							</div>
						</div>

						<!-- Servers for this target -->
						{#if targetServers.has(target.id) && targetServers.get(target.id)!.length > 0}
							<div class="mt-3 space-y-1">
								{#each targetServers.get(target.id)! as server}
									<button
										onclick={() => copyServerAddress(server.server.addresses)}
										class="flex items-center gap-2 rounded border border-slate-700 bg-slate-900 p-2 text-left text-xs transition-colors hover:bg-slate-700"
										use:tippy={{ content: '点击复制服务器地址' }}
									>
										<TeeRender
											name={server.client.skin?.name || ''}
											className="w-6 h-6 flex-shrink-0"
											useDefault
											body={server.client.skin?.color_body || null}
											feet={server.client.skin?.color_feet || null}
										/>
										<div class="flex-1">
											<div class="font-medium text-slate-300">{server.server.name}</div>
											<div class="text-slate-500">
												{server.server.game_type} - {server.server.map}
												{#if server.server.location}
													| {server.server.location}
												{/if}
											</div>
										</div>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>
