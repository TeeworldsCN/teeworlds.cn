<script lang="ts">
	import { flagAsset } from '$lib/ddnet/helpers';
	const { flag }: { flag: string } = $props();
</script>

<span title={flag}
	style="background-image: url({flagAsset(
		flag
	)}); background-size: contain; background-repeat: no-repeat; background-position: center; display: inline-block; width: 2rem; height: 1rem; vertical-align: middle;"
></span>
