<script lang="ts">
	import type { Snippet } from 'svelte';
	import Link from '../Link.svelte';
	import { encodeAsciiURIComponent } from '$lib/link';

	const {
		player,
		className,
		children,
		...rest
	}: { player: string; className?: string; children: Snippet; [key: string]: any } = $props();
</script>

<Link
	data-sveltekit-preload-data="tap"
	href={`/ddnet/p?n=${encodeAsciiURIComponent(player)}`}
	{...rest}
	{className}>{@render children()}</Link
>
