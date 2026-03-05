<script lang="ts">
	export let data;

	let query = data.query;
	let results = data.results;

	$: {
		query = data.query;
		results = data.results;
	}
</script>

<svelte:head>
	<title>Search: {query} - DDNet Wiki Mirror</title>
</svelte:head>

<div class="mx-auto max-w-5xl px-4 py-8">
	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
				Search Results
			</h1>
			{#if query}
				<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
					Found {results.length} results for "{query}"
				</p>
			{/if}
		</div>
		<form action="/ddnet/wiki/search" method="GET" class="flex items-center space-x-2">
			<input
				type="text"
				name="q"
				value={query}
				placeholder="Search Wiki..."
				class="rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500"
				required
			/>
			<button
				type="submit"
				class="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
			>
				Search
			</button>
		</form>
	</div>

	{#if results.length > 0}
		<div class="space-y-6">
			{#each results as result}
				<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
					<h2 class="mb-2 text-xl font-semibold">
						<a href="/ddnet/wiki/{encodeURIComponent(result.title)}" class="text-blue-600 hover:underline dark:text-blue-400">
							{result.title}
						</a>
					</h2>
					<div class="prose prose-sm max-w-none text-gray-600 dark:prose-invert dark:text-gray-300">
						{@html result.snippet}...
					</div>
					<div class="mt-4 text-xs text-gray-500 dark:text-gray-400">
						Last updated: {new Date(result.timestamp).toLocaleDateString()}
					</div>
				</div>
			{/each}
		</div>
	{:else if query}
		<div class="rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
			<p class="text-gray-600 dark:text-gray-400">
				No results found for your search query. Try different keywords.
			</p>
		</div>
	{:else}
		<div class="rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
			<p class="text-gray-600 dark:text-gray-400">
				Enter a search query to find articles on the DDNet Wiki.
			</p>
		</div>
	{/if}
</div>
