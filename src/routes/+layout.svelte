<script lang="ts">
	import { enhance } from '$app/forms';
	import { navigating } from '$app/state';
	import Link from '$lib/components/Link.svelte';
	import { resetShare, share } from '$lib/share';
	import '../app.css';
	import { afterNavigate, beforeNavigate } from '$app/navigation';

	let { children, data } = $props();

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
	<header class="flex bg-slate-900 p-4 text-slate-300">
		<div class="container mx-auto">
			<div class="flex w-full">
				<div class="flex-grow">
					<a href="/" class="text-lg font-bold"> TeeworldsCN </a>
				</div>
				{#if data.user}
					<form class="flex" method="POST" action="/login/logout" use:enhance>
						<div class="scrollbar-hide mr-5 max-w-40 justify-center overflow-x-auto text-nowrap">
							{data.user.username}
						</div>
						<button type="submit" class="justify-center text-nowrap rounded bg-sky-700 px-2"
							>登出</button
						>
					</form>
				{/if}
			</div>
		</div>
	</header>

	<main class="flex-grow basis-1 bg-slate-800 p-2 text-slate-300 md:p-4">
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
