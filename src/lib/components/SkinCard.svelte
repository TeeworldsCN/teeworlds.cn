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
		getTooltipContent,
		searchByAuthor,
		searchByPack
	}: {
		skin: Skin;
		copiedSkin: string | null;
		copySkinName: (name: string) => Promise<boolean>;
		getTooltipContent: (name: string) => string;
		searchByAuthor?: (name: string) => void;
		searchByPack?: (name: string) => void;
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
	const linkClass = 'text-orange-400 hover:text-orange-300';

	// 角标日期：保留完整年份 (YYYY-MM-DD)，方便跨年查找。
	const shortDate = $derived(skin.date.slice(0, 10));

	// 类型角标：normal=DDNet 官方，community=社区玩家自制，不同色区分。
	// 颜色用 bg+text 组合保证对比度，title 提供完整语义。
	const typeBadge = $derived(
		skin.type === 'normal'
			? { label: '官方', cls: 'bg-blue-900/80 text-blue-200', title: 'DDNet 官方皮肤' }
			: { label: '社区', cls: 'bg-purple-900/80 text-purple-200', title: '社区玩家自制皮肤' }
	);
</script>

<div class="relative flex items-center gap-3 rounded-lg bg-slate-700 p-1 pr-9">
	<!--
		预览图也是 <a>，跟皮肤名行为一致：左键复制、右键走浏览器原生下载。
		外层套一个 64x64 容器保持 1:1 比例，TeeRender 在内部填满容器。
		容器用 shrink-0 保证不被挤压；relative 让角标能绝对定位。
	-->
	<div class="h-16 w-16 shrink-0">
		<a
			href={skin.url}
			download={downloadName}
			aria-label={`复制皮肤名称: ${skin.name}`}
			class="flex h-full w-full cursor-pointer flex-col items-center justify-center rounded-lg bg-slate-600 transition-colors hover:bg-slate-500"
			use:tippy={{
				content: getTooltipContent(skin.name),
				placement: 'top',
				hideOnClick: false
			}}
			onclick={handleClick}
		>
			<TeeRender
				name={skin.name}
				className="w-full h-full"
				emote={copiedSkin === skin.name ? EMOTE.hurt : EMOTE.normal}
			/>
		</a>
		</div>

	<!--
		右上角系列角标：仅当 skinpack 存在时显示。放在卡片右上角（预览图外），
		不遮挡预览图。
	-->
	{#if skin.skinpack}
		{#if searchByPack}
			<button
				type="button"
				class="absolute top-0.5 right-1 truncate px-1 text-[10px] leading-tight italic text-slate-500 transition-colors hover:text-slate-300"
				title={`筛选系列: ${skin.skinpack}`}
				onclick={() => searchByPack(skin.skinpack)}
			>{skin.skinpack}</button>
		{:else}
			<span
				class="absolute top-0.5 right-1 truncate px-1 text-[10px] leading-tight italic text-slate-500"
				title={skin.skinpack}
			>{skin.skinpack}</span>
		{/if}
	{/if}

	<!--
		文本块：多行布局。
		第一行：皮肤名（链接）
		第二行：作者 · skinpack
	-->
	<div class="flex min-w-0 flex-1 flex-col gap-1 text-sm">
		<a
			href={skin.url}
			download={downloadName}
			class="{linkClass} truncate font-medium"
			use:tippy={{
				content: getTooltipContent(skin.name),
				placement: 'top',
				hideOnClick: false
			}}
			onclick={handleClick}
		>
			{skin.name}
		</a>
		<div class="flex min-w-0 items-center gap-1 text-xs text-slate-400">
			{#if skin.creator}
				{#if searchByAuthor}
					<button
						type="button"
						class="truncate text-left hover:text-slate-200 hover:underline"
						title={`筛选作者: ${skin.creator}`}
						onclick={() => searchByAuthor(skin.creator)}
					>{skin.creator}</button>
				{:else}
					<span class="truncate">{skin.creator}</span>
				{/if}
			{/if}
		</div>
	</div>

	<!--
		角标：卡片右下角日期 + 皮肤类型（叠在一起，日期在上、类型在下）。
		绝对定位在卡片右下角，不挤压主内容。
		用 flex-col 让两个角标垂直堆叠，gap-0.5 让它们之间有一点间距。
	-->
	<div
		class="pointer-events-none absolute right-1 bottom-1 flex flex-col items-end gap-0.5"
	>
		<span
			class="rounded px-1 text-[10px] leading-tight {typeBadge.cls}"
			title={typeBadge.title}
		>
			{typeBadge.label}
		</span>
		<span
			class="rounded bg-slate-900/80 px-1 text-[10px] leading-tight text-slate-300"
			title={`发布于 ${skin.date}`}
		>
			{shortDate}
		</span>
	</div>
</div>
