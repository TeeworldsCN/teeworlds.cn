<script lang="ts">
	import { page } from '$app/stores';
	export let data;

	let content = data.content;
	$: content = data.content;
</script>

<svelte:head>
	<title>{data.title} - DDNet Wiki Mirror</title>
</svelte:head>

<div class="mx-auto max-w-5xl px-4 py-8">
	<div class="mb-8 flex items-center justify-between">
		<div>
			<h1 class="text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
				{data.title}
			</h1>
			<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
				Mirror of <a
					href="https://wiki.ddnet.org/wiki/{data.originalPath}"
					target="_blank"
					class="text-blue-600 hover:underline dark:text-blue-400">DDNet Wiki / {data.originalPath}</a
				>
			</p>
		</div>
		<form action="/ddnet/wiki/search" method="GET" class="flex items-center space-x-2">
			<input
				type="text"
				name="q"
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

	<article class="prose prose-blue max-w-none dark:prose-invert prose-headings:font-bold prose-a:text-blue-600 dark:prose-a:text-blue-400">
		{@html content}
	</article>
</div>

<style>
	/* Wiki specific styles */
	:global(.toc) {
		background-color: #f8f9fa;
		border: 1px solid #a2a9b1;
		padding: 10px;
		display: table;
		margin-bottom: 1em;
	}
	:global(.dark .toc) {
		background-color: #1f2937;
		border-color: #374151;
	}
	:global(.toc h2) {
		margin-top: 0;
	}
	:global(.toc ul) {
		list-style-type: none;
		padding-left: 1.5em;
	}
	:global(.infobox) {
		border: 1px solid #a2a9b1;
		background-color: #f8f9fa;
		color: black;
		margin: 0.5em 0 0.5em 1em;
		padding: 0.2em;
		float: right;
		clear: right;
		font-size: 88%;
		line-height: 1.5em;
		width: 22em;
	}
	:global(.dark .infobox) {
		background-color: #1f2937;
		border-color: #374151;
		color: #f3f4f6;
	}
	:global(.wikitable) {
		background-color: #f8f9fa;
		color: black;
		margin: 1em 0;
		border: 1px solid #a2a9b1;
		border-collapse: collapse;
	}
	:global(.dark .wikitable) {
		background-color: #1f2937;
		color: #f3f4f6;
		border-color: #374151;
	}
	:global(.wikitable > tr > th),
	:global(.wikitable > * > tr > th) {
		background-color: #eaecf0;
		text-align: center;
	}
	:global(.dark .wikitable > tr > th),
	:global(.dark .wikitable > * > tr > th) {
		background-color: #374151;
	}
	:global(.wikitable > tr > th),
	:global(.wikitable > tr > td),
	:global(.wikitable > * > tr > th),
	:global(.wikitable > * > tr > td) {
		border: 1px solid #a2a9b1;
		padding: 0.2em 0.4em;
	}
	:global(.dark .wikitable > tr > th),
	:global(.dark .wikitable > tr > td),
	:global(.dark .wikitable > * > tr > th),
	:global(.dark .wikitable > * > tr > td) {
		border-color: #4b5563;
	}
	:global(.thumbinner) {
		border: 1px solid #c8ccd1;
		padding: 3px;
		background-color: #f8f9fa;
		font-size: 94%;
		text-align: center;
		overflow: hidden;
	}
	:global(.dark .thumbinner) {
		border-color: #4b5563;
		background-color: #1f2937;
	}
	:global(.thumbcaption) {
		border: none;
		text-align: left;
		line-height: 1.4em;
		padding: 3px !important;
		font-size: 94%;
	}
	:global(.tright) {
		float: right;
		clear: right;
		margin: 0.5em 0 1.3em 1.4em;
	}
	:global(.tleft) {
		float: left;
		clear: left;
		margin: 0.5em 1.4em 1.3em 0;
	}
</style>
