<script lang="ts">
	import { onMount } from 'svelte';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import { setLayoutTheme } from '$lib/layoutTheme.svelte';

	// 合成超大Tee 整屏 iframe:隐掉 layout 的备案 footer,32px(h-8)还给画布
	onMount(() => {
		setLayoutTheme({ footer: true });
		return () => setLayoutTheme({});
	});
</script>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'TeeworldsCN' },
		{ href: '/minigames', text: '小游戏', title: '小游戏' },
		{ text: '合成超大Tee', title: '合成超大Tee' }
	]}
/>

<iframe
	src="https://dieroll.cn/pages/nouis/"
	class="h-[calc(100svh-6.3rem)] w-full rounded-xl border border-slate-600"
	loading="lazy"
	title="BiggerNouis"
></iframe>
