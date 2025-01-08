<script lang="ts">
	import { encodeBase64 } from '$lib/base64';
	import { skinQueue } from '$lib/skin-queue';
	import { onDestroy, onMount } from 'svelte';
	import ColorConverter from 'css-filter-converter';
	import { ddnetColorToRgb } from '$lib/ddnet/helpers';

	const {
		url,
		body = null as number | null,
		feet = null as number | null,
		useDefault = false,
		className = '',
		...rest
	} = $props();

	const DEFAULT_SKIN =
		'data:image/png;base64,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';
	const X_SPEC_SKIN =
		'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAACACAYAAADktbcKAAAFVklEQVR4nO3dXW8UVRjA8f+2ZVsJYCuCpYoYFYjKmwQSFRHilZFPwCf0K3ilCIbEqBWRKCSG+AYCKgUE6ZbWevHMZueCttTd2bN75v9LNsyy285zYOfZc+a8gSRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkqSB0UgdgIbOOLCx+HMcGAMWgQWgBfwDzCeLTusyljoADZ0DwJurvD4LfNWnWNSlkdQBaOj83eXrGiDWANS2AdgLPAOcXeV9c8BtorrfAh4VP9skmgR31jjPSSJJfEc0G5SQ9wDUBPYXjyawDHwE3K/gXJuA08TnrkUkgUuYCJIZTR2AknoR+BDYReez0AAeAjcqON9rwAvF8RgwA7xK1CruVXA+rcEEUE9N4B3gbaL63jYHfAH8QNQEeu0W8CcwSfQktGPZDUwB14ClCs6rFZgA6ul54uJve0C0+88Df1HNxd92F7hMJJtpOgloCvgdawJ9ZQKop7vE//00cBX4mPhm7qc5IhGMA9uAC0TNQ1IfjAA7UgdRmMEuaUmSJKkHchnnkUs5Bo7trnw1iD7+fakD6dIe4BQmgUrYC5Cv/cDrwE5iBN7PacP5X04AR4DNxIzDm2nDyY81gDxtAY6Wnq81Pn9QleM+QowVUA+ZAPJ0nM5Er1vAxYSxdOMiET9EbfVYwliyZALIzzQx0g9iWO0Zqh3ZV6VlIv728OAZBmfsQhZMAPk5XDq+zPBW/9vuAFdKzw+v9EatnwkgL9vpzLb7F/g2YSy9dIEoD0TtZjphLFmxFyAv88Rkms3EXf8f04bTMwtET8YYseTYr3QSgqTHyC2551YeSZIkSZIkSZKeTF3vkNe13D3jxiB5eA94iRgDcJ5YXDNXM8SKxpuBn4BPk0Yz5EwAeZggVtfdSv7fimPE7kUQC4qqCw4FzkP5Qmgli6I/yuVrJosiEyaAPJQvhNy32SonAGsAXTIB5KE83bdOS2fVqayVMAHkoU7V4jo1dypnAshDudo/kSyK/ignOBNAl0wAeWgBj4DbxOKZOVsk9i98RP73O6QnknvX30rqWm5JkiRJkiRJUt3ldoc8t/IMBP9R8zIK7AZOEjMDh3FD0JW8C7xFDP+dw2XBe8KBQHl5ls7Fv4eYM5+DTcBeYJJYC2Br2nDyYQLIy03genE8AhxMGEsvHaLzWf0NuJEwlqyYAPIzWzpuf2sOsymiHG2zK71R62cCyM91OkuCjRJNgmGdNtsATtC5V3UNv/17ygSQp3N0JgVtBw4kjKUbB4n4IcrzecJYsmQCyNMd4OvS82FtBjxdOv4SuJsqEGnYNIBTwL7UgXRpD1GOYW3GSMnkctHkUg5JkiQpoRFil51BsANvSCfhXID6OkpsKTZFjB1IsZZgkxjae4xIANcSxFBrJoB62gkcL46niAlE94nuw35oAK8AH9CphUwDf2BXX1+ZAOppnlhff1vxfAPwcvFYJFYXrkID2AW8T3RPbii9dhX4Hliq6Nx6DBNAPS0BvxCTh3bQWWv/KWKX4cXitV47RAzt3Vj6uwfAJ8A3ePH3nQmg3u4BV4gLfiux8+4ycJZq1ty/T3zzN4rff4HY3ruqGofW4AALtTWBN4AtwGervO85YnGOFnERLxJV+fHid5xj9drDSSLxXMKNPZIbSx2ABsYCUQ1fyySrL8gxyeoJ4Mw6YlLF7HvVeq21ylAuqxDVgk0ArdcEcRNvvHiMEs2AVvF4SPQySJIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSVKV/gMpgLodSf6HygAAAABJRU5ErkJggg==';

	let skin = $state(useDefault ? DEFAULT_SKIN : X_SPEC_SKIN);
	let bodyFilter = $state(null) as string | null;
	let feetFilter = $state(null) as string | null;

	let abortController: AbortController | null = null;

	onDestroy(() => {
		if (abortController) {
			abortController.abort();
		}
	});

	onMount(async () => {
		if (!url) return;

		const controller = new AbortController();
		abortController = controller;
		const response = await skinQueue.push(() => fetch(url, { signal: controller.signal }));
		if (response.ok) {
			const contentType = response.headers.get('content-type') || '';
			if (contentType.startsWith('image/')) {
				const skinData = await response.arrayBuffer();
				const buffer = new Uint8Array(skinData);
				skin = `data:${contentType};base64,${encodeBase64(buffer)}`;
			}
		}
	});

	$effect(() => {
		bodyFilter = body != null ? ColorConverter.rgbToFilter(ddnetColorToRgb(body)).color : null;
		feetFilter = feet != null ? ColorConverter.rgbToFilter(ddnetColorToRgb(feet)).color : null;
	});
