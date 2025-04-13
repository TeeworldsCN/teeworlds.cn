<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { joinViaDDNet, joinViaSteam, showScore, sortPlayers } from '$lib/ddnet/helpers';
	import serverSearch, { type SortKey } from '$lib/stores/server-search.js';
	import Fa from 'svelte-fa';
	import VirtualScroll from 'svelte-virtual-scroll-list';
	import { faSteam } from '@fortawesome/free-brands-svg-icons';
	import { faCrosshairs, faFlagCheckered } from '@fortawesome/free-solid-svg-icons';
	import { addrToBase64, base64ToAddr } from '$lib/helpers.js';
	import { page } from '$app/state';
	import MapLink from '$lib/components/ddnet/MapLink.svelte';
	import TeeRender from '$lib/components/TeeRender.svelte';
	import { encodeAsciiURIComponent } from '$lib/link.js';

	const { data: propData } = $props();

	let name = $state(propData.name);

	const finishedMaps = $derived(propData.maps ? new Set(propData.maps) : null);

	const checkMapName = async (map: string) => {
		const url = `/ddnet/maps/${encodeURIComponent(map)}`;
		const response = await fetch(url, { method: 'HEAD' });
		if (response.ok && selectedServer?.info?.map?.name == map) {
			mapLink = url;
		}
	};

	const showServerInfo = (server: (typeof propData.servers)[0]) => {
		selectedServer = server;
		if (selectedServer) {
			sortPlayers(selectedServer.info.clients, selectedServer.info.client_score_kind);
			checkMapName(selectedServer.info.map.name);
		}
		showModal = true;
		serverAddress = server.key;
		goto(`#${addrToBase64(server.key)}`, { keepFocus: true, noScroll: true, replaceState: true });
	};

	const processHashQuery = (hash: string) => {
		if (hash.startsWith('#')) {
			hash = `${hash.slice(1)}`;
		}
		if (!hash) {
			showModal = false;
			mapLink = null;
			return;
		}
		serverAddress = base64ToAddr(hash);
		selectedServer = propData.servers.find((server) => server.key == serverAddress) || null;
		if (selectedServer) {
			sortPlayers(selectedServer.info.clients, selectedServer.info.client_score_kind);
			checkMapName(selectedServer.info.map.name);
		}
		showModal = true;
	};

	let loading = $state(false);
	let showModal = $state(false);
	let selectedServer = $state(null) as (typeof propData.servers)[0] | null;
	let serverAddress = $state(null) as string | null;
	let mapLink = $state(null) as string | null;

	processHashQuery(page.url.hash);

	const modes = {
		containsStd: (mode: string) =>
			mode.toLowerCase().includes('dm') ||
			mode.toLowerCase().includes('ctf') ||
			mode.toLowerCase().includes('lms') ||
			mode.toLowerCase().includes('lts'),
		startsWithInsta: (mode: string) => mode[0] == 'i' || mode[0] == 'g',
		isStd: (mode: string) =>
			mode == 'DM' || mode == 'TDM' || mode == 'CTF' || mode == 'LMS' || mode == 'LTS',
		isFreeze: (mode: string) =>
			mode.toLowerCase().includes('f-ddrace') || mode.toLowerCase().includes('freeze'),
		isModdedStd: (mode: string) => modes.containsStd(mode) && !modes.startsWithInsta(mode),
		isInsta: (mode: string) => modes.containsStd(mode) && modes.startsWithInsta(mode),
		isFng: (mode: string) => mode.toLowerCase().includes('fng'),
		isCatch: (mode: string) => mode.toLowerCase().includes('catch'),
		isGores: (mode: string) => mode.toLowerCase().includes('gores'),
		isBW: (mode: string) => mode.toLowerCase().includes('bw'),
		isDDNet: (mode: string) =>
			mode.toLowerCase().includes('ddnet') ||
			mode.toLowerCase().includes('ddracenet') ||
			mode.toLowerCase().includes('0xf'),
		isDDRace: (mode: string) =>
			(mode.toLowerCase().includes('ddrace') && !mode.toLowerCase().includes('ddracenet')) ||
			mode.toLowerCase().includes('mkrace'),
		isRace: (mode: string) =>
			mode.toLowerCase().includes('race') || mode.toLowerCase().includes('fastcap'),
		isSDDR: (mode: string) => mode.toLowerCase().includes('s-ddr')
	};

	const refresh = async () => {
		if (name != propData.name) {
			if (name)
				goto(`/ddnet/servers?name=${encodeAsciiURIComponent(name)}`, {
					keepFocus: true,
					noScroll: true
				});
			else goto(`/ddnet/servers`, { keepFocus: true, noScroll: true });
			return;
		}

		loading = true;
		await invalidate('/ddnet/servers');
		loading = false;
	};

	const regionLevel = (location?: string) => {
		if (!location) return 3;
		if (location == 'as:cn') return 0;
		if (location.startsWith('as')) return 1;
		return 2;
	};

	const sortValue = (server: any, key: SortKey) => {
		if (key.key == 'region') {
			return regionLevel(server.location);
		} else if (key.key == 'player') {
			return server.info.clients.length;
		} else if (key.key == 'name') {
			return server.info.name;
		} else if (key.key == 'map') {
			return server.info.map.name;
		} else if (key.key == 'mode') {
			return server.info.game_type;
		}
		return 0;
	};

	const servers = $derived(() =>
		propData.servers
			.filter((server) => {
				if ($serverSearch.exclude) {
					const terms = $serverSearch.exclude.split(';');
					for (const term of terms) {
						if (server.searchText.includes(term.trim().toLowerCase())) {
							return false;
						}
					}
				}
				if ($serverSearch.include) {
					const terms = $serverSearch.include.split(';');
					for (const term of terms) {
						if (!server.searchText.includes(term.trim().toLowerCase())) {
							return false;
						}
					}
				}
				return true;
			})
			.sort((a, b) => {
				for (const key of $serverSearch.sort) {
					const aValue = sortValue(a, key);
					const bValue = sortValue(b, key);
					if (aValue == bValue) continue;
					if (key.desc) {
						return aValue > bValue ? -1 : 1;
					} else {
						return aValue > bValue ? 1 : -1;
					}
				}
				// if all values are equal, sort by name
				return a.info.name.localeCompare(b.info.name);
			})
			.map((server) => server)
	);

	const toggleSort = (key: SortKey['key']) => {
		serverSearch.update((value) => {
			if (value.sort[0].key == key) {
				value.sort[0].desc = !value.sort[0].desc;
			} else {
				const deleting = value.sort.findIndex((sort) => sort.key == key);
				if (deleting >= 0) {
					value.sort.splice(deleting, 1);
				}
				value.sort.unshift({ key, desc: false });
			}
			return value;
		});
	};

	const togglePlayerSort = () => {
		serverSearch.update((value) => {
			if (value.sort[0].key == 'player' && value.sort[0].desc) {
				value.sort[0].desc = false;
			} else if (value.sort[0].key == 'player' && !value.sort[0].desc) {
				// remove player & region key
				const deleting = value.sort.findIndex((sort) => sort.key == 'region');
				if (deleting >= 0) {
					value.sort.splice(deleting, 1);
				}
				value.sort.splice(0, 1);
				value.sort.unshift({ key: 'region', desc: false }, { key: 'player', desc: true });
			} else {
				// remove player & region key
				const deleting = value.sort.findIndex((sort) => sort.key == 'region');
				if (deleting >= 0) {
					value.sort.splice(deleting, 1);
				}
				value.sort.splice(0, 1);
				value.sort.unshift({ key: 'player', desc: true }, { key: 'region', desc: false });
			}
			return value;
		});
	};

	$effect(() => {
		if (!showModal) {
			mapLink = null;
			selectedServer = null;
			goto('', { keepFocus: true, noScroll: true, replaceState: true });
		}
	});
