<script lang="ts">
	import type { Snippet } from 'svelte';
	import Link from '../Link.svelte';
	import { encodeURIComponentAscii } from '$lib/link';

	const props = $props();
	const {
		map,
		className,
		children,
		...rest
	}: { map: string; className?: string; children: Snippet; rest: any[] } = props;

	const href = `/ddnet/maps/${encodeURIComponentAscii(map)}`;
</script>

<Link {href} {...rest} {className}>{@render children()}</Link>
