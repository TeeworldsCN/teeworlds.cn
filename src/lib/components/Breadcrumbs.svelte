<script lang="ts">
	const { breadcrumbs }: { breadcrumbs: { href?: string; text: string }[] } = $props();
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
					<span class="mx-2 text-slate-400">></span>
				{/if}
			{/each}
		</div>
	</nav>
{/if}
