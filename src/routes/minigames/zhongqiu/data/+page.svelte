<script lang="ts">
	import TeeRender from '$lib/components/TeeRender.svelte';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import { bossPool, BOSSES } from '$lib/zhongqiu/game';
	import { BUFF_CARDS } from '$lib/zhongqiu/items';
	import { CARDS, RARITY_INFO, type Rarity } from '$lib/zhongqiu/teecards';
	// 活动页自带的 emoji 字体子集(卡池表里的 Boss emoji 也要长得一样)
	import '$lib/zhongqiu/emoji-font.css';

	/**
	 * 中秋博饼 · 卡池一览(开发/查表用)
	 *
	 * 「代码内顺序」= 数组下标(CARDS / BUFF_CARDS / BOSSES 里的位置),表头点「名称」排的就是它。
	 * 默认状态就是代码内顺序 —— 想看原始顺序随时点一下「名称」两下之内回来。
	 * Boss 的「起始关卡」不是手写的:拿 bossPool() 逐关试,和游戏里抽 Boss 用同一份规则。
	 */
	type Table = 'tee' | 'buff' | 'boss';
	type Col = 'name' | 'rarity' | 'turns' | 'price' | 'minRound' | 'desc';
	type Dir = 1 | -1;
	type Sort = { col: Col; dir: Dir };

	type Row = {
		/** 代码内顺序(数组下标) */
		index: number;
		name: string;
		desc: string;
		/** Tee 卡 / 加成卡:皮肤名,用 TeeRender 画 */
		skin?: string;
		/** Boss 没有皮肤,用 emoji */
		emoji?: string;
		rarity?: Rarity;
		/** 加成卡:生效关数 */
		turns?: number;
		price?: number;
		/** 从第几关起有机会抽到(Boss 关) */
		minRound?: number;
	};

	const RARITY_RANK: Record<Rarity, number> = { common: 0, rare: 1, legendary: 2 };

	const teeRows: Row[] = CARDS.map((c, index) => ({
		index,
		name: c.name,
		rarity: c.rarity,
		desc: c.desc,
		skin: c.skin
	}));
	const buffRows: Row[] = BUFF_CARDS.map((c, index) => ({
		index,
		name: c.name,
		rarity: c.rarity,
		turns: c.turns,
		price: c.price,
		desc: c.desc,
		skin: c.skin
	}));
	/** 首个能抽到它的 Boss 关(每 3 关一次,所以从 3 开始试) */
	const firstRound = (id: string): number => {
		for (let n = 3; n <= 999; n += 3) if (bossPool(n).some((b) => b.id === id)) return n;
		return 0;
	};
	const bossRows: Row[] = BOSSES.map((b, index) => ({
		index,
		name: b.name,
		emoji: b.emoji,
		desc: b.desc,
		minRound: firstRound(b.id)
	}));

	const sorts = $state<Record<Table, Sort>>({
		tee: { col: 'name', dir: 1 },
		buff: { col: 'name', dir: 1 },
		boss: { col: 'name', dir: 1 }
	});

	const cmp = (a: Row, b: Row, col: Col): number => {
		switch (col) {
			case 'name':
				return a.index - b.index; // 代码内顺序
			case 'rarity':
				return RARITY_RANK[a.rarity ?? 'common'] - RARITY_RANK[b.rarity ?? 'common'];
			case 'turns':
				return (a.turns ?? 0) - (b.turns ?? 0);
			case 'price':
				return (a.price ?? 0) - (b.price ?? 0);
			case 'minRound':
				return (a.minRound ?? 0) - (b.minRound ?? 0);
			case 'desc':
				return a.desc.localeCompare(b.desc, 'zh-Hans-CN');
		}
	};

	const sorted = (rows: Row[], sort: Sort): Row[] =>
		[...rows].sort((a, b) => {
			const v = cmp(a, b, sort.col) || a.index - b.index; // 同值回落代码顺序
			return v * sort.dir;
		});

	const lists = $derived({
		tee: sorted(teeRows, sorts.tee),
		buff: sorted(buffRows, sorts.buff),
		boss: sorted(bossRows, sorts.boss)
	});

	const toggle = (which: Table, col: Col) => {
		const cur = sorts[which];
		sorts[which] = cur.col === col ? { col, dir: (cur.dir * -1) as Dir } : { col, dir: 1 };
	};

	const arrow = (sort: Sort, col: Col) => (sort.col === col ? (sort.dir === 1 ? '▲' : '▼') : '↕');
</script>

<svelte:head>
	<meta name="description" content="中秋博饼大会全部 Tee 卡、加成卡与 Boss 数据表" />
</svelte:head>

{#snippet headCell(which: Table, sort: Sort, col: Col, label: string, extra = '')}
	<th class="px-2 py-2 text-left font-semibold whitespace-nowrap {extra}">
		<button
			type="button"
			class="flex cursor-pointer items-center gap-1 transition hover:text-amber-300 {sort.col ===
			col
				? 'text-amber-300'
				: 'text-slate-400'}"
			title={col === 'name' ? '按代码内顺序（数组下标）' : `按${label}排序`}
			onclick={() => toggle(which, col)}
		>
			{label}
			<span class="text-[10px] {sort.col === col ? '' : 'opacity-40'}">{arrow(sort, col)}</span>
		</button>
	</th>
{/snippet}

