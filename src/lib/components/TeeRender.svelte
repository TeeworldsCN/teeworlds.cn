<script module lang="ts">
	export interface TeePose {
		bodyRotation: number;
		eyesRotation: number;
		frontFootRotation: number;
		backFootRotation: number;
		eyesPosition: string;
		frontFootPosition: string;
		backFootPosition: string;
	}
</script>

<script lang="ts">
	import { encodeBase64 } from '$lib/base64';
	import { DEFAULT_SKIN, DEFAULT_SKIN_GS, X_SPEC_SKIN } from './tee-skin-data';
	import { skinQueue } from '$lib/skin-queue';
	import { onDestroy, onMount } from 'svelte';
	import { whenVisible } from '$lib/visible';
	import { ddnetColorToRgb } from '$lib/ddnet/helpers';
	import { rgbToSvgFilter } from '$lib/rgbToSvgFilter';
	import { getSkinUrl } from '$lib/stores/skins';

	const {
		/** Target url of the skin, if not provided, either `name` or `url` must be provided */
		url = '',
		/** Target name of the skin, if not provided, either `name` or `url` must be provided */
		name = '',
		/** The body color of the skin, null means no custom body color */
		body = null as number | null,
		/** The feet color of the skin, null means no custom feet color */
		feet = null as number | null,
		/** Whether to use the default skin, otherwise `x_spec` will be used by default */
		useDefault = false,
		/** extra classes */
		className = '',
		/**
		 * 懒加载:元素进入视口(或接近)之前不拉皮肤。
		 * 图鉴一屏上百张卡 —— 全下会瞬间打出上百个请求,滚到哪加载哪就够。
		 */
		lazy = false,
		emote = 0 as number,
		pose = null as TeePose | null,
		...rest
	} = $props();

	let skin = $state(X_SPEC_SKIN);
	let loadingSkin = $state(null) as string | null;
	let bodyFilter = $state(null) as { id: string; filterDef: string } | null;
	let feetFilter = $state(null) as { id: string; filterDef: string } | null;
	// Generate unique IDs for filters
	const uniqueId = Math.random().toString(36).substring(2, 9);

	let abortController: AbortController | null = null;

	let root = $state(null) as Element | null;
	/** 懒加载:已经进过视口(之后的变化照常走 updateSkin) */
	let shown = $state(false);

	const fallbackSkin = $derived(
		useDefault ? (body && feet ? DEFAULT_SKIN_GS : DEFAULT_SKIN) : X_SPEC_SKIN
	);

	const updateSkin = async () => {
		const thisLoadingSkin = url || name;
		const thisUrl = url;
		const thisName = name;

		if (thisLoadingSkin == loadingSkin) {
			return;
		}

		if (abortController) {
			abortController.abort();
			abortController = null;
		}

		loadingSkin = thisLoadingSkin;
		skin = fallbackSkin;

		if (!thisName && !thisUrl) {
			skin = fallbackSkin;
			loadingSkin = 'default';
			return;
		}

		const controller = new AbortController();
		abortController = controller;

		const response = await skinQueue.push(async () => {
			const targetUrl = thisUrl || (await getSkinUrl(thisName));
			if (!targetUrl) return null;

			const url = new URL(targetUrl, window.location.href);
			if (body && feet) {
				url.searchParams.set('grayscale', '1');
			}

			try {
				return await fetch(url, { signal: controller.signal });
			} catch {
				return null;
			} finally {
				abortController = null;
			}
		});

		if (response && response.ok) {
			const contentType = response.headers.get('content-type') || '';
			if (contentType.startsWith('image/')) {
				const skinData = await response.arrayBuffer();
				const buffer = new Uint8Array(skinData);
				skin = `data:${contentType};base64,${encodeBase64(buffer)}`;
			} else {
				skin = fallbackSkin;
				loadingSkin = 'default';
			}
		} else {
			skin = fallbackSkin;
			loadingSkin = 'cancelled';
		}
	};

	onDestroy(() => {
		if (abortController) {
			abortController.abort();
			abortController = null;
		}
	});

	onMount(() => {
		if (!lazy) {
			updateSkin();
			return;
		}
		if (!root) return;
		return whenVisible(root, () => (shown = true));
	});

	$effect(() => {
		bodyFilter =
			body != null ? rgbToSvgFilter(ddnetColorToRgb(body), `body-filter-${uniqueId}`) : null;
		feetFilter =
			feet != null ? rgbToSvgFilter(ddnetColorToRgb(feet), `feet-filter-${uniqueId}`) : null;
	});

	$effect(() => {
		url;
		name;
		// 懒加载时先按兵不动,直到 whenVisible 说「快看见了」
		if (lazy && !shown) return;
		requestAnimationFrame(updateSkin);
	});
