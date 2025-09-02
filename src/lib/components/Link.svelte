<script lang="ts">
	import type { Snippet } from 'svelte';
	import { encodeBase64Url } from '$lib/base64url';

	const {
		href,
		ref,
		type = 'main',
		className,
		children,
		...rest
	}: {
		href?: string;
		ref?: string;
		className?: string;
		type?: 'main' | 'info' | 'subtle';
		children: Snippet;
		[key: string]: any;
	} = $props();

	// If ref is provided, convert href to /link?ref={base64url encoded href}
	const finalHref = $derived(() => {
		if (ref) {
			return `/link?ref=${encodeBase64Url(ref)}`;
		}
		return href || '#';
	});
</script>

<a
	href={finalHref()}
	{...rest}
	class={className}
	class:text-orange-400={type == 'main'}
	class:hover:text-orange-300={type == 'main'}
	class:text-slate-200={type == 'info'}
	class:hover:text-blue-300={type == 'info'}
	class:text-slate-600={type == 'subtle'}
	class:hover:text-slate-500={type == 'subtle'}>{@render children()}</a
>
