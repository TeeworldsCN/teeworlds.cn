<script lang="ts">
	import { flagAsset } from '$lib/ddnet/helpers';
	import { tippy } from '$lib/tippy';
	// pass tooltip={null} to render the flag without a tooltip
	const {
		flag,
		tooltip,
		class: className
	}: { flag: string; tooltip?: string | null; class?: string } = $props();

	const style = $derived(
		`background-image: url(${flagAsset(
			flag
		)}); background-size: contain; background-repeat: no-repeat; background-position: center; display: inline-block; width: 2em; height: 1em; vertical-align: middle;`
	);
</script>

{#if tooltip === null}
	<span class={className} {style}></span>
{:else}
	<span use:tippy={{ content: tooltip ?? flag }} class={className} {style}></span>
{/if}
