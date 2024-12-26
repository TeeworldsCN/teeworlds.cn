<script lang="ts">
	import { navigating } from '$app/state';
	import Link from '$lib/components/Link.svelte';
	import { resetShare, share } from '$lib/share';
	import '../app.css';
	import { afterNavigate, beforeNavigate } from '$app/navigation';
	let { children } = $props();

	afterNavigate(() => {
		share(
			{
				icon: `${window.location.origin}/shareicon.png`,
				link: window.location.href,
				title: 'TeeworldsCN',
				desc: 'Teeworlds 中文社区工具箱'
			},
			'layout'
		);
	});

	beforeNavigate(() => {
		resetShare();
	});
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

	<main class="flex-grow bg-slate-800 p-2 text-slate-300 md:p-4 basis-1">
		<div class="container mx-auto h-full">
			{@render children()}
		</div>
	</main>

	<footer class="bg-slate-900 p-4 text-slate-300">
		<div class="container mx-auto text-center">
			<Link href="https://beian.miit.gov.cn/" type="info" className="font-bold"
				>冀ICP备2021002466号</Link
			>
		</div>
	</footer>
</div>
