// 跑局模拟的 worker:一条流派一个 worker,结果 postMessage 回主线程。
// 用法见 run.ts 的 WORKERS 环境变量。
import { PREFS, simulateFullRun, type RunSimResult } from './run';

interface Job {
	i: number;
	skill: 'random' | 'sub' | 'opt';
	trials: number;
}

self.onmessage = (e: MessageEvent<Job>) => {
	const { i, skill, trials } = e.data;
	try {
		const r: RunSimResult = simulateFullRun(PREFS[i], skill, trials);
		self.postMessage({ i, r });
	} catch (err) {
		self.postMessage({ i, error: String(err) });
	}
};
