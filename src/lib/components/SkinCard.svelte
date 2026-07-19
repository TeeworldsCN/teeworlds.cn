<script lang="ts">
	import TeeRender from '$lib/components/TeeRender.svelte';
	import { tippy } from '$lib/tippy';
	import { EMOTE } from '$lib/stores/skins';
	import type { SkinInfo } from '$lib/server/fetches/skins';

	type Skin = SkinInfo['skins'][number];

	const {
		skin,
		copiedSkin,
		copySkinName,
		getTooltipContent
	}: {
		skin: Skin;
		copiedSkin: string | null;
		copySkinName: (name: string) => Promise<boolean>;
		getTooltipContent: (name: string) => string;
	} = $props();

	// 用 url 的扩展名作为下载文件名后缀，回退 png。
	const downloadName = $derived(`${skin.name}.${skin.url.split('.').pop() ?? 'png'}`);

	// 共享的 onclick 处理：blur 当前元素（去掉 :focus 残留轮廓），阻止默认下载行为，只复制。
	// 右键保留浏览器原生菜单（"另存为"），实现"右键下载、左键复制"。
	function handleClick(event: MouseEvent) {
		event.preventDefault();
		event.currentTarget instanceof HTMLElement && event.currentTarget.blur();
		copySkinName(skin.name);
	}

	// 链接主样式：橙色、无下划线，跟项目里 PlayerLink 等主要文字链接统一。
	const linkClass = 'text-center text-sm text-orange-400 hover:text-orange-300';
</script>

<div class="flex rounded-lg bg-slate-700 p-1">
	<!--
		预览图也是 <a>，跟皮肤名行为一致：左键复制、右键走浏览器原生下载。
		外层套一个 16x16 容器保持 1:1 比例，TeeRender 在内部填满容器。
	-->
	<a
		href={skin.url}
		download={downloadName}
		aria-label={`复制皮肤名称: ${skin.name}`}
		class="flex h-full w-16 cursor-pointer flex-col items-center justify-center rounded-lg bg-slate-600 transition-colors hover:bg-slate-500"
		use:tippy={{
			content: getTooltipContent(skin.name),
			placement: 'top',
			hideOnClick: false
		}}
		onclick={handleClick}
	>
		<div class="relative h-16 w-16">
			<TeeRender
				name={skin.name}
				className="w-full h-full"
				emote={copiedSkin === skin.name ? EMOTE.hurt : EMOTE.normal}
			/>
		</div>
	</a>

	<div class="ml-3 flex h-full w-full flex-col justify-center self-center overflow-hidden">
		<a
			href={skin.url}
			download={downloadName}
			class={linkClass}
			use:tippy={{
				content: getTooltipContent(skin.name),
				placement: 'top',
				hideOnClick: false
			}}
			onclick={handleClick}
		>
			{skin.name}
		</a>
		<div class="text-center text-sm">作者：{skin.creator}</div>
		{#if skin.skinpack}
			<div class="text-center text-sm">{skin.skinpack} 系列</div>
		{/if}
	</div>

	<div class="ml-3 flex h-full w-full flex-col justify-center self-center overflow-hidden sm:hidden xl:flex">
		<div class="text-center text-sm">
			{skin.type == 'normal' ? '官方皮肤' : '社区皮肤'}
		</div>
		<div class="text-center text-sm">发布于：{skin.date}</div>
	</div>
</div>
