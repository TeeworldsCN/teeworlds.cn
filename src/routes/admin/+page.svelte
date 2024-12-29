<script lang="ts">
	const { data } = $props();
</script>

<div class="card h-[calc(100svh-18rem)] max-h-[calc(100svh-18rem)] w-full p-4">
	{#each Object.keys(data.kv) as key}
		<div class="text-sm">{key}: {JSON.stringify(data.kv[key])}</div>
	{/each}
</div>
