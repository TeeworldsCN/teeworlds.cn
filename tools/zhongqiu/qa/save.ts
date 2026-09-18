// 存档字段对账:页面里每个 $state 要么在存档里,要么在"故意不存"名单里
//
// 背景:页面状态是几十个独立的 $state,加字段时很容易忘记同步存档 ——
// 漏一个的表现通常是"刷新后某个数字变 0"(roundTotal 就是这么漏的:
// 过关屏的「本关得分」直接显示它,刷新后变成 0)。
//
// 用法: bun tools/zhongqiu/qa/save.ts
import { readFileSync } from 'node:fs';

const page = readFileSync(
	new URL('../../../src/routes/zhongqiu/+page.svelte', import.meta.url),
	'utf8'
);
const lib = readFileSync(new URL('../../../src/lib/zhongqiu/game.ts', import.meta.url), 'utf8');

/** 页面里所有 let x = $state(...) 的变量名 */
const stateNames = [...page.matchAll(/^\s*let (\w+)\s*=\s*\$state(?:<[^=]*?>)?\(/gm)].map(
	(m) => m[1]
);

/** RunSave 的字段 */
const runSave = lib.slice(
	lib.indexOf('export type RunSave = {'),
	lib.indexOf('\n};', lib.indexOf('export type RunSave = {'))
);
const savedFields = new Set([...runSave.matchAll(/^\t(\w+):/gm)].map((m) => m[1]));

/** runSnapshot 里用简写语法写进去的字段(名字与页面变量同名) */
const snap = page.slice(page.indexOf('const runSnapshot'), page.indexOf('const restoreRun'));
const shorthand = new Set([...snap.matchAll(/^\t\t\t(\w+),$/gm)].map((m) => m[1]));

/**
 * 故意不存的:纯瞬时(动画帧、布局尺寸、派生值)或另有独立持久化渠道。
 * 往这里加东西前先想清楚:它会不会出现在某个界面上。
 */
const SKIP = new Set([
	// 布局
	'availH',
	'minH',
	// 动画帧(恢复时归零重播)
	'rolling',
	'settling',
	'teamSettling',
	'hitDice',
	'teeAnim',
	'teeEmote',
	'teePose',
	// 掷骰动画的时长(每次 rollCurrent 按当前倍速重算)
	'rollDur',
	'rollIter',
	'rollTotal',
	'settleSteps',
	'settleIdx',
	'teamSettleSteps',
	'teamSettleIdx',
	// 派生/临时(重进时重算或重播)
	'displayScore',
	'lastLevel',
	'lastBreakdown',
	'settlePreview',
	// 作弊引擎
	'cheatNextRoll',
	'cheatNextDie',
	// 独立持久化或纯 UI
	'save',
	'sfxOn',
	'showRules',
	// 在 runSnapshot 里换成 id/形态后写入(名字不同,故不计入简写)
	'boss',
	'target',
	'team',
	'draftChoices',
	'rewardChoices',
	'shopBuffs',
	'shopPick',
	'selectedBuff',
	'pendingAction',
	'pendingActive'
]);

const missing = stateNames.filter((n) => !savedFields.has(n) && !shorthand.has(n) && !SKIP.has(n));

console.log(`页面 $state ${stateNames.length} 个 · 存档字段 ${savedFields.size} 个`);
if (missing.length === 0) {
	console.log('全部有交代 ✓(要么在存档里,要么在 SKIP 名单里)');
	process.exit(0);
}
console.log('\n✗ 这些 $state 既没进存档,也不在 SKIP 名单里:');
for (const n of missing) console.log('   ' + n);
console.log(
	'\n漏存的表现通常是「刷新后某个数字变 0」。要存就加进 RunSave + runSnapshot/restoreRun,'
);
console.log('确实不用存就加进本文件的 SKIP(带一行理由)。');
process.exit(1);
