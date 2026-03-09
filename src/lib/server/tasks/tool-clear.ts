import { Cron } from 'croner';
import { clearToolCount } from '../db/tool';
import { persistent } from '../db/kv';

const TOOL_EXPIRE_KEY = 'tool:expire';

// run every day at 00:00:00
export const toolClear = new Cron('0 0 0 * * *', async () => {
	console.log('Clearing tool records...');
	clearToolCount();

	const nextRun = toolClear.nextRun();
	if (nextRun) {
		persistent.set(TOOL_EXPIRE_KEY, nextRun.getTime());
	}
});

const initCheck = () => {
	const now = Date.now();
	const expireTime = persistent.get<number>(TOOL_EXPIRE_KEY);

	if (expireTime && now >= expireTime) {
		console.log('Tool records expired while server was down, clearing...');
		clearToolCount();
	}

	const nextRun = toolClear.nextRun();
	if (nextRun) {
		persistent.set(TOOL_EXPIRE_KEY, nextRun.getTime());
	}
};

initCheck();
