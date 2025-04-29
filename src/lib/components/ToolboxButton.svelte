<script lang="ts">
	import type { Snippet } from 'svelte';

	const {
		children,
		href,
		newTab = false
	}: { children: Snippet; href: string; newTab?: boolean } = $props();
</script>

{#if newTab}
	<a
		{href}
		target="_blank"
		rel="noopener noreferrer"
		class="mb-1 inline-block rounded-md bg-slate-600 px-4 py-1 text-2xl font-bold text-white hover:bg-slate-500 border border-slate-400"
	>
		{@render children()}
	</a>
{:else}
	<a
		{href}
		class="mb-1 inline-block rounded-md bg-slate-600 px-4 py-1 text-2xl font-bold text-white hover:bg-slate-500 border border-slate-400"
	>
		{@render children()}
	</a>
{/if}
