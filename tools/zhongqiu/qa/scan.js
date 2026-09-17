// 中秋活动 · 阶段扫描(在浏览器里跑,经 agent-browser eval --stdin 注入)
//
// 依赖页面里的作弊引擎(window.__cheat,DEV 或 ?cheat 时挂载)。
// 直接配置状态而不是走游戏流程,所以整轮扫描不到 1 秒。
//
// 输出:每个阶段的滚动溢出情况 + 两处布局位移检查。
(async () => {
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	const until = async (fn, ms = 20000) => {
		const s = Date.now();
		while (!fn()) {
			if (Date.now() - s > ms) throw new Error('等待超时');
			await sleep(25);
		}
	};
	await until(() => window.__cheat);
	const C = window.__cheat;
	const roundTarget = (n) =>
		[60, 180, 360, 560, 950, 1350, 2400, 3600, 4500, 5300, 6200, 7200, 8300, 9500, 10800, 12200][
			n - 1
		] ?? 12200;

	const root = () => document.querySelector('main .relative.z-10');
	const dicePanel = () => {
		const d = document.querySelector('.die');
		if (d) return d.closest('div[class*="panel-fill"]');
		const k = root().children;
		return k[k.length - 2];
	};
	const acts = () =>
		[...document.querySelectorAll('.tee-card')].map((c) => {
			const a = c.parentElement.querySelector(':scope > .mt-1\\.5');
			return a ? Math.round(a.getBoundingClientRect().height) : null;
		});
	const teamActs = () =>
		acts()
			.filter((h) => h > 0)
			.slice(-C.state().team.length);

	const lines = [];
	const rows = [];
	const measure = (label) => ({
		label,
		over: document.documentElement.scrollHeight - innerHeight,
		panels: [...root().children].map((e) => Math.round(e.getBoundingClientRect().height))
	});
	// 满编队伍 + 一堆加成 = 最坏情况
	const setup = () => {
		C.setTeam([null, 'baiyutu', 'yupan', 'change', 'wugang', 'lingjiao']);
		C.mooncakes(60);
		C.addBuff('yuefu', 2);
		C.addBuff('yulu', 1);
		C.addBuff('manyuezhufu', 3);
	};
	const jm = async (label, phase, opts) => {
		setup();
		C.jump(phase, opts);
		await sleep(45);
		return measure(label);
	};

	// 主菜单:玩法说明常显,小屏放不下就让它滚(落地页不是游戏阶段,不算溢出)
	rows.push(await jm('idle 主菜单(可滚动)', 'idle'));
	const scrollablePhases = ['idle 主菜单(可滚动)'];
	rows.push(await jm('draft 开局选卡', 'draft', { picked: [0, 2] }));
	rows.push(await jm('intro 6人+3加成', 'intro', { round: 1 }));
	const introActs = teamActs();
	// Tee 头像必须有真实尺寸:TeeRender 内部全是绝对定位的子元素,外面不传
	// className="h-full w-full" 时自身高度为 0 —— 表现就是「头像没渲染出来」。
	// 只看可点的头像(按钮/链接里的),tooltip 里那种隐藏副本不算。
	const avatars = [...document.querySelectorAll('.tee-render')].filter(
		(e) => e.offsetParent !== null // 跳过 hidden sm:flex 这种隐藏副本
	);
	const avatarOk =
		avatars.length >= 4 && avatars.every((e) => e.getBoundingClientRect().height >= 8);
	rows.push(await jm('rolling 6人', 'rolling', { round: 1 }));
	const rollingActs = teamActs();
	// 渲染健康检查:渲染一旦抛异常,DOM 会停在上一帧,后面所有测量都会变成假的(还全绿)。
	// 曾经的 bug 是 setup 里塞了已删除的卡 id(桂花糕)。
	const renderOk = document.querySelectorAll('.die').length === 6;

	const noSteps = Math.round(dicePanel().getBoundingClientRect().height);
	rows.push(await jm('rolling 选骰中', 'rolling', { round: 1, choosing: true }));
	const choosingH = Math.round(dicePanel().getBoundingClientRect().height);
	await jm('', 'rolling', { round: 1, settleLines: 99 });
	const allSteps = Math.round(dicePanel().getBoundingClientRect().height);
	rows.push(await jm('round_confirm', 'round_confirm', { round: 1 }));
	rows.push(await jm('round_end', 'round_end', { round: 1 }));
	rows.push(await jm('reward', 'reward', { round: 1 }));
	rows.push(await jm('shop', 'shop', { round: 1 }));
	rows.push(await jm('game_over', 'game_over', { round: 7 }));

	// 每个 Boss × 关键阶段(Boss 清单直接问页面要,不手抄)
	const bossRows = [];
	for (const b of C.bossIds()) {
		const a = await jm('', 'rolling', { round: 9, boss: b });
		const c = await jm('', 'intro', { round: 9, boss: b });
		// Boss 说明要能读全:两行 clamp 不能被切掉(文案对账只管「说的和做的一致」)
		const el = document.querySelector('.line-clamp-2');
		const clipped = el ? el.scrollHeight > el.clientHeight + 1 : false;
		bossRows.push({ boss: b, rolling: a.over, intro: c.over, clipped });
	}

	lines.push(`  视口 ${innerWidth}×${innerHeight}   可用高度 ${innerHeight - 76}`);
	lines.push('  阶段'.padEnd(26) + '溢出'.padStart(6) + '  面板高度');
	for (const r of rows) {
		const scrollOk = scrollablePhases.includes(r.label);
		const flag = r.over > 0 ? `+${r.over} ${scrollOk ? '(滚动)' : '✗'}` : '0 ✓';
		lines.push(`  ${r.label.padEnd(24)}${flag.padStart(8)}  [${r.panels.join(', ')}]`);
	}
	lines.push(
		`  渲染健康检查 骰子可渲染 ${renderOk ? '✓' : '✗(渲染已抛异常,下面所有数字都不可信)'} · ` +
			`头像有尺寸 ${avatars.length} 个 ${avatarOk ? '✓' : '✗(有头像高度=0,通常是漏了 className)'}`
	);
	lines.push('  位移检查');
	lines.push(
		`    队伍卡动作区 intro=${introActs.join('/')} rolling=${rollingActs.join('/')}  ${JSON.stringify(introActs) === JSON.stringify(rollingActs) ? '一致 ✓' : '不一致 ✗'}`
	);
	lines.push(
		`    骰子面板 无结算=${noSteps} 全弹=${allSteps} 选骰中=${choosingH}  ${noSteps === allSteps && noSteps === choosingH ? '无位移 ✓' : '有位移 ✗'}`
	);
	lines.push('  各 Boss(第 3 关)');
	for (const b of bossRows)
		lines.push(
			`    ${b.boss.padEnd(10)} intro 溢出 ${String(b.intro).padStart(3)}  rolling 溢出 ${String(b.rolling).padStart(3)}  横幅完整 ${b.clipped ? '✗ 截断' : '✓'}  ${b.intro <= 0 && b.rolling <= 0 && !b.clipped ? '✓' : '✗'}`
		);
	// 重开清场:重开走的是 resetRun → draft,不经过 beginRound,
	// 所以本关数据(尤其 Boss 横幅)必须在 resetRun 里也清 —— 曾经漏清过
	C.setTeam([null, 'baiyutu', 'yupan']);
	C.jump('game_over', { round: 12 });
	await sleep(80);
	const bossBefore = /视为|目标 ×|同点|封顶|多投掷|作废/.test(document.body.innerText);
	const restartBtn = [...document.querySelectorAll('button')].find((b) =>
		/再来一局|重新开始|再玩/.test(b.innerText)
	);
	restartBtn?.click();
	await sleep(300);
	const rt = document.body.innerText;
	const leftovers = [];
	if (/视为|目标 ×|同点|封顶|多投掷|作废/.test(rt)) leftovers.push('Boss 横幅');
	if (!/第 1 关/.test(rt)) leftovers.push('关卡');
	if (!/目标\s*${roundTarget(1)}|目标\s*60/.test(rt)) leftovers.push('目标');
	if (/当前\s*[1-9]/.test(rt)) leftovers.push('当前分');
	if (/🥮\s*[1-9]/.test(rt)) leftovers.push('月饼币');
	lines.push('  重开清场(Boss 关 → 再来一局 → 开局)');
	lines.push(
		`    重开前有 Boss 横幅 ${bossBefore ? '是 ✓' : '否 ✗'} · 重开后残留:${leftovers.length === 0 ? '无 ✓' : leftovers.join('/') + ' ✗'}`
	);

	const bad =
		rows.filter((r) => r.over > 0 && !scrollablePhases.includes(r.label)).length +
		bossRows.filter((b) => b.intro > 0 || b.rolling > 0 || b.clipped).length +
		leftovers.length +
		(bossBefore ? 0 : 1) +
		(renderOk ? 0 : 1) +
		(avatarOk ? 0 : 1);
	lines.push(bad === 0 ? '  全部通过 ✓' : `  ✗ ${bad} 处问题`);
	return lines.join('\n');
})();