</script>

<svelte:window
	on:hashchange={() => {
		processHashQuery(page.url.hash);
	}}
/>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'Teeworlds 中文社区' },
		{ href: '/ddnet', text: 'DDNet' },
		{ text: '服务器', title: 'DDNet 服务器列表' }
	]}
/>

<div class="mb-2 flex w-full gap-1">
	<div class="flex flex-grow flex-col gap-1 sm:flex-row">
		<input
			type="text"
			placeholder="🔎 搜索"
			class="w-[unset] flex-1 rounded border border-slate-600 bg-slate-700 px-2 py-1 text-slate-300 sm:w-1 md:mb-0"
			bind:value={$serverSearch.include}
		/>
		<input
			type="text"
			placeholder="🚫 排除"
			class="w-[unset] flex-1 rounded border border-slate-600 bg-slate-700 px-2 py-1 text-slate-300 sm:w-1 md:mb-0"
			bind:value={$serverSearch.exclude}
		/>
		<input
			type="text"
			placeholder="👤 玩家名"
			class="hidden w-24 rounded border border-slate-600 bg-slate-700 px-2 py-1 text-slate-300 sm:block md:w-48"
			bind:value={name}
		/>
	</div>
	<button
		class="text-nowrap rounded bg-blue-500 px-4 py-1 text-white hover:bg-blue-600 disabled:bg-blue-500 disabled:opacity-50"
		onclick={refresh}
		disabled={loading}
	>
		刷新
	</button>
