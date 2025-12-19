<script lang="ts">
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import markdownIt from 'markdown-it';

	const { data } = $props();

	// Configure markdown-it with safe defaults
	const md = markdownIt({
		html: false, // Disable HTML tags for security
		breaks: true, // Convert '\n' in paragraphs into <br>
		linkify: true, // Autoconvert URL-like text to links
		typographer: true // Enable some language-neutral replacement + quotes beautification
	});

	const renderedContent = $derived(md.render(data.post.content));

	const formatDate = (timestamp: number) => {
		return new Date(timestamp).toLocaleString('zh-CN', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	};
</script>

<svelte:head>
	<title>{data.post.title} - TeeworldsCN</title>
	<meta name="description" content={data.post.title} />
</svelte:head>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'TeeworldsCN' },
		{ text: data.post.title, title: data.post.title }
	]}
/>

<article class="mx-auto max-w-4xl">
	<!-- data.post.Header -->
	<header class="mb-8">
		<h1 class="mb-4 text-3xl font-bold text-slate-200">{data.post.title}</h1>
		<div class="flex items-center gap-4 text-sm text-slate-400">
			<time datetime={new Date(data.post.created_at).toISOString()}>
				发布于 {formatDate(data.post.created_at)}
			</time>
			{#if data.post.updated_at !== data.post.created_at}
				<time datetime={new Date(data.post.updated_at).toISOString()}>
					更新于 {formatDate(data.post.updated_at)}
				</time>
			{/if}
		</div>
	</header>

	<!-- data.post.Content -->
	<div class="prose prose-slate prose-invert max-w-none">
		{@html renderedContent}
	</div>
</article>

<style>
	/* Custom styles for the markdown content */
	:global(.prose) {
		color: rgb(226 232 240); /* slate-200 */
	}

	:global(.prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6) {
		color: rgb(248 250 252); /* slate-50 */
	}

	:global(.prose a) {
		color: rgb(59 130 246); /* blue-500 */
		text-decoration: underline;
	}

	:global(.prose a:hover) {
		color: rgb(96 165 250); /* blue-400 */
	}

	:global(.prose code) {
		background-color: rgb(51 65 85); /* slate-700 */
		color: rgb(248 250 252); /* slate-50 */
		padding: 0.125rem 0.25rem;
		border-radius: 0.25rem;
		font-size: 0.875em;
	}

	:global(.prose pre) {
		background-color: rgb(30 41 59); /* slate-800 */
		border: 1px solid rgb(51 65 85); /* slate-700 */
	}

	:global(.prose pre code) {
		background-color: transparent;
		padding: 0;
	}

	:global(.prose blockquote) {
		border-left-color: rgb(71 85 105); /* slate-600 */
		color: rgb(203 213 225); /* slate-300 */
	}

	:global(.prose hr) {
		border-color: rgb(71 85 105); /* slate-600 */
	}

	:global(.prose table) {
		border-collapse: collapse;
	}

	:global(.prose th, .prose td) {
		border: 1px solid rgb(71 85 105); /* slate-600 */
		padding: 0.5rem;
	}

	:global(.prose th) {
		background-color: rgb(51 65 85); /* slate-700 */
		font-weight: 600;
	}

	:global(.prose tr:nth-child(even)) {
		background-color: rgb(30 41 59); /* slate-800 */
	}

	:global(.prose ul, .prose ol) {
		color: rgb(226 232 240); /* slate-200 */
	}

	:global(.prose li) {
		margin: 0.25rem 0;
	}

	:global(.prose strong) {
		color: rgb(248 250 252); /* slate-50 */
		font-weight: 600;
	}

	:global(.prose em) {
		color: rgb(203 213 225); /* slate-300 */
	}
</style>
