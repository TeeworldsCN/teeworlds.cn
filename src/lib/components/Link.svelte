<script lang="ts">
	import type { Snippet } from 'svelte';

	const props = $props();
	const {
		href,
		type = 'main',
        className,
		children,
		...rest
	}: { href: string; className?: string; type?: 'main' | 'info'; children: Snippet; rest: any[] } = props;

	const classes =
		type == 'main' ? 'text-orange-400 hover:text-orange-300' : 'text-slate-200 hover:text-blue-300';
</script>

<a {href} {...rest} class="{classes} {className}">{@render children()}</a>