{#snippet icon(row: Row)}
	<span
		class="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-slate-700/60 text-sm"
		style="border-color: {row.rarity
			? RARITY_INFO[row.rarity].color + '66'
			: 'rgb(100 116 139 / 0.4)'}"
	>
		{#if row.skin}
			<TeeRender name={row.skin} className="h-full w-full" />
		{:else}
			{row.emoji}
		{/if}
	</span>
{/snippet}

{#snippet nameCell(row: Row)}
	<td class="px-2 py-1.5 whitespace-nowrap">
		<span class="flex items-center gap-2">
			{@render icon(row)}
			<span class="font-semibold text-slate-100">{row.name}</span>
		</span>
	</td>
{/snippet}

{#snippet rarityCell(rarity?: Rarity)}
	<td class="px-2 py-1.5 whitespace-nowrap">
		{#if rarity}
			<span class="text-xs font-semibold" style="color: {RARITY_INFO[rarity].color}"
				>{RARITY_INFO[rarity].label}</span
			>
		{/if}
	</td>
{/snippet}

{#snippet descCell(desc: string)}
	<td class="px-2 py-1.5 leading-snug text-slate-300">{desc}</td>
{/snippet}

<div class="zq-emoji mx-auto max-w-6xl p-3 pb-16 text-slate-200">
	<Breadcrumbs
		breadcrumbs={[
			{ href: '/', text: '首页', title: 'TeeworldsCN' },
			{ href: '/minigames', text: '小游戏', title: '小游戏' },
			{ href: '/minigames/zhongqiu', text: '中秋博饼大会', title: '中秋博饼大会' },
			{ text: '卡池一览', title: '卡池一览' }
		]}
	/>
	<div class="mt-2 mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
		<h1 class="text-xl font-bold text-amber-200">卡池一览</h1>
		<a class="text-xs text-sky-400 hover:underline" href="/minigames/zhongqiu">← 回中秋博饼</a>
		<span class="text-xs text-slate-500">点表头排序 · 点「名称」按代码内顺序</span>
	</div>

	<section class="mt-6">
		<h2 class="mb-2 text-lg font-semibold text-slate-100">
			Tee 卡 <span class="text-sm font-normal text-slate-400">{lists.tee.length} 张</span>
		</h2>
		<div class="overflow-x-auto rounded-lg border border-slate-700">
			<table class="w-full border-collapse text-sm">
				<thead class="border-b border-slate-600 bg-slate-700/40 text-xs">
					<tr>
						{@render headCell('tee', sorts.tee, 'name', '名称', 'min-w-32')}
						{@render headCell('tee', sorts.tee, 'rarity', '稀有度')}
						{@render headCell('tee', sorts.tee, 'desc', '描述', 'w-full')}
					</tr>
				</thead>
				<tbody>
					{#each lists.tee as row (row.index)}
						<tr class="border-b border-slate-700/50 last:border-b-0 hover:bg-slate-700/25">
							{@render nameCell(row)}
							{@render rarityCell(row.rarity)}
							{@render descCell(row.desc)}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<section class="mt-8">
		<h2 class="mb-2 text-lg font-semibold text-slate-100">
			加成卡 <span class="text-sm font-normal text-slate-400">{lists.buff.length} 张</span>
		</h2>
		<div class="overflow-x-auto rounded-lg border border-slate-700">
			<table class="w-full border-collapse text-sm">
				<thead class="border-b border-slate-600 bg-slate-700/40 text-xs">
					<tr>
						{@render headCell('buff', sorts.buff, 'name', '名称', 'min-w-32')}
						{@render headCell('buff', sorts.buff, 'rarity', '稀有度')}
						{@render headCell('buff', sorts.buff, 'turns', '持续关数')}
						{@render headCell('buff', sorts.buff, 'price', '价格')}
						{@render headCell('buff', sorts.buff, 'desc', '描述', 'w-full')}
					</tr>
				</thead>
				<tbody>
					{#each lists.buff as row (row.index)}
						<tr class="border-b border-slate-700/50 last:border-b-0 hover:bg-slate-700/25">
							{@render nameCell(row)}
							{@render rarityCell(row.rarity)}
							<td class="px-2 py-1.5 whitespace-nowrap text-slate-300">{row.turns} 关</td>
							<td class="px-2 py-1.5 whitespace-nowrap text-amber-300">🥮 {row.price}</td>
							{@render descCell(row.desc)}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<section class="mt-8">
		<h2 class="mb-2 text-lg font-semibold text-slate-100">
			Boss <span class="text-sm font-normal text-slate-400">{lists.boss.length} 个</span>
		</h2>
		<p class="mb-2 text-xs text-slate-500">
			Boss 关 = 每 Ante 的第 3 关（第 3、6、9… 关）；第 1~6 关只出温和池。同一关的多个 Boss
			按权重随机。
		</p>
		<div class="overflow-x-auto rounded-lg border border-slate-700">
			<table class="w-full border-collapse text-sm">
				<thead class="border-b border-slate-600 bg-slate-700/40 text-xs">
					<tr>
						{@render headCell('boss', sorts.boss, 'name', '名称', 'min-w-32')}
						{@render headCell('boss', sorts.boss, 'minRound', '起始关卡')}
						{@render headCell('boss', sorts.boss, 'desc', '描述', 'w-full')}
					</tr>
				</thead>
				<tbody>
					{#each lists.boss as row (row.index)}
						<tr class="border-b border-slate-700/50 last:border-b-0 hover:bg-slate-700/25">
							{@render nameCell(row)}
							<td class="px-2 py-1.5 whitespace-nowrap text-slate-300">第 {row.minRound} 关</td>
							{@render descCell(row.desc)}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</div>
