<script lang="ts">
	import type { Snippet } from 'svelte';
	import Link from '../Link.svelte';
	import { encodeAsciiURIComponent } from '$lib/link';

	const {
		map,
		className,
		children,
		...rest
	}: { map: string; className?: string; children: Snippet; [key: string]: any } = $props();
</script>

<Link
	data-sveltekit-preload-data="tap"
	href={`/ddnet/maps/${encodeAsciiURIComponent(map)}`}
	{...rest}
	{className}>{@render children()}</Link
>