</script>

<svg width="0" height="0" style="position: absolute; overflow: hidden;">
	<defs>
		{#if bodyFilter}
			{@html bodyFilter.filterDef}
		{/if}
		{#if feetFilter}
			{@html feetFilter.filterDef}
		{/if}
	</defs>
</svg>

<div
	bind:this={root}
	class="tee-render {className}"
	{...rest}
	style="background-image: url({skin}); {pose ? `transform: rotate(${pose.bodyRotation}deg)` : ''}"
>
	{#if bodyFilter && feetFilter}
		<div class="tee-render-pass">
			<div
				class="tee-foot-outline back"
				style={pose
					? `transform: translate(${pose.backFootPosition}) rotate(${pose.backFootRotation}deg); filter: url(#${feetFilter.id})`
					: `filter: url(#${feetFilter.id})`}
			></div>
		</div>
		<div class="tee-render-pass">
			<div class="tee-body-outline" style={`filter: url(#${bodyFilter.id})`}></div>
		</div>
		<div class="tee-render-pass">
			<div
				class="tee-foot-outline front"
				style={pose
					? `transform: translate(${pose.frontFootPosition}) rotate(${pose.frontFootRotation}deg); filter: url(#${feetFilter.id})`
					: `filter: url(#${feetFilter.id})`}
			></div>
		</div>

		<div class="tee-render-pass">
			<div
				class="tee-foot back"
				style={pose
					? `transform: translate(${pose.backFootPosition}) rotate(${pose.backFootRotation}deg); filter: url(#${feetFilter.id})`
					: `filter: url(#${feetFilter.id})`}
			></div>
		</div>

		<div class="tee-render-pass">
			<div class="tee-body" style={`filter: url(#${bodyFilter.id})`}></div>
			<div
				class="tee-eyes"
				style={pose
					? `transform: translate(${pose.eyesPosition}) rotate(${pose.eyesRotation}deg); filter: url(#${bodyFilter.id})`
					: `filter: url(#${bodyFilter.id})`}
			>
				<div
					class="tee-eye-left"
					style="background-position: calc({2 + emote} / (8 - 1) * 100%) calc(3 / (4 - 1) * 100%);"
				></div>
				<div
					class="tee-eye-right"
					style="background-position: calc({2 + emote} / (8 - 1) * 100%) calc(3 / (4 - 1) * 100%);"
				></div>
			</div>
		</div>

		<div class="tee-render-pass">
			<div
				class="tee-foot front"
				style={pose
					? `transform: translate(${pose.frontFootPosition}) rotate(${pose.frontFootRotation}deg); filter: url(#${feetFilter.id})`
					: `filter: url(#${feetFilter.id})`}
			></div>
		</div>
	{:else}
		<div class="tee-render-pass">
			<div
				class="tee-foot-outline back"
				style={pose
					? `transform: translate(${pose.backFootPosition}) rotate(${pose.backFootRotation}deg)`
					: ''}
			></div>
			<div class="tee-body-outline"></div>
			<div
				class="tee-foot-outline front"
				style={pose
					? `transform: translate(${pose.frontFootPosition}) rotate(${pose.frontFootRotation}deg)`
					: ''}
			></div>
			<div
				class="tee-foot back"
				style={pose
					? `transform: translate(${pose.backFootPosition}) rotate(${pose.backFootRotation}deg)`
					: ''}
			></div>
			<div class="tee-body"></div>
			<div
				class="tee-foot front"
				style={pose
					? `transform: translate(${pose.frontFootPosition}) rotate(${pose.frontFootRotation}deg)`
					: ''}
			></div>
			<div
				class="tee-eyes"
				style={pose
					? `transform: translate(${pose.eyesPosition}) rotate(${pose.eyesRotation}deg)`
					: ''}
			>
				<div
					class="tee-eye-left"
					style="background-position: calc({2 + emote} / (8 - 1) * 100%) calc(3 / (4 - 1) * 100%);"
				></div>
				<div
					class="tee-eye-right"
					style="background-position: calc({2 + emote} / (8 - 1) * 100%) calc(3 / (4 - 1) * 100%);"
				></div>
			</div>
		</div>
	{/if}
</div>

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
	}
</style>
