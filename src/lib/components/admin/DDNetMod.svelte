<script lang="ts">
	import { ipToNumber, numberToIp } from '$lib/helpers';
	import Fa from 'svelte-fa';
	import {
		faRefresh,
		faBan,
		faUnlock,
		faPlus,
		faCopy,
		faList
	} from '@fortawesome/free-solid-svg-icons';
	import VirtualScroll from 'svelte-virtual-scroll-list';
	import { onMount } from 'svelte';

	const { show }: { show: boolean } = $props();

	type BanEntry =
		| {
				type: 'ban';
				region: string;
				ip: number;
				name: string;
				reason: string;
				by: string;
				expires: number;
		  }
		| {
				type: 'ban_range';
				region: string;
				start: number;
				end: number;
				name: string;
				reason: string;
				by: string;
				expires: number;
		  };

	// Cache configuration
	const CACHE_KEY = 'ddnet_bans_cache';
	const CACHE_EXPIRATION = 5 * 60 * 1000; // 5 minutes

	let bans: BanEntry[] = $state([]);
	let lastBansUpdate = $state(0);
	let loading = $state(false);
	let error = $state('');
	let success = $state('');
	let quickCommand = $state('');

	// Form states
	let showBanForm = $state(false);
	let banFormData = $state({
		ip: '',
		ipRangeEnd: '',
		name: '',
		reason: '',
		duration: '10'
	});
	let submitting = $state(false);
	let reasonInput: HTMLInputElement | undefined = $state();
	let durationInput: HTMLInputElement | undefined = $state();

	// Search and filter
	let searchQuery = $state('');

	// Duration parsing function
	const parseDuration = (durationStr: string): { seconds: number; error: string } => {
		const trimmed = durationStr.trim().toLowerCase();
		if (!trimmed) {
			return { seconds: 0, error: '请输入时长' };
		}

		let value: number;
		let unit = 'm'; // Default to minutes

		// Check for units using endsWith
		if (trimmed.endsWith('mo')) {
			value = parseFloat(trimmed.slice(0, -2));
			unit = 'mo';
		} else if (trimmed.endsWith('y')) {
			value = parseFloat(trimmed.slice(0, -1));
			unit = 'y';
		} else if (trimmed.endsWith('d')) {
			value = parseFloat(trimmed.slice(0, -1));
			unit = 'd';
		} else if (trimmed.endsWith('h')) {
			value = parseFloat(trimmed.slice(0, -1));
			unit = 'h';
		} else if (trimmed.endsWith('m')) {
			value = parseFloat(trimmed.slice(0, -1));
			unit = 'm';
		} else {
			// No unit, treat as minutes
			value = parseFloat(trimmed);
			unit = 'm';
		}

		if (isNaN(value) || value <= 0) {
			return { seconds: 0, error: '格式错误，请使用如：30, 1m, 2h, 3d, 4mo, 5y' };
		}

		let seconds: number;
		switch (unit) {
			case 'm':
				seconds = value * 60;
				break;
			case 'h':
				seconds = value * 3600;
				break;
			case 'd':
				seconds = value * 86400;
				break;
			case 'mo':
				seconds = value * 2592000; // 30 days
				break;
			case 'y':
				// Cap years to 6 months maximum
				const maxMonths = 6;
				const monthsRequested = value * 12;
				const actualMonths = Math.min(monthsRequested, maxMonths);
				seconds = actualMonths * 2592000; // 30 days per month
				break;
			default:
				return { seconds: 0, error: '不支持的时间单位' };
		}

		// Cap to 6 months maximum (15552000 seconds)
		const maxSeconds = 6 * 2592000;
		if (seconds > maxSeconds) {
			seconds = maxSeconds;
		}

		return { seconds: Math.floor(seconds), error: '' };
	};

	// Format duration for display with most relevant unit
	const formatDurationDisplay = (seconds: number): string => {
		if (seconds < 3600) {
			// Less than 1 hour, show minutes
			const minutes = Math.round(seconds / 60);
			return `${minutes} 分钟`;
		} else if (seconds < 86400) {
			// Less than 1 day, show hours
			const hours = Math.round(seconds / 3600);
			return `${hours} 小时`;
		} else if (seconds < 2592000) {
			// Less than 1 month (30 days), show days
			const days = Math.round(seconds / 86400);
			return `${days} 天`;
		} else {
			// 1 month or more, show months
			const months = Math.round(seconds / 2592000);
			return `${months} 月`;
		}
	};

	// Cache functions
	const saveBansToCache = (bansData: BanEntry[]) => {
		try {
			const cacheData = {
				bans: bansData,
				timestamp: Date.now()
			};
			localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
		} catch (err) {
			console.warn('Failed to save bans to cache:', err);
		}
	};

	const loadBansFromCache = (): { bans: BanEntry[]; timestamp: number } | null => {
		try {
			const cached = localStorage.getItem(CACHE_KEY);
			if (!cached) return null;

			const cacheData = JSON.parse(cached);
			// Return cached data regardless of age - we'll refresh in background
			if (cacheData.bans && Array.isArray(cacheData.bans)) {
				return cacheData;
			}
		} catch (err) {
			console.warn('Failed to load bans from cache:', err);
		}
		return null;
	};

	const loadBans = async () => {
		error = '';
		loading = true;
		try {
			const response = await fetch('/admin/api/ddnet/bans');
			if (!response.ok) {
				throw new Error(`Error: ${response.status}`);
			}
			const newBans: BanEntry[] = await response.json();
			newBans.sort((a, b) => a.expires - b.expires);
			bans = newBans;

			// Save to cache after successful load
			saveBansToCache(newBans);
		} catch (err) {
			console.error('Failed to load bans:', err);
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	};

	$effect(() => {
		const trimed = quickCommand.trim();
		if (trimed.startsWith('!unban')) {
			showBanForm = false;
			searchQuery = trimed.slice(6).trim();
		} else if (trimed.startsWith('!ban')) {
			const match = trimed.match(
				/!ban ([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})(-[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})? (.*) ([0-9]+(?:m|h|d|mo|y)) (.*)/
			);
			if (match) {
				showBanForm = true;
				banFormData = {
					ip: match[1],
					ipRangeEnd: match[2]?.slice(1) || '',
					name:
						match[3].startsWith("'") && match[3].endsWith("'") ? match[3].slice(1, -1) : match[3],
					reason: match[5],
					duration: match[4]
				};
			}
		} else {
			// general regex
			const match = trimed.match(
				/([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})(?:.*(?:name='(.*)'))?/
			);
			if (match) {
				showBanForm = true;
				banFormData = {
					ip: match[1],
					ipRangeEnd: '',
					name: match[2] || '',
					reason: '',
					duration: '10'
				};
			}
		}
	});

	const handleQuickCommand = () => {
		if (quickCommand.trim()) {
			if (quickCommand.trim().startsWith('!unban')) {
				const data = quickCommand.trim().slice(6).trim().split('-');
				if (data.length == 1) {
					unbanEntry(
						{
							type: 'ban',
							ip: ipToNumber(data[0].trim()),
							region: 'global',
							name: '',
							reason: '快捷指令解封',
							by: '',
							expires: 0
						},
						false
					);
				} else if (data.length == 2) {
					unbanEntry(
						{
							type: 'ban_range',
							start: ipToNumber(data[0].trim()),
							end: ipToNumber(data[1].trim()),
							region: 'global',
							name: '',
							reason: '快捷指令解封',
							by: '',
							expires: 0
						},
						false
					);
				}
			} else if (quickCommand.trim().startsWith('!ban')) {
				submitBan();
			} else {
				durationInput?.focus();
			}
		}

		quickCommand = '';
		searchQuery = '';
	};

	const submitBan = async () => {
		// Clear previous messages
		error = '';
		success = '';

		if (!banFormData.ip || !banFormData.name || !banFormData.reason || !banFormData.duration) {
			error = '请填写所有必填字段';
			return;
		}

		const durationResult = parseDuration(banFormData.duration);
		if (durationResult.error) {
			error = durationResult.error;
			return;
		}

		submitting = true;

		try {
			const response = await fetch('/admin/api/ddnet/bans', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					op: 'ban',
					ip: banFormData.ip,
					ipRangeEnd: banFormData.ipRangeEnd || undefined,
					name: banFormData.name,
					reason: banFormData.reason,
					duration: durationResult.seconds
				})
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(errorText || `Error: ${response.status}`);
			}

			success = '封禁请求已提交';
			clearSuccessAfterDelay();
			showBanForm = false;
			banFormData = {
				ip: '',
				ipRangeEnd: '',
				name: '',
				reason: '',
				duration: '10'
			};

			// Reload bans after a short delay to allow server processing
			setTimeout(loadBans, 1000);
		} catch (err) {
			console.error('Failed to submit ban:', err);
			error = err instanceof Error ? err.message : String(err);
		} finally {
			submitting = false;
		}
	};

	const unbanEntry = async (ban: BanEntry, needConfirm = true) => {
		if (
			needConfirm &&
			!confirm(
				`确定要解封 ${ban.type === 'ban' ? numberToIp(ban.ip) : formatIpRange(ban.start, ban.end)} ${ban.name} (${ban.reason}) 吗？`
			)
		) {
			return;
		}

		// Clear previous messages
		error = '';
		success = '';

		try {
			let ip: string;
			if (ban.type === 'ban') {
				ip = numberToIp(ban.ip);
			} else {
				ip = numberToIp(ban.start);
			}

			const response = await fetch('/admin/api/ddnet/bans', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					op: 'unban',
					ip: ip,
					ipRangeEnd: ban.type === 'ban_range' ? numberToIp(ban.end) : undefined
				})
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(errorText || `Error: ${response.status}`);
			}

			success = '解封请求已提交';
			clearSuccessAfterDelay();

			// Reload bans after a short delay to allow server processing
			setTimeout(loadBans, 1000);
		} catch (err) {
			console.error('Failed to unban:', err);
			error = err instanceof Error ? err.message : String(err);
		}
	};

	const copyUnbanCommand = async (ban: BanEntry) => {
		// Clear previous messages
		error = '';
		success = '';

		let command: string;
		if (ban.type === 'ban') {
			command = `!unban ${numberToIp(ban.ip)}`;
		} else {
			command = `!unban ${numberToIp(ban.start)}-${numberToIp(ban.end)}`;
		}

		try {
			await navigator.clipboard.writeText(command);
			success = '解封指令已复制到剪贴板';
			clearSuccessAfterDelay();
		} catch (err) {
			console.error('Failed to copy:', err);
			error = '复制失败';
		}
	};

	const filteredBans = $derived(() => {
		let result = bans;
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			result = bans.filter((ban) => {
				const ipText =
					ban.type === 'ban'
						? numberToIp(ban.ip)
						: `${numberToIp(ban.start)}-${numberToIp(ban.end)}`;
				return (
					ipText.includes(query) ||
					ban.name.toLowerCase().includes(query) ||
					ban.reason.toLowerCase().includes(query) ||
					ban.by.toLowerCase().includes(query)
				);
			});
		}
		// Add unique key for VirtualScroll
		return result.map((ban) => ({
			...ban,
			key: getBanKey(ban)
		}));
	});

	const formatExpireTime = (timestamp: number) => {
		return new Date(timestamp * 1000).toLocaleString('zh-CN', {
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
	};

	const loadBansIfStale = async () => {
		const timeSinceLastUpdate = Date.now() - lastBansUpdate;
		if (timeSinceLastUpdate > CACHE_EXPIRATION) {
			await loadBans();
		}
	};

	$effect(() => {
		if (show) {
			searchQuery = '';
			quickCommand = '';
			banFormData = {
				ip: '',
				ipRangeEnd: '',
				name: '',
				reason: '',
				duration: '10'
			};

			loadBansIfStale();
		}
	});

	const formatIpRange = (start: number, end: number) => {
		const ipStart = numberToIp(start).split('.');
		const ipEnd = numberToIp(end).split('.');
		const sharedPrefix = ipStart.findIndex((part, index) => part !== ipEnd[index]);
		return `${ipStart.join('.')}-${ipEnd.slice(sharedPrefix).join('.')}`;
	};

	// Generate unique key for each ban entry for VirtualScroll
	const getBanKey = (ban: BanEntry) => {
		if (ban.type === 'ban') {
			return `${ban.type}-${ban.ip}-${ban.expires}`;
		} else {
			return `${ban.type}-${ban.start}-${ban.end}-${ban.expires}`;
		}
	};

	let successTimeout: NodeJS.Timeout | null = null;

	// Clear success message after copying
	const clearSuccessAfterDelay = () => {
		if (successTimeout) {
			clearTimeout(successTimeout);
		}
		successTimeout = setTimeout(() => {
			success = '';
			successTimeout = null;
		}, 2000);
	};

	onMount(() => {
		// Load bans from cache on initial mount
		const cachedBans = loadBansFromCache();
		if (cachedBans) {
			bans = cachedBans.bans;
			lastBansUpdate = cachedBans.timestamp;
		}
	});
</script>

<div
	class="scrollbar-subtle container max-h-[calc(100svh-8rem)] overflow-y-auto rounded-l-lg rounded-br-lg bg-slate-700 p-3 text-left shadow-lg"
>
	<!-- svelte-ignore a11y_autofocus -->
	<input
		id="quick-command"
		type="text"
		placeholder="快速指令 (status 行 / !ban / !unban)"
		class="mb-5 w-full rounded border border-slate-500 bg-slate-800 px-3 py-1 text-slate-300"
		bind:value={quickCommand}
		onkeydown={(e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				handleQuickCommand();
			}
		}}
		autofocus
	/>
	<!-- Header -->
	<div class="mb-4 flex items-center justify-between">
		<h2 class="text-xl font-bold text-slate-300">DDNet 封禁管理</h2>
		<div class="flex gap-2">
			{#if showBanForm}
				<button
					onclick={() => (showBanForm = !showBanForm)}
					class="flex items-center gap-2 rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700 disabled:opacity-50"
				>
					<Fa icon={faList} />
					封禁列表
				</button>
			{:else}
				<button
					onclick={() => (showBanForm = !showBanForm)}
					class="flex items-center gap-2 rounded bg-red-600 px-3 py-1 text-white hover:bg-red-700 disabled:opacity-50"
				>
					<Fa icon={faPlus} />
					添加封禁
				</button>
				<button
					onclick={() => {
						bans = [];
						loadBans();
					}}
					disabled={loading}
					class="flex items-center gap-2 rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700 disabled:opacity-50"
				>
					<Fa icon={faRefresh} />
					刷新
				</button>
			{/if}
		</div>
	</div>

	<!-- Ban Form -->
	{#if showBanForm}
		<div class="mb-6 rounded-lg bg-slate-600 p-4">
			<h3 class="mb-3 text-lg font-bold">添加新封禁</h3>
			<form
				onsubmit={(e) => {
					e.preventDefault();
					submitBan();
				}}
				class="space-y-3"
			>
				<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
					<div>
						<label for="ban-ip" class="mb-1 block text-sm font-medium">IP 地址 *</label>
						<input
							id="ban-ip"
							type="text"
							placeholder="192.168.1.1"
							class="w-full rounded border border-slate-500 bg-slate-800 px-3 py-1 text-slate-300"
							bind:value={banFormData.ip}
							required
						/>
					</div>
					<div>
						<label for="ban-ip-end" class="mb-1 block text-sm font-medium">IP 范围结束 (可选)</label
						>
						<input
							id="ban-ip-end"
							type="text"
							placeholder="192.168.1.255"
							class="w-full rounded border border-slate-500 bg-slate-800 px-3 py-1 text-slate-300"
							bind:value={banFormData.ipRangeEnd}
						/>
					</div>
				</div>
				<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
					<div>
						<label for="ban-name" class="mb-1 block text-sm font-medium">玩家名称 *</label>
						<input
							id="ban-name"
							type="text"
							placeholder="玩家名称"
							class="w-full rounded border border-slate-500 bg-slate-800 px-3 py-1 text-slate-300"
							bind:value={banFormData.name}
							required
						/>
					</div>
					<div>
						<label for="ban-duration" class="mb-1 block text-sm font-medium"
							>封禁时长 * {#if banFormData.duration.trim()}
								{@const result = parseDuration(banFormData.duration)}
								{#if !result.error}
									<span class="mt-1 text-xs text-green-400">
										约 {formatDurationDisplay(result.seconds)}
									</span>
								{/if}
							{/if}</label
						>
						<input
							id="ban-duration"
							type="text"
							placeholder="24h (例如: 1m, 2h, 3d, 4mo, 5y)"
							class="w-full rounded border border-slate-500 bg-slate-800 px-3 py-1 text-slate-300"
							bind:value={banFormData.duration}
							bind:this={durationInput}
							required
						/>
					</div>
				</div>
				<div>
					<label for="ban-reason" class="mb-1 block text-sm font-medium">封禁原因 *</label>
					<div class="flex flex-col gap-2 sm:flex-row">
						<input
							id="ban-reason"
							type="text"
							placeholder="违规行为描述"
							class="flex-1 rounded border border-slate-500 bg-slate-800 px-3 py-1 text-slate-300"
							bind:value={banFormData.reason}
							bind:this={reasonInput}
							required
						/>
						<div class="flex gap-1">
							<button
								type="button"
								onclick={() => {
									banFormData.reason = '阻碍玩家 / Block';
									reasonInput?.focus();
								}}
								class="rounded bg-slate-600 px-2 py-1 text-xs text-white hover:bg-slate-500"
								title="阻碍玩家 / Block"
							>
								阻碍
							</button>
							<button
								type="button"
								onclick={() => {
									banFormData.reason = '恶意投票 / Funvote';
									reasonInput?.focus();
								}}
								class="rounded bg-slate-600 px-2 py-1 text-xs text-white hover:bg-slate-500"
								title="恶意投票 / Funvote"
							>
								投票
							</button>
							<button
								type="button"
								onclick={() => {
									banFormData.reason = '刷屏 / Spam';
									reasonInput?.focus();
								}}
								class="rounded bg-slate-600 px-2 py-1 text-xs text-white hover:bg-slate-500"
								title="刷屏 / Spam"
							>
								刷屏
							</button>
							<button
								type="button"
								onclick={() => {
									banFormData.reason = 'Bot Client';
									reasonInput?.focus();
								}}
								class="rounded bg-slate-600 px-2 py-1 text-xs text-white hover:bg-slate-500"
								title="Bot Client"
							>
								外挂
							</button>
						</div>
					</div>
				</div>
				<div class="flex gap-2">
					<button
						type="submit"
						disabled={submitting}
						class="flex items-center gap-2 rounded bg-red-600 px-4 py-1 text-white hover:bg-red-700 disabled:opacity-50"
					>
						<Fa icon={faBan} />
						{submitting ? '提交中...' : '提交封禁'}
					</button>
				</div>
			</form>
		</div>
	{:else}
		<!-- Search and Filter -->
		<div class="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
			<div>
				<label for="search" class="mb-1 block text-sm font-medium">搜索</label>
				<input
					id="search"
					type="text"
					placeholder="搜索 IP、玩家名、原因或管理员..."
					class="w-full rounded border border-slate-500 bg-slate-800 px-3 py-1 text-slate-300"
					bind:value={searchQuery}
				/>
			</div>
			<div class="flex items-end">
				<div class="text-sm text-slate-400">
					共 {filteredBans().length} 条封禁记录
				</div>
			</div>
		</div>

		<!-- Loading State -->
		{#if filteredBans().length === 0}
			<div class="h-[calc(100svh-25rem)] py-8 text-center">
				<div class="text-slate-400">
					{#if loading}
						<div class="text-slate-400">加载中...</div>
					{:else}
						{searchQuery ? '没有找到匹配的封禁记录' : '暂无封禁记录'}
					{/if}
				</div>
			</div>
		{:else}
			<!-- Ban List -->
			<div class="h-[calc(100svh-25rem)]">
				<!-- Virtual Scrolled Ban List -->
				<div class="h-full border border-slate-500">
					<VirtualScroll
						data={filteredBans()}
						key="key"
						keeps={50}
						estimateSize={48}
						let:data={ban}
						let:index
					>
						<div
							class="flex px-3 py-1 hover:bg-slate-500"
							class:bg-slate-600={index % 2 === 1}
							class:bg-slate-700={index % 2 === 0}
						>
							<div class="w-20 flex-shrink-0 text-nowrap">
								<div class="flex gap-1">
									<button
										onclick={() => copyUnbanCommand(ban)}
										class="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
										title="复制解封指令"
									>
										<Fa icon={faCopy} />
									</button>
									<button
										onclick={() => unbanEntry(ban)}
										class="flex items-center gap-1 rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700"
										title="解封"
									>
										<Fa icon={faUnlock} />
									</button>
								</div>
							</div>
							<div class="w-32 flex-shrink-0 truncate text-nowrap text-sm" title={ban.name}>
								{ban.name}
							</div>
							<div class="w-40 flex-shrink-0 truncate text-nowrap text-sm" title={ban.reason}>
								{ban.reason}
							</div>
							<div class="w-24 flex-shrink-0 truncate text-nowrap text-sm" title={ban.by}>
								{ban.by}
							</div>
							<div
								class="flex w-36 flex-shrink-0 items-center text-nowrap font-mono text-xs"
								class:text-yellow-400={ban.type === 'ban_range'}
								title={ban.type === 'ban'
									? numberToIp(ban.ip)
									: `${numberToIp(ban.start)}-${numberToIp(ban.end)}`}
							>
								{#if ban.type === 'ban'}
									{numberToIp(ban.ip)}
								{:else}
									{formatIpRange(ban.start, ban.end)}
								{/if}
							</div>
							<div class="w-32 flex-shrink-0 text-nowrap text-sm">
								{formatExpireTime(ban.expires)}
							</div>
							<div class="w-16 flex-shrink-0 text-nowrap text-sm">
								{ban.region === 'global' ? '全球' : ban.region.toUpperCase()}
							</div>
						</div>
					</VirtualScroll>
				</div>
			</div>
		{/if}
	{/if}
	<!-- Messages -->
	{#if error}
		<div class="text-nowrap rounded bg-red-900 p-1 text-white">
			{error}
		</div>
	{:else if success}
		<div class="text-nowrap rounded bg-green-900 p-1 text-white">
			{success}
		</div>
	{:else}
		<div class="text-nowrap p-1 text-white opacity-0">状态</div>
	{/if}
</div>
