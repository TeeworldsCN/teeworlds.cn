<script lang="ts">
	/**
	 * 地图图块图标行:横向滚动,鼠标可以拖拽滚动(和地图列表卡片里的一样)。
	 * 地图详情页那种换行排列的没走这个组件。
	 */
	import { tippy } from '$lib/tippy';

	let { tiles, class: className = '' }: { tiles: string[]; class?: string } = $props();

	let slider = $state<HTMLDivElement>();
	let activePointer: number | null = null;
	let startX = 0;
	let startLeft = 0;

	const pointerDown = (ev: PointerEvent) => {
		if (ev.pointerType == 'mouse' && ev.button != 0) return;
		if (!slider) return;
		ev.preventDefault();
		activePointer = ev.pointerId;
		startX = ev.pageX;
		startLeft = slider.scrollLeft;
		try {
			(ev.currentTarget as HTMLDivElement).setPointerCapture(ev.pointerId);
		} catch {
			// 合成事件拿不到指针捕获就算了,正常拖拽不受影响
		}
	};

	const pointerMove = (ev: PointerEvent) => {
		if (activePointer !== ev.pointerId || !slider) return;
		ev.preventDefault();
		slider.scrollLeft = startLeft - (ev.pageX - startX);
	};

	const pointerUp = (ev: PointerEvent) => {
		if (activePointer === ev.pointerId) activePointer = null;
	};
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={slider}
	class="scrollbar-hide h-8 cursor-grab overflow-x-auto whitespace-nowrap {className}"
	onpointerdown={pointerDown}
	onpointermove={pointerMove}
	onpointerup={pointerUp}
	onpointercancel={pointerUp}
>
	{#each tiles as tile}
		<img
			class="m-0 mr-1 inline-block h-8 w-8 rounded bg-gray-600 p-0"
			use:tippy={{ content: tile }}
			src={`/assets/tiles/${tile}.png`}
			alt={tile}
			loading="lazy"
		/>
	{/each}
</div>
