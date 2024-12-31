import { Cron } from 'croner';
import { records } from '../fetches/records';
import { persistent } from '../db/kv';
import { BOT } from '../bots/protocol/qq';
import { mapType } from '$lib/ddnet/helpers';
import { getSubscriptions } from '../db/subs';

const RECORD_TRACKER_KEY = 'tracker:record';

type RecordType = 'top' | 'topteam' | 'worst' | 'worstteam' | 'unknown';

interface RecordEntry {
	type: RecordType;
	map: string;
	server: string;
	region: string;
	record: string;
	oldRecord: string;
	delta: string;
	firstFinish: boolean;
	players: string;
}

const publishRecord = async (record: { title: string; date: number }) => {
	if (!record) return;
	if (!BOT) return;

	console.log(`Publishing record ${record.title}`);

	const data = record.title.match(
		/\[([A-Z]*)\] (.* rank).*on \[([A-Za-z\.,]*)\] ([^:]*): ([0-9:.]*) (.*) \(([^-)]*)(?: - (.*%).*)?\)/
	);

	if (!data) {
		console.log(`Failed to parse record: regex failed`);
		return;
	}

	const server = mapType(data[3].toLowerCase());
	const map = data[4];
	const region = data[1].toUpperCase();
	const types: { [key: string]: RecordType } = {
		'top 1 team rank': 'topteam',
		'top 1 rank': 'top',
		'worst rank': 'worst',
		'worst team rank': 'worstteam'
	};

	const entry: RecordEntry = {
		type: types[data[2].toLowerCase()] || 'unknown',
		server,
		region,
		map,
		players: data[6],
		record: data[5],
		oldRecord: data[7].slice(16) || data[5],
		delta: data[8],
		firstFinish: !data[8]
	};

	const titles: string[] = {
		topteam: ['队伍', '团队世界记录', '提升了'],
		top: ['玩家', '个人世界记录', '提升了'],
		worst: ['玩家', '个人最差记录', '降低了'],
		worstteam: ['队伍', '团队最差记录', '降低了'],
		unknown: ['', '记录', '提升了']
	}[entry.type];


	const info = entry.firstFinish
		? `🥇 [${entry.region}] ${titles[0]} ${entry.players} 创下了${titles[1]}！\n地图：${server} - ${entry.map}\n记录：${entry.record}\n(🏁 首杀记录！)`
		: `🥇 [${entry.region}] ${titles[0]} ${entry.players} 创下了${titles[1]}！\n地图：${server} - ${entry.map}\n记录：${entry.record}\n(相比上个记录 ${entry.oldRecord} ${titles[2]} ${entry.delta})`;

	const targets = getSubscriptions('record');
	for (const target of targets) {
		if (target.startsWith('channel:')) {
			const channelId = target.split(':')[1];
			const result = await BOT.sendChannelMessage(channelId, BOT.makeText(info));
			if (result.error) {
				console.error(
					`Publish record failed in channel ${channelId}: ${result.code} ${result.message} ${result.body}`
				);
			} else {
				console.log(`Publish record success in channel ${channelId}`);
			}
		}
	}
};

// run every 10 minutes
export const recordTracker = new Cron('*/10 * * * *', async () => {
	const data = await records.fetch();
	if (!data) return;

	const lastestRecord = data[0];
	if (!lastestRecord) return;

	const lastestRecordDate = lastestRecord.date;
	const knownRecordDate = persistent.get<number>(RECORD_TRACKER_KEY);

	if (!knownRecordDate) {
		// ignore the first run
		persistent.set(RECORD_TRACKER_KEY, lastestRecordDate);
		return;
	}

	if (lastestRecordDate <= knownRecordDate) {
		// no update, ignore
		return;
	}

	// consider this released regardless whether publish failed or not
	persistent.set(RECORD_TRACKER_KEY, knownRecordDate);
	await publishRecord(lastestRecord);
});

export const triggerRecordRelease = async () => {
	const data = await records.fetch();
	if (!data) return;

	const lastestRecord = data[0];
	if (!lastestRecord) return;

	await publishRecord(lastestRecord);
};
