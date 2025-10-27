<script lang="ts">
	import { preloadCode, preloadData, goto } from '$app/navigation';
	import { page } from '$app/state';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import ToolboxButton from '$lib/components/ToolboxButton.svelte';
	import { onMount } from 'svelte';

	let showLinks = $state(false);

	onMount(() => {
		let hash = page.url.hash;
		let target = null;

		if (hash) {
			if (hash.startsWith('#')) hash = `${hash.slice(1)}`;
			if (hash == 'm') target = `/ddnet/maps`;
			if (hash == 'q') target = `/ddnet/qia`;
			else if (hash == 'p') target = `/ddnet/players`;
			else if (hash == 's') target = `/ddnet/servers`;
			else if (hash == 'd' || hash == 'donate') target = `/donate`;
			else if (hash.startsWith('ms')) target = `/ddnet/maps#${hash.slice(2)}`;
			else if (hash.startsWith('m')) target = `/ddnet/maps/${hash.slice(1)}`;
			else if (hash.startsWith('p')) target = `/ddnet/players/${hash.slice(1)}`;
			else if (hash.startsWith('s')) target = `/ddnet/servers#${hash.slice(1)}`;
		}

		setTimeout(() => {
			if (target) {
				goto(target, { replaceState: true });
			}
		}, 250);

		if (!target) {
			showLinks = true;
		} else {
			setTimeout(() => {
				if (target) {
					preloadData(target);
					preloadCode(target);
				}
			}, 25);
		}
	});
</script>

{#if !showLinks}
	<div></div>
{:else}
	<Breadcrumbs
		breadcrumbs={[
			{ href: '/', text: '首页', title: 'TeeworldsCN' },
			{ text: '快捷菜单', title: '快捷菜单' }
		]}
	/>

	<div class="mt-6">
		<ToolboxButton href="/ddnet/players">查看排名</ToolboxButton>
		<div class="text-semibold">查看 DDNet 排名与玩家里程与分数</div>
	</div>

	<div class="mt-6">
		<ToolboxButton href="/ddnet/maps">查询地图</ToolboxButton>
		<div class="text-semibold">查找 DDNet 官方地图</div>
	</div>

	<div class="mt-6">
		<ToolboxButton href="/ddnet/servers">服务器列表</ToolboxButton>
		<div class="text-semibold">显示 DDNet 服务器列表</div>
	</div>

	<div class="mt-6">
		<ToolboxButton href="/donate">捐赠支持</ToolboxButton>
		<div class="text-semibold">支持 DDNet 游戏的运行</div>
	</div>
{/if}
