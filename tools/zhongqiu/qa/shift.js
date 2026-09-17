// 中秋活动 · 布局位移审计(点一下某个开关,看面板高度有没有跳)
//
// 覆盖三类容易踩的开关:选/取消加成卡、把加成卡挂到 Tee、结算动画全程。
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
	const root = () => document.querySelector('main .relative.z-10');
	const H = (el) => (el ? Math.round(el.getBoundingClientRect().height) : null);
	const BTN = (t) =>
		[...document.querySelectorAll('button')].find((b) =>
			b.innerText.replace(/\s/g, '').includes(t)
		);
	const teamPanel = () => root().children[1];
	const lines = [];
	const setup = () => {
		C.setTeam([null, 'baiyutu', 'yupan', 'yupan', 'change', 'wugang']);
		C.addBuff('yuefu', 2);
		C.addBuff('yulu', 1);
	};
	const jm = async (phase, opts) => {
		setup();
		C.jump(phase, opts);
		await sleep(45);
	};

	// 1) 点加成卡选中 / 取消
	await jm('intro', { round: 1 });
	const h0 = H(teamPanel());
	const chip = [...document.querySelectorAll('button')].find((b) =>
		b.innerText.includes('月兔护符')
	);
	chip && chip.click();
	await sleep(50);
	const h1 = H(teamPanel());
	chip && chip.click();
	await sleep(50);
	const h2 = H(teamPanel());
	lines.push(`  点加成卡选中/取消: ${h0} → ${h1} → ${h2}  ${h0 === h1 && h0 === h2 ? '✓' : '✗'}`);

	// 2) 选中后挂到 Tee
	chip && chip.click();
	await sleep(40);
	const h3 = H(teamPanel());
	document.querySelector('.tee-card')?.parentElement?.click();
	await sleep(50);
	const h4 = H(teamPanel());
	lines.push(`  挂到 Tee 上: ${h3} → ${h4}  ${h3 === h4 ? '✓' : '✗'}`);

	// 3) 结算动画全程(按钮不能被顶下去)
	await jm('round_confirm', { round: 1 });
	const panel = root().children[root().children.length - 2];
	const samples = [];
	const iv = setInterval(() => {
		const b = panel.querySelector('button');
		samples.push({
			btn: b ? Math.round(b.getBoundingClientRect().top) : null,
			top: Math.round(panel.getBoundingClientRect().top),
			h: Math.round(panel.getBoundingClientRect().height)
		});
	}, 60);
	BTN('结算回合')?.click();
	await sleep(2800);
	clearInterval(iv);
	const uniq = (k) => [...new Set(samples.map((s) => s[k]).filter((v) => v !== null))];
	const [bt, pt, ph] = [uniq('btn'), uniq('top'), uniq('h')];
	lines.push(
		`  结算动画全程: 按钮 top=${bt.join('/')} 面板 top=${pt.join('/')} 高=${ph.join('/')}  ${bt.length === 1 && pt.length === 1 && ph.length === 1 ? '✓' : '✗'}`
	);

	// 4) 商店三态:未选中 → 选中(说明条)→ 买掉一格,面板与按钮都不能跳
	await jm('shop', { round: 1 });
	await sleep(80);
	const shopPanel = () => [...root().children].find((e) => /商店/.test(e.innerText ?? ''));
	const snap = () => {
		const p = shopPanel();
		const y = (el) => (el ? Math.round(el.getBoundingClientRect().top) : null);
		const chips = [...(p?.querySelectorAll('.grid-cols-3 button') ?? [])];
		return {
			h: H(p),
			刷新: y(BTN('刷新')),
			下一关: y(BTN('下一关')),
			首格: y(chips[0]),
			末格: y(chips[5])
		};
	};
	const s0 = snap();
	const shopChip = [...(shopPanel()?.querySelectorAll('.grid-cols-3 button') ?? [])][0];
	shopChip?.click();
	await sleep(80);
	const s1 = snap();
	BTN('买')?.click();
	await sleep(80);
	const s2 = snap();
	const same =
		JSON.stringify(s0) === JSON.stringify(s1) && JSON.stringify(s0) === JSON.stringify(s2);
	lines.push(
		`  商店三态(未选/选中/买掉): 面板 h=${[s0.h, s1.h, s2.h].join('/')} 下一关 top=${[s0.下一关, s1.下一关, s2.下一关].join('/')} 末格 top=${[s0.末格, s1.末格, s2.末格].join('/')}  ${same ? '✓' : `✗ ${JSON.stringify([s0, s1, s2])}`}`
	);

	const ok = lines.every((l) => l.endsWith('✓'));
	lines.unshift(`  视口 ${innerWidth}×${innerHeight}`);
	lines.push(ok ? '  全部通过 ✓' : '  ✗ 存在位移');
	return lines.join('\n');
})();
