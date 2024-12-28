<script lang="ts">
	import { invalidate } from '$app/navigation';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import { onDestroy, onMount } from 'svelte';
	import VirtualScroll from 'svelte-virtual-scroll-list';

	const { data } = $props();

    let loading = $state(false);

	const refresh = async () => {
        loading = true;
		await invalidate('/ddnet/servers');
        loading = false;
	};

	const servers = $derived(() =>
		data.servers.map((server) => ({ key: server.addresses[0], ...server }))
	);

	onDestroy(() => {});

	$effect(() => {});

	onMount(async () => {});
</script>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'Teeworlds 中文社区' },
		{ href: '/ddnet', text: 'DDNet' },
		{ text: '服务器', title: 'DDNet 服务器列表' }
	]}
/>

<div class="mb-4 md:flex md:space-x-5">
	<button
		class="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:bg-blue-500 disabled:opacity-50"
		onclick={refresh}
        disabled={loading}
	>
		刷新服务器列表
	</button>
</div>

<div class="card h-[calc(100svh-18rem)] max-h-[calc(100svh-18rem)] w-full p-4">
	<VirtualScroll keeps={75} data={servers()} key="key" let:data>
		<div class="w-full rounded bg-slate-700 px-5 my-1 py-1">{data.info.name}</div>
	</VirtualScroll>
</div>
