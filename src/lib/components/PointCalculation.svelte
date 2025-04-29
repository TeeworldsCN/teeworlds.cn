<div
	class="scrollbar-subtle container grid max-h-[calc(100svh-5rem)] grid-cols-1 gap-4 overflow-y-auto rounded-l-lg rounded-br-lg bg-slate-700 p-3 text-left shadow-lg md:grid-cols-2 lg:grid-cols-3"
>
	<div>
		<h3 class="mb-2 rounded-lg bg-slate-600 px-2 text-xl font-bold">🌎 通过分</h3>
		<div>
			首次通过地图会获得通过分。每张地图的难度由星星数量表示。不同类型的地图有不同的分数数据：
		</div>
		<table class="my-3 w-full table-auto overflow-hidden border border-slate-500">
			<tbody>
				<tr class="bg-slate-900">
					<th class="px-2">地图类型</th>
					<th>基数</th>
					<th>倍率</th>
				</tr>
				<tr class="odd:bg-slate-600 even:bg-slate-700">
					<td class="px-2">新手（Novice）</td>
					<td>0</td>
					<td>1</td>
				</tr>
				<tr class="odd:bg-slate-600 even:bg-slate-700">
					<td class="px-2">中阶（Moderate）</td>
					<td>5</td>
					<td>2</td>
				</tr>
				<tr class="odd:bg-slate-600 even:bg-slate-700">
					<td class="px-2">高阶（Brutal）</td>
					<td>15</td>
					<td>3</td>
				</tr>
				<tr class="odd:bg-slate-600 even:bg-slate-700">
					<td class="px-2">疯狂（Insane）</td>
					<td>30</td>
					<td>4</td>
				</tr>
				<tr class="odd:bg-slate-600 even:bg-slate-700">
					<td class="px-2">分身（Dummy）</td>
					<td>5</td>
					<td>5</td>
				</tr>
				<tr class="odd:bg-slate-600 even:bg-slate-700">
					<td class="px-2">古典（DDMaX）</td>
					<td>0</td>
					<td>4</td>
				</tr>
				<tr class="odd:bg-slate-600 even:bg-slate-700">
					<td class="px-2">传统（Oldschool）</td>
					<td>0</td>
					<td>6</td>
				</tr>
				<tr class="odd:bg-slate-600 even:bg-slate-700">
					<td class="px-2">单人（Solo）</td>
					<td>0</td>
					<td>4</td>
				</tr>
				<tr class="odd:bg-slate-600 even:bg-slate-700">
					<td class="px-2">竞速（Race）</td>
					<td>0</td>
					<td>2</td>
				</tr>
			</tbody>
		</table>

		<div>分数计算公式</div>
		<div class="rounded bg-slate-900 p-1 text-center">分数 = 基数 + (星星 × 倍率)</div>
	</div>
	<div>
		<h3 class="mb-2 rounded-lg bg-slate-600 px-2 text-xl font-bold">👥 团队排位分</h3>
		<div>
			使用 /team 指令加入队伍完成地图。团队排位分由每个地图的<span
				class="font-semibold text-orange-500">团队世界记录前十名</span
			>记录计算而来。
		</div>
		<table class="my-3 w-full table-auto overflow-hidden border border-slate-500">
			<tbody>
				<tr class="bg-slate-900">
					<th class="px-2">世界排名</th>
					<th>分数</th>
				</tr>
				<tr class="odd:bg-slate-600 even:bg-slate-700">
					<td class="px-2 text-orange-500">第一名</td>
					<td>25pts</td>
				</tr>
				<tr class="odd:bg-slate-600 even:bg-slate-700">
					<td class="px-2 text-orange-400">第二名</td>
					<td>18pts</td>
				</tr>
				<tr class="odd:bg-slate-600 even:bg-slate-700">
					<td class=" px-2 text-orange-300">第三名</td>
					<td>15pts</td>
				</tr>
				<tr class="odd:bg-slate-600 even:bg-slate-700">
					<td class="px-2">第四名</td>
					<td>12pts</td>
				</tr>
				<tr class="odd:bg-slate-600 even:bg-slate-700">
					<td class="px-2">第五名</td>
					<td>10pts</td>
				</tr>
				<tr class="odd:bg-slate-600 even:bg-slate-700">
					<td class="px-2">第六名</td>
					<td>8pts</td>
				</tr>
				<tr class="odd:bg-slate-600 even:bg-slate-700">
					<td class="px-2">第七名</td>
					<td>6pts</td>
				</tr>
				<tr class="odd:bg-slate-600 even:bg-slate-700">
					<td class="px-2">第八名</td>
					<td>4pts</td>
				</tr>
				<tr class="odd:bg-slate-600 even:bg-slate-700">
					<td class="px-2">第九名</td>
					<td>2pts</td>
				</tr>
				<tr class="odd:bg-slate-600 even:bg-slate-700">
					<td class="px-2">第十名</td>
					<td>1pts</td>
				</tr>
			</tbody>
		</table>
	</div>
	<div>
		<h3 class="mb-2 rounded-lg bg-slate-600 px-2 text-xl font-bold">👤 个人排位分</h3>
		<div>
			无论是否组队，只要产生记录结算就会被统计。个人排位分由每个地图的<span
				class="font-semibold text-orange-500">个人世界记录前十名</span
			>记录计算而来。
		</div>
		<table class="my-3 w-full table-auto overflow-hidden border border-slate-500">
			<tbody>
				<tr class="bg-slate-900">
					<th class="px-2">世界排名</th>
					<th>分数</th>
				</tr>
				<tr class="odd:bg-slate-600 even:bg-slate-700">
					<td class="px-2 text-orange-500">第一名</td>
					<td>25pts</td>
				</tr>
				<tr class="odd:bg-slate-600 even:bg-slate-700">
					<td class="px-2 text-orange-400">第二名</td>
					<td>18pts</td>
				</tr>
				<tr class="odd:bg-slate-600 even:bg-slate-700">
					<td class=" px-2 text-orange-300">第三名</td>
					<td>15pts</td>
				</tr>
				<tr class="odd:bg-slate-600 even:bg-slate-700">
					<td class="px-2">第四名</td>
					<td>12pts</td>
				</tr>
				<tr class="odd:bg-slate-600 even:bg-slate-700">
					<td class="px-2">第五名</td>
					<td>10pts</td>
				</tr>
				<tr class="odd:bg-slate-600 even:bg-slate-700">
					<td class="px-2">第六名</td>
					<td>8pts</td>
				</tr>
				<tr class="odd:bg-slate-600 even:bg-slate-700">
					<td class="px-2">第七名</td>
					<td>6pts</td>
				</tr>
				<tr class="odd:bg-slate-600 even:bg-slate-700">
					<td class="px-2">第八名</td>
					<td>4pts</td>
				</tr>
				<tr class="odd:bg-slate-600 even:bg-slate-700">
					<td class="px-2">第九名</td>
					<td>2pts</td>
				</tr>
				<tr class="odd:bg-slate-600 even:bg-slate-700">
					<td class="px-2">第十名</td>
					<td>1pts</td>
				</tr>
			</tbody>
		</table>
	</div>
</div>