</script>

{#if bodyFilter && feetFilter}
	<div class="tee-render {className}" {...rest} style="background-image: url({skin});">
		<div class="tee-render-pass" style="filter: grayscale(1)">
			<div class="tee-foot-outline back"></div>
		</div>
		<div class="tee-render-pass" style="mix-blend-mode: multiply; filter: {feetFilter}">
			<div class="tee-foot-outline back"></div>
		</div>
		<div class="tee-render-pass" style="filter: grayscale(1)">
			<div class="tee-body-outline"></div>
		</div>
		<div class="tee-render-pass" style="mix-blend-mode: multiply; filter: {bodyFilter}">
			<div class="tee-body-outline"></div>
		</div>
		<div class="tee-render-pass" style="filter: grayscale(1)">
			<div class="tee-foot-outline front"></div>
		</div>
		<div class="tee-render-pass" style="mix-blend-mode: multiply; filter: {feetFilter}">
			<div class="tee-foot-outline front"></div>
		</div>

		<div class="tee-render-pass" style="filter: grayscale(1)">
			<div class="tee-foot back"></div>
		</div>
		<div class="tee-render-pass" style="mix-blend-mode: multiply; filter: {feetFilter}">
			<div class="tee-foot back"></div>
		</div>

		<div class="tee-render-pass" style="filter: grayscale(1)">
			<div class="tee-body"></div>
			<div class="tee-eyes">
				<div class="tee-eye-left"></div>
				<div class="tee-eye-right"></div>
			</div>
		</div>
		<div
			class="tee-render-pass"
			style="mix-blend-mode: multiply; filter: brightness(0) saturate(100%) {bodyFilter}"
		>
			<div class="tee-body"></div>
			<div class="tee-eyes">
				<div class="tee-eye-left"></div>
				<div class="tee-eye-right"></div>
			</div>
		</div>

		<div class="tee-render-pass" style="filter: grayscale(1)">
			<div class="tee-foot front"></div>
		</div>
		<div class="tee-render-pass" style="mix-blend-mode: multiply; filter: {feetFilter}">
			<div class="tee-foot front"></div>
		</div>
	</div>
{:else}
	<div class="tee-render {className}" {...rest} style="background-image: url({skin});">
		<div class="tee-render-pass">
			<div class="tee-body-outline"></div>
			<div class="tee-foot-outline back"></div>
			<div class="tee-foot-outline front"></div>
			<div class="tee-foot back"></div>
			<div class="tee-body"></div>
			<div class="tee-foot front"></div>
			<div class="tee-eyes">
				<div class="tee-eye-left"></div>
				<div class="tee-eye-right"></div>
			</div>
		</div>
	</div>
{/if}

<style>
	.tee-render-pass {
		position: absolute;
		width: 100%;
		height: 100%;
		background-image: inherit;
		background-size: 0% 0%;
		background-repeat: no-repeat;
		mix-blend-mode: inherit;
		filter: inherit;
	}

	.tee-render {
		position: relative;
		background-size: 0% 0%;
		background-repeat: no-repeat;
		mix-blend-mode: inherit;
		filter: inherit;
	}

	.tee-body-outline {
		position: absolute;
		width: 100%;
		height: 100%;
		background-image: inherit;
		background-size: calc(8 * 100% / 3) calc(4 * 100% / 3);
		background-repeat: no-repeat;
		background-position: calc(3 / (8 - 3) * 100%) 0%;
		mix-blend-mode: inherit;
		filter: inherit;
	}

	.tee-foot-outline {
		position: absolute;
		width: 100%;
		height: 50%;
		background-image: inherit;
		background-size: calc(8 * 100% / 2) calc(4 * 100% / 1);
		background-repeat: no-repeat;
		background-position: calc(6 / (8 - 2) * 100%) calc(2 / (4 - 1) * 100%);
		mix-blend-mode: inherit;
		filter: inherit;
	}

	.tee-foot {
		position: absolute;
		width: 100%;
		height: 50%;
		background-image: inherit;
		background-size: calc(8 * 100% / 2) calc(4 * 100% / 1);
		background-repeat: no-repeat;
		background-position: calc(6 / (8 - 2) * 100%) calc(1 / (4 - 1) * 100%);
		mix-blend-mode: inherit;
		filter: inherit;
	}

	.tee-foot-outline.front {
		left: 11%;
		top: 47%;
	}

	.tee-foot.front {
		left: 11%;
		top: 47%;
	}

	.tee-foot-outline.back {
		left: -12%;
		top: 47%;
	}

	.tee-foot.back {
		left: -12%;
		top: 47%;
	}

	.tee-body {
		position: absolute;
		width: 100%;
		height: 100%;
		background-image: inherit;
		background-size: calc(8 * 100% / 3) calc(4 * 100% / 3);
		background-repeat: no-repeat;
		background-position: 0% 0%;
		mix-blend-mode: inherit;
		filter: inherit;
	}

	.tee-eyes {
		position: relative;
		width: 40%;
		height: 40%;
		top: 25%;
		left: 42.5%;
		background-image: inherit;
		background-position: 0% 0%;
		background-size: 0% 0%;
		background-repeat: no-repeat;
		mix-blend-mode: inherit;
		filter: inherit;
	}

	.tee-eyes > .tee-eye-left {
		position: absolute;
		left: -16.25%;
		width: 100%;
		height: 100%;
		background-image: inherit;
		background-size: calc(8 * 100% / 1) calc(4 * 100% / 1);
		background-repeat: no-repeat;
		background-position: calc(2 / (8 - 1) * 100%) calc(3 / (4 - 1) * 100%);
	}

	.tee-eyes > .tee-eye-right {
		position: absolute;
		left: 16.25%;
		width: 100%;
		height: 100%;
		transform: scaleX(-1);
		background-image: inherit;
		background-size: calc(8 * 100%) calc(4 * 100%);
		background-repeat: no-repeat;
		background-position: calc(2 / (8 - 1) * 100%) calc(3 / (4 - 1) * 100%);
	}
</style>
