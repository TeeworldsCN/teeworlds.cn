<script lang="ts">
	import type { Snippet } from 'svelte';
	import Link from '../Link.svelte';
	import { encodeAsciiURIComponent } from '$lib/link';

	const {
		map,
		region,
		className,
		children,
		...rest
	}: {
		map: string;
		region?: string;
		className?: string;
		children: Snippet;
		[key: string]: any;
	} = $props();

	// 带区域时跳到该服的地图页（和 ddnet.org/maps/<region>/<map> 一致）
	const href = $derived(
		region && region.toLowerCase() != 'global'
			? `/ddnet/maps/${encodeAsciiURIComponent(map)}?server=${region.toLowerCase()}`
			: `/ddnet/maps/${encodeAsciiURIComponent(map)}`
	);
</script>

<Link data-sveltekit-preload-data="tap" {href} {...rest} {className}>{@render children()}</Link>
