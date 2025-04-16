<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy } from 'svelte';

	const { breadcrumbs }: { breadcrumbs: { href?: string; text: string; title?: string }[] } =
		$props();

	$effect(() => {
		if (browser) {
			document.title = breadcrumbs
				.filter((breadcrumb) => breadcrumb.title)
				.map((breadcrumb) => breadcrumb.title)
				.reverse()
				.join(' - ');
		}
	});

	onDestroy(() => {
		if (browser) {
			document.title = 'Teeworlds 中文社区';
		}
	});
</script>

{#if breadcrumbs.length}
	<nav class="mb-4">
		<div>
			{#each breadcrumbs as breadcrumb, i}
				{#if breadcrumb.href}
					<a href={breadcrumb.href} class="hover:text-white hover:underline">
						{breadcrumb.text}
					</a>
				{:else}
					<span>
						{breadcrumb.text}
					</span>
				{/if}
				{#if i < breadcrumbs.length - 1}
					<span class="mx-2 text-slate-400">&gt;</span>
				{/if}
			{/each}
		</div>
	</nav>
{/if}
