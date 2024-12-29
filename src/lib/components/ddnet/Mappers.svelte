<script lang="ts">
	import Link from '../Link.svelte';

	const { authors, click }: { authors: string; click?: (author: string) => void } = $props();

	let authorList = $derived(() =>
		authors
			.split(',')
			.flatMap((author) => author.split('&'))
			.map((author) => author.trim())
	);
</script>

{#each authorList() as author, i}
	{#if click}
		<Link
			href="/ddnet/maps/#mapper=%22{encodeURIComponent(author)}%22"
			className="font-semibold"
			onclick={() => {
				click(author);
			}}
		>
			{author}
		</Link>{:else}<Link
			href="/ddnet/maps/#mapper=%22{encodeURIComponent(author)}%22"
			className="font-semibold">{author}</Link
		>{/if}{#if i == authorList.length - 2}{' '}<span class=" text-slate-400">&</span>{' '}
	{:else if i < authorList.length - 2}<span class=" text-slate-400">,</span>{' '}
	{/if}
{/each}
