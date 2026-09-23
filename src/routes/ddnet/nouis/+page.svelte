<script lang="ts">
	import { onMount } from 'svelte';
	import { setLayoutTheme } from '$lib/layoutTheme.svelte';

	// 合成超大Tee 整屏 iframe:隐掉 layout 的备案 footer,32px(h-8)还给 iframe 高度
	onMount(() => {
		setLayoutTheme({ footer: true });
		return () => setLayoutTheme({});
	});
</script>

<iframe
	src="https://dieroll.cn/pages/nouis/"
	class="h-[calc(100svh-3.8rem)] w-full rounded-xl border border-slate-600"
	loading="lazy"
	title="BiggerNouis"
></iframe>
