import { Cron } from 'croner';
import { maps, type MapList } from '../fetches/maps';
import { persistent } from '../db/kv';
import { getSubscriptions } from '../db/subs';
import { QQBot, QQRichTextType } from '../bots/protocol/qq';
import { mapType, numberToStars } from '$lib/ddnet/helpers';
import { encodeAsciiURIComponent } from '$lib/link';

const publishMap = async (map: MapList[0]) => {
	if (!map) return;
	if (!QQBot) return;

	console.log(`Publishing map ${map.name}`);

	const targets = getSubscriptions('map');
	for (const target of targets) {
		if (target.startsWith('channel:')) {
			const channelId = target.split(':')[1];
			const result = await QQBot.publishThread(channelId, `【新图发布】${map.name}`, {
				paragraphs: [
					{
						elems: [
							{
								text: {
									text: `作者：${map.mapper} `
								},
								type: QQRichTextType.Text
							}
						]
					},
					{
						elems: [
							{
								text: {
									text: `类型：[${mapType(map.type)}] ${numberToStars(map.difficulty)} (${map.points}pts) `
								},
								type: QQRichTextType.Text
							}
						]
					},
					{
						elems: [
							{
								image: {
									third_url: map.thumbnail,
									width_percent: 100
								},
								type: QQRichTextType.Image
							}
						]
					},
					{
						elems: [
							{
								url: {
									url: `https://teeworlds.cn/goto#m${encodeAsciiURIComponent(map.name)}`,
									desc: '🔗 地图详情'
								},
								type: QQRichTextType.Url
							}
						]
					}
				]
			});
			if (result.error) {
				console.error(
					`Publish map failed in channel ${channelId}: ${result.code} ${result.message} ${result.body}`
				);
			} else {
				console.log(`Publish map success in channel ${channelId}`);
			}
		}
	}
};

const MAP_TRACKER_KEY = 'tracker:release';

// run every 10 minutes. update usually comes out around minute 5. make sure we can catch it with in 4 minutes.
export const mapTracker = new Cron('8,18,28,38,48,58 * * * *', async () => {
	const data = (await maps.fetch()).result;
	if (!data) return;

	const knownReleaseMap = persistent.get<string>(MAP_TRACKER_KEY);

	if (!knownReleaseMap) {
		// ignore the first run
		const lastestMap = data[0];
		if (!lastestMap) return;
		persistent.set(MAP_TRACKER_KEY, lastestMap.name);
		console.log(`No last known map, starting over from ${lastestMap.name}`);
		return;
	}

	const knownMapIndex = data.findIndex((map) => map.name == knownReleaseMap);
	if (knownMapIndex < 0) {
		const lastestMap = data[0];
		if (!lastestMap) return;
		// can't find the last known map, ignore and start over from the lastest map
		// when this triggers, it doesn't actually publish the lastest map
		persistent.set(MAP_TRACKER_KEY, lastestMap.name);
		console.log(
			`Didn't find the last known map ${knownReleaseMap}, starting over from ${lastestMap.name}`
		);
		return;
	}

	const lastestMap = data[knownMapIndex - 1];
	if (!lastestMap) return;

	// consider this released regardless whether publish failed or not
	persistent.set(MAP_TRACKER_KEY, lastestMap.name);
	console.log(`Setting map tracker to ${lastestMap.name}`);
	await publishMap(lastestMap);
});

export const triggerMapRelease = async () => {
	const data = (await maps.fetch()).result;
	if (!data) return;

	const lastestMap = data[0];
	if (!lastestMap) return;

	await publishMap(lastestMap);
};
