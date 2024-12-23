<script lang="ts">
	import { navigating } from '$app/state';
	import Link from '$lib/components/Link.svelte';
	import '../app.css';
	let { children } = $props();
</script>

<div
	class="flex min-h-svh flex-col bg-slate-800 {navigating.to ? 'opacity-60' : 'opacity-100'}"
	style={navigating.to ? 'transition: opacity 0.1s ease-in-out 0.1s;' : ''}
>
	<header class="bg-slate-900 p-4 text-slate-300">
		<div class="container mx-auto">
			<a href="/" class="text-lg font-bold"> TeeworldsCN </a>
		</div>
	</header>

	<main class="flex-grow bg-slate-800 p-4 text-slate-300">
		<div class="container mx-auto">
			{@render children()}
		</div>
	</main>

	<footer class="bg-slate-900 p-4 text-slate-300">
		<div class="container mx-auto text-center">
			<Link href="https://beian.miit.gov.cn/" type="info" className="font-bold">冀ICP备2021002466号</Link>
		</div>
	</footer>
</div>
