<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import TeeRender from '$lib/components/TeeRender.svelte';
	import { CARDS } from '$lib/zhongqiu/teecards';
	import { BUFF_CARDS } from '$lib/zhongqiu/items';

	// 直接用皮肤表的 name → url 映射(和 TeeRender 内部 getSkinUrl 同一条路径)
	type Row = { id: string; name: string; skin: string; kind: string; rarity: string; tag?: string };
	const all: Row[] = [
		...CARDS.map((c) => ({
			id: c.id,
			name: c.name,
			skin: c.skin,
			kind: 'Tee',
			rarity: c.rarity,
			tag: c.tag
		})),
		...BUFF_CARDS.map((c) => ({
			id: c.id,
			name: c.name,
			skin: c.skin,
			kind: '加成',
			rarity: c.rarity
		}))
	];

	let map: Record<string, string> = $state({});
	onMount(async () => {
		const r = await fetch('/api/skins');
		if (r.ok) map = (await r.json()).map;
	});

	const size = Number(page.url.searchParams.get('size') ?? 40);
	const p = Math.max(1, Number(page.url.searchParams.get('p') ?? 1));
	const pages = Math.ceil(all.length / size);
	const rows = all.slice((p - 1) * size, p * size);
</script>

<svelte:head><title>皮肤审核 {p}/{pages}</title></svelte:head>

<div style="min-height:100vh;background:#020617;color:#e2e8f0;padding:12px;font-family:system-ui">
	<div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;font-size:14px">
		<b style="color:#fcd34d">皮肤审核 {p} / {pages}</b>
		<span style="color:#94a3b8"
			>共 {all.length} 张（Tee {CARDS.length} / 加成 {BUFF_CARDS.length}）· 每页 {size}</span
		>
		<span style="flex:1"></span>
		{#each Array(pages) as _, i}
			<a
				href={`?p=${i + 1}&size=${size}`}
				style="padding:2px 9px;border-radius:4px;text-decoration:none;{i + 1 === p
					? 'background:#fbbf24;color:#451a03'
					: 'background:#1e293b;color:#cbd5e1'}">{i + 1}</a
			>
		{/each}
	</div>

	<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">
		{#each rows as r (r.id)}
			<div
				style="border:1px solid #334155;background:#0f172a;border-radius:10px;padding:8px;text-align:center"
			>
				<div style="width:112px;height:112px;margin:0 auto">
					<TeeRender name={r.skin} className="h-full w-full" />
				</div>
				<div style="margin-top:6px;font-size:13px;font-weight:600">{r.name}</div>
				<div style="font-size:11px;color:#7dd3fc">{r.skin}</div>
				<div style="font-size:10px;color:#64748b">
					{r.kind} · {r.rarity}{r.tag ? ` · ${r.tag}` : ''}
				</div>
			</div>
		{/each}
	</div>
</div>
