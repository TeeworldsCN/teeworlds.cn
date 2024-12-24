<script lang="ts">
	import type { Snippet } from 'svelte';
	import Link from '../Link.svelte';

	const {
		player,
		className,
		children,
		...rest
	}: { player: string; className?: string; children: Snippet; rest: any[] } = $props();
</script>

<Link href={`/ddnet/players/${encodeURIComponent(player)}`} {...rest} {className}
	>{@render children()}</Link
>
