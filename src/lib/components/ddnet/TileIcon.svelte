<script lang="ts">
	/**
	 * 一个图块特性图标。
	 *
	 * 统一走 /ddnet/tiles/<name>.png:服务端反代 ddnet.org/tiles 并缓存到 keyv。
	 * 这样上游新增 tile 不用等我们补静态资源,客户端也只访问自己的域名。
	 */
	import { tippy } from '$lib/tippy';

	let { tile, class: className = '' }: { tile: string; class?: string } = $props();

	let failed = $state(false);
	const source = $derived(`/ddnet/tiles/${encodeURIComponent(tile)}.png`);

	// tile 变化(列表复用节点)时重试
	$effect(() => {
		tile;
		failed = false;
	});
</script>

{#if failed}
	<span
		class="{className} inline-grid place-items-center bg-gray-700 text-xs text-slate-300"
		use:tippy={{ content: tile }}>?</span
	>
{:else}
	<img
		class={className}
		src={source}
		alt={tile}
		loading="lazy"
		onerror={() => (failed = true)}
		use:tippy={{ content: tile }}
	/>
{/if}
