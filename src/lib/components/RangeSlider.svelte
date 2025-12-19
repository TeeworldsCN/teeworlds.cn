<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';

	let {
		value = $bindable([0, 100]) as [number, number],
		min = 0,
		max = 100,
		text = null as string[] | null,
		step = 0,
		class: className = ''
	} = $props();

	let swapped = $state(false);
	const normalizedValue = $derived([
		(Math.min(value[0], value[1]) - min) / (max - min),
		(Math.max(value[0], value[1]) - min) / (max - min)
	]);

	let dragging = [-1, -1];
	let element = [null, null] as (HTMLButtonElement | null)[];

	const onPointerDown = (ev: PointerEvent) => {
		if (ev.pointerType == 'mouse' && ev.button != 0) return;
		const handle = ev.target as HTMLButtonElement;
		const handleIndex = handle.id == 'left-handle' ? 0 : 1;
		dragging[handleIndex] = ev.pointerId;
		element[handleIndex] = handle;

		document.body.style.cursor = 'pointer';
	};

	const onPointerMove = (ev: PointerEvent) => {
		const handleIndex = ev.pointerId == dragging[0] ? 0 : ev.pointerId == dragging[1] ? 1 : -1;
		if (handleIndex == -1) return;

		const handle = element[handleIndex];
		if (!handle) return;

		const parent = handle.parentElement as HTMLDivElement;
		const parentRect = parent.getClientRects()[0];

		let x = ev.clientX - parentRect.left;

		if (x < 0) x = 0;
		if (x > parentRect.width) x = parentRect.width;

		const newValue = x / parentRect.width;
		const targetIndex = swapped ? 1 - handleIndex : handleIndex;

		if (step > 0) {
			value[targetIndex] = Math.round((min + newValue * (max - min)) / step) * step;
		} else {
			value[targetIndex] = min + newValue * (max - min);
		}

		if (value[0] > value[1]) {
			swapped = !swapped;
			value = [value[1], value[0]];
		}
	};

	const onPointerUp = (ev: PointerEvent) => {
		const handleIndex = ev.pointerId == dragging[0] ? 0 : ev.pointerId == dragging[1] ? 1 : -1;
		if (handleIndex == -1) return;

		dragging[handleIndex] = -1;
		document.body.style.cursor = '';
	};

	onMount(() => {
		document.addEventListener('pointermove', onPointerMove);
		document.addEventListener('pointerup', onPointerUp);
	});

	onDestroy(() => {
		if (browser) {
			document.removeEventListener('pointermove', onPointerMove);
			document.removeEventListener('pointerup', onPointerUp);
		}
	});
</script>

<div class={className}>
	<div class="flex h-full w-full touch-none flex-col items-center justify-center">
		<div class="relative h-4 w-[calc(100%-1rem)]">
			<div class="absolute mt-1.5 h-1 w-full rounded-full bg-slate-600"></div>
			<div
				class="absolute mt-1.5 h-[0.25rem] rounded-full bg-blue-500"
				style="left: calc({normalizedValue[0] * 100}%); width: calc({(normalizedValue[1] -
					normalizedValue[0]) *
					100}%);"
			></div>
			<button
				id="left-handle"
				class="group absolute -mt-[0.25rem] -ml-[0.5rem] h-[2.75rem] w-[2rem] p-[0.5rem]"
				style="left: calc({normalizedValue[swapped ? 1 : 0] * 100}% - 0.5rem);"
				aria-label="range left"
				onpointerdowncapture={onPointerDown}
			>
				<div
					class="pointer-events-none absolute top-[0.25rem] left-[0.5rem] h-[1rem] w-[1rem] rounded-full border border-slate-500 bg-slate-600 transition-[background-color,scale] group-hover:scale-125 group-hover:bg-blue-500 group-active:scale-125 group-active:bg-blue-400"
				></div>
			</button>
			<button
				id="right-handle"
				class="group absolute -mt-[0.25rem] -ml-[0.5rem] h-[2.75rem] w-[2rem] p-[0.5rem]"
				style="left: calc({normalizedValue[swapped ? 0 : 1] * 100}% - 0.5rem);"
				aria-label="range left"
				onpointerdowncapture={onPointerDown}
			>
				<div
					class="pointer-events-none absolute top-1 left-2 h-4 w-4 rounded-full border border-slate-500 bg-slate-600 transition-[background-color,scale] group-hover:scale-125 group-hover:bg-blue-500 group-active:scale-125 group-active:bg-blue-400"
				></div>
			</button>
		</div>
		{#if text && text.length >= 2}
			<div class="flex w-full flex-row items-center justify-between px-1">
				{#each text as text}
					<div class="text-sm text-slate-400 select-none">{text}</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
