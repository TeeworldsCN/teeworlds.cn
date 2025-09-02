<script lang="ts">
	import type { Snippet } from 'svelte';
	import { encodeBase64Url } from '$lib/base64url';

	const {
		children,
		href,
		ref,
		newTab = false
	}: { children: Snippet; href?: string; ref?: string; newTab?: boolean } = $props();

	// If ref is provided, convert href to /link?ref={base64url encoded href}
	const finalHref = $derived(() => {
		if (ref) {
			return `/link?ref=${encodeBase64Url(ref)}`;
		}
		return href || '#';
	});
</script>

{#if newTab}
	<a
		href={finalHref()}
		target="_blank"
		rel="noopener noreferrer"
		class="mb-1 inline-block rounded-md bg-slate-600 px-4 py-1 text-2xl font-bold text-white hover:bg-slate-500 border border-slate-400"
	>
		{@render children()}
	</a>
{:else}
	<a
		href={finalHref()}
		class="mb-1 inline-block rounded-md bg-slate-600 px-4 py-1 text-2xl font-bold text-white hover:bg-slate-500 border border-slate-400"
	>
		{@render children()}
	</a>
{/if}
