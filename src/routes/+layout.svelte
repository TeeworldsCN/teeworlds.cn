<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<div class="flex min-h-svh flex-col bg-slate-800">
	<header class="bg-slate-900 p-4 text-slate-300">
		<div class="container mx-auto">
			<h1 class="text-lg font-bold">TeeworldsCN</h1>
		</div>
	</header>

	<main class="flex-grow bg-slate-800 p-4 text-slate-300">
		<div class="container mx-auto">
			{@render children()}
		</div>
	</main>

	<footer class="bg-slate-900 p-4 text-slate-300">
		<div class="container mx-auto text-center">
			<a href="https://beian.miit.gov.cn/" class="hover:text-white hover:underline">
				冀ICP备2021002466号
			</a>
			<span> </span>
		</div>
	</footer>
</div>
