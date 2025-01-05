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
		type?: 'main' | 'info' | 'subtle';
		children: Snippet;
		[key: string]: any;
	} = $props();
</script>

<a
	{href}
	{...rest}
	class={className}
	class:text-orange-400={type == 'main'}
	class:hover:text-orange-300={type == 'main'}
	class:text-slate-200={type == 'info'}
	class:hover:text-blue-300={type == 'info'}
	class:text-slate-600={type == 'subtle'}
	class:hover:text-slate-500={type == 'subtle'}>{@render children()}</a
>
