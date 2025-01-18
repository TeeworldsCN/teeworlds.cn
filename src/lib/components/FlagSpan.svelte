<script lang="ts">
	import { flagAsset } from '$lib/ddnet/helpers';
	import { tippy } from '$lib/tippy';
	const {
		flag,
		tooltip,
		class: className
	}: { flag: string; tooltip?: string; class?: string } = $props();
</script>

<span
	use:tippy={{ content: tooltip ? tooltip : flag }}
	class={className}
	style="background-image: url({flagAsset(
		flag
	)}); background-size: contain; background-repeat: no-repeat; background-position: center; display: inline-block; width: 2em; height: 1em; vertical-align: middle;"
></span>