</div>

<div class="rounded-lg bg-slate-900 px-1 py-1">
	<div class="flex h-[32px] w-full gap-1 rounded-t bg-slate-800 px-1 text-left sm:gap-2">
		<button
			class="w-14 rounded-t-lg text-center text-sm opacity-0 hover:bg-slate-700 hover:opacity-100 sm:text-base md:w-20"
		>
			社区
		</button>
		<button
			class="flex-1 text-nowrap rounded-t-lg px-4 text-left text-sm hover:bg-slate-700 sm:text-base"
			class:bg-slate-600={$serverSearch.sort[0].key == 'name'}
			onclick={() => toggleSort('name')}
		>
			名称
		</button>
		<button
			class="w-8 overflow-hidden text-nowrap rounded-t-lg px-0 text-center text-sm hover:bg-slate-700 sm:w-16 sm:text-base md:px-4 md:text-left lg:w-24"
			class:bg-slate-600={$serverSearch.sort[0].key == 'mode'}
			onclick={() => toggleSort('mode')}
		>
			模式
		</button>
		<button
			class="w-16 text-nowrap rounded-t-lg px-0 text-center text-sm hover:bg-slate-700 sm:text-base md:px-4 md:text-left lg:w-48"
			class:bg-slate-600={$serverSearch.sort[0].key == 'map'}
			onclick={() => toggleSort('map')}
		>
			地图
		</button>
		<button
			class="w-12 text-nowrap rounded-t-lg px-0 text-center text-sm hover:bg-slate-700 sm:text-base md:w-16 md:px-4 md:text-right lg:w-24"
			class:bg-slate-600={$serverSearch.sort[0].key == 'player'}
			class:bg-amber-900={$serverSearch.sort[0].key == 'region' &&
				$serverSearch.sort[1].key == 'player'}
			class:hover:bg-amber-800={$serverSearch.sort[0].key == 'region' &&
				$serverSearch.sort[1].key == 'player'}
			onclick={() => togglePlayerSort()}
		>
			玩家
		</button>
		<button
			class="hidden w-6 text-nowrap rounded-t-lg text-sm hover:bg-slate-700 sm:text-base md:block md:w-16 lg:w-24"
			class:bg-slate-600={$serverSearch.sort[0].key == 'region' &&
				$serverSearch.sort[1].key != 'player'}
			class:bg-amber-900={$serverSearch.sort[0].key == 'region' &&
				$serverSearch.sort[1].key == 'player'}
			class:hover:bg-amber-800={$serverSearch.sort[0].key == 'region' &&
				$serverSearch.sort[1].key == 'player'}
			onclick={() => togglePlayerSort()}
		>
			地区
		</button>
		<button
			class="block w-6 text-nowrap rounded-t-lg text-sm hover:bg-slate-700 sm:text-base md:hidden"
			class:bg-slate-600={$serverSearch.sort[0].key == 'region' &&
				$serverSearch.sort[1].key != 'player'}
			class:bg-amber-900={$serverSearch.sort[0].key == 'region' &&
				$serverSearch.sort[1].key == 'player'}
			class:hover:bg-amber-800={$serverSearch.sort[0].key == 'region' &&
				$serverSearch.sort[1].key == 'player'}
			onclick={() => togglePlayerSort()}
		>
			🌎
		</button>
	</div>
	<div
		class="w-ful scrollbar-subtle h-[calc(100svh-16.5rem)] sm:h-[calc(100svh-14rem)] md:h-[calc(100svh-17rem)]"
	>
		<VirtualScroll keeps={75} data={servers()} key="key" estimateSize={32} let:data>
			<button
				class="flex h-[32px] w-full gap-1 rounded px-1 py-1 text-left hover:bg-slate-700 sm:gap-2"
				onclick={() => {
					showServerInfo(data);
				}}
			>
				<span class="my-auto w-3 text-nowrap text-xs md:text-base"
					>{data.info.passworded ? '🔒' : ''}</span
				>
				<span class="inline-block h-full w-8 px-0 text-center md:w-16 md:px-2">
					{#if data.community_icon}
						<div
							class="h-full w-full bg-contain bg-no-repeat"
							style="background-image: url({data.community_icon})"
						></div>
					{/if}
				</span>
				<span
					class="my-auto flex-1 flex-grow overflow-hidden overflow-ellipsis text-nowrap text-xs sm:text-base"
					>{data.info.name}</span
				>
				<span
					class="my-auto w-8 overflow-hidden text-nowrap text-xs sm:w-16 sm:text-base lg:w-24 lg:overflow-ellipsis"
					class:text-[#ff8080]={modes.isFreeze(data.info.game_type)}
					class:text-[#ffff88]={modes.isCatch(data.info.game_type)}
					class:text-[#7ffa7d]={modes.isStd(data.info.game_type)}
					class:text-[#ff8b8a]={modes.isInsta(data.info.game_type)}
					class:text-[#75b3ec]={modes.isDDNet(data.info.game_type)}
					class:text-[#d38bff]={modes.isDDRace(data.info.game_type)}
					class:text-[#85ffea]={modes.isRace(data.info.game_type)}
					class:text-[#f29e7a]={modes.isBW(data.info.game_type)}
					class:text-[#e976ec]={modes.isFng(data.info.game_type)}
					class:text-[#78dff1]={modes.isGores(data.info.game_type)}
				>
					{data.info.game_type}
				</span>
				<span
					class="my-auto w-16 overflow-hidden text-nowrap text-xs sm:text-base lg:w-48 lg:overflow-ellipsis"
					>{#if finishedMaps}<span class="inline-block w-3 sm:w-6"
							>{#if finishedMaps.has(data.info.map.name)}<Fa
									class="inline"
									icon={faFlagCheckered}
								/>{/if}</span
						>{/if}{data.info.map.name}</span
				>
				<span
					class="my-auto w-12 overflow-hidden text-nowrap text-right text-xs md:w-16 md:text-sm lg:w-24 lg:text-base"
					>{data.info.clients.length}/{data.info.max_players}</span
				>
				<span
					class="my-auto w-6 overflow-hidden text-nowrap text-center text-xs md:w-16 md:text-base lg:w-24"
					class:text-green-400={regionLevel(data.location) == 0}
					class:text-green-600={regionLevel(data.location) == 1}
					class:text-orange-600={regionLevel(data.location) == 2}>{data.region}</span
				>
			</button>
		</VirtualScroll>
	</div>
	<Modal bind:show={showModal}>
		{#if selectedServer}
			<div
				class="scrollbar-subtle flex max-h-[calc(100svh-8rem)] w-[512px] max-w-[calc(100svw-3rem)] flex-col gap-4 overflow-y-auto rounded-l-lg rounded-br-lg bg-slate-700 p-3 text-left shadow-lg"
			>
				<div class="flew flew-col gap-1">
					<h1 class="flex-grow text-xl font-bold">{selectedServer.info.name}</h1>
				</div>
				<div
					class="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-slate-600 px-3 py-1 shadow-md sm:py-3"
				>
					<p class="mb-2">
						<span class="mb-1 text-base font-bold">游戏模式</span>
						<span class="ml-2">{selectedServer.info.game_type}</span>
					</p>
					<p class="mb-2">
						<span class="mb-1 text-base font-bold">地图</span>
						<span class="ml-2"
							>{#if mapLink}<MapLink className="font-semibold" map={selectedServer.info.map.name}
									>{selectedServer.info.map.name}</MapLink
								>{:else}{selectedServer.info.map.name}{/if}</span
						>
					</p>
					<p class="mb-2">
						<span class="mb-1 text-base font-bold">版本</span>
						<span class="ml-2">{selectedServer.info.version}</span>
					</p>
					<p class="mb-2">
						<span class="mb-1 text-base font-bold">密码</span>
						<span class="ml-2">{selectedServer.info.passworded ? '有' : '无'}</span>
					</p>
					<p class="mb-2">
						<span class="mb-1 text-base font-bold">需要账号</span>
						<span class="ml-2">{selectedServer.info.requires_login ? '是' : '否'}</span>
					</p>
					<p class="mb-2">
						<span class="mb-1 text-base font-bold">地区</span>
						<span class="ml-2">{selectedServer.region}</span>
					</p>
				</div>
				<div
					class="mt-2 flex flex-row justify-center gap-2 rounded-lg bg-slate-600 px-3 py-1 align-middle shadow-md sm:py-3"
				>
					<div class="flex-grow">
						<p class="mb-1 text-base font-bold">地址</p>
						{#each selectedServer.addresses as address}
							<p class="ml-2">{address}</p>
						{/each}
					</div>
					<div class="hidden flex-col gap-1 sm:flex">
						{#if joinViaSteam(selectedServer.addresses)}
							<a
								class="w-full rounded bg-[#090909] px-4 py-2 text-center font-semibold text-white hover:bg-gray-900 active:bg-gray-800"
								href={joinViaSteam(selectedServer.addresses)}
								><Fa class="inline" icon={faSteam}></Fa> 通过 Steam 加入</a
							>
						{/if}
						{#if joinViaDDNet(selectedServer.addresses)}
							<a
								class="w-full rounded bg-[#4a9be5] px-2 py-2 text-center font-semibold text-white hover:bg-[#4585c1] active:bg-[#3b6db9]"
								href={joinViaDDNet(selectedServer.addresses)}
								><Fa class="inline" icon={faCrosshairs}></Fa> 打开 DDNet 加入</a
							>
						{/if}
					</div>
				</div>
				<div class="mt-2 rounded-lg bg-slate-600 px-3 py-1 shadow-md sm:py-3">
					<h3 class="font-bold">玩家列表</h3>
					{#each selectedServer.info.clients as client}
						<div class="mb-1 flex flex-row items-center rounded bg-slate-700 px-1">
							<div class="w-20 self-center text-center">
								{showScore(client.score, selectedServer.info.client_score_kind)}
							</div>
							<TeeRender
								name={client.skin ? client.skin.name : ''}
								className="w-8 h-8 mr-2"
								useDefault
								body={client.skin ? client.skin.color_body : null}
								feet={client.skin ? client.skin.color_feet : null}
							></TeeRender>
							<div class="flex h-[3.25rem] flex-col">
								<p class="font-semibold">{client.name}</p>
								<p class="text-sm">{client.clan}</p>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<div
				class="scrollbar-subtle flex max-h-[calc(100svh-8rem)] w-[512px] max-w-[calc(100svw-3rem)] flex-col gap-4 overflow-y-auto rounded-lg bg-slate-700 p-3 text-left shadow-lg"
			>
				<h3 class="text-center text-xl font-bold">未找到对应的服务器</h3>
				<p>正在查看服务器：{serverAddress}</p>
				<p>当前服务器可能不在线或列表服务器出现了问题。</p>
			</div>
		{/if}
	</Modal>
</div>
