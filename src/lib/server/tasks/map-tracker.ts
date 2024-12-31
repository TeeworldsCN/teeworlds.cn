import { Cron } from 'croner';
import { maps, type MapList } from '../fetches/maps';
import { persistent } from '../db/kv';
import { getSubscriptions } from '../db/subs';
import { BOT, QQRichTextType } from '../bots/protocol/qq';
import { mapType, numberToStars } from '$lib/ddnet/helpers';

const publishMap = async (map: MapList[0]) => {
	if (!map) return;
	if (!BOT) return;

	console.log(`Publishing map ${map.name}`);

	const targets = getSubscriptions('map');
	for (const target of targets) {
		if (target.startsWith('channel:')) {
			const channelId = target.split(':')[1];
			const result = await BOT.publishThread(channelId, `【新图发布】${map.name}`, {
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
									url: `https://teeworlds.cn/ddnet/m?n=${encodeURIComponent(map.name)}`,
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

// run every 30 minutes
export const mapTracker = new Cron('*/30 * * * *', async () => {
	const data = await maps.fetch();
	if (!data) return;

	const lastestMap = data[0];
	if (!lastestMap) return;

	const lastestReleaseDate = new Date(lastestMap.release).getTime();
	const knownReleaseDate = persistent.get<number>(MAP_TRACKER_KEY);

	if (!knownReleaseDate) {
		// ignore the first run
		persistent.set(MAP_TRACKER_KEY, lastestReleaseDate);
		return;
	}

	if (lastestReleaseDate <= knownReleaseDate) {
		// no update, ignore
		return;
	}

	// consider this released regardless whether publish failed or not
	persistent.set(MAP_TRACKER_KEY, lastestReleaseDate);
	await publishMap(lastestMap);
});

export const triggerMapRelease = async () => {
	const data = await maps.fetch();
	if (!data) return;

	const lastestMap = data[0];
	if (!lastestMap) return;

	await publishMap(lastestMap);
};
