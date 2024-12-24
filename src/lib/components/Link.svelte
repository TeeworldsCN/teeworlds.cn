<script lang="ts">
	import type { Snippet } from 'svelte';

	const {
		href,
		type = 'main',
		className,
		children,
		...rest
	}: {
		href: string;
		className?: string;
		type?: 'main' | 'info';
		children: Snippet;
		onclick?: () => void;
	} = $props();
</script>

<a
	{href}
	{...rest}
	class="{type == 'main'
		? 'text-orange-400 hover:text-orange-300'
		: 'text-slate-200 hover:text-blue-300'} {className}">{@render children()}</a
>
