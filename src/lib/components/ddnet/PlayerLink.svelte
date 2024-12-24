<script lang="ts">
	import type { Snippet } from 'svelte';
	import Link from '../Link.svelte';

	const props = $props();
	const {
		player,
		className,
		children,
		...rest
	}: { player: string; className?: string; children: Snippet; rest: any[] } = props;

	const href = `/ddnet/players/${encodeURIComponent(player)}`;
</script>

<Link {href} {...rest} {className}>{@render children()}</Link>
