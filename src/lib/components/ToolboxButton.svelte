<script lang="ts">
	import type { Snippet } from 'svelte';

	const {
		children,
		href,
		newTab = false
	}: { children: Snippet; href: string; newTab?: boolean } = $props();
</script>

<a
	{href}
	target={newTab ? '_blank' : '_self'}
	rel={newTab ? 'noopener noreferrer' : ''}
	class="relative mt-4 inline-flex
    h-10 max-h-10 rounded-md border-b-4 border-slate-700 bg-slate-500 px-4
    py-0 text-3xl font-bold text-slate-300

    hover:bg-slate-500 hover:text-white"
>
	<span class="relative -mt-3">{@render children()}</span>
</a>
