import { Cron } from 'croner';
import { maps } from '../fetches/maps';
import { persistent } from '../keyv';

// run every 10 minutes
export const mapReleases = new Cron('*/10 * * * *', async () => {
	const data = await maps.fetch();
	if (!data) return;

	const lastestMap = data[0];
	if (!lastestMap) return;

	// const lastestReleaseDate = new Date(lastestMap.release).getTime();
	// const knownReleaseDate = await persistent.get<number>('dd:tracker:release');

	// if (!knownReleaseDate) {
	// 	// ignore the first run
	// 	await persistent.set('dd:tracker:release', lastestReleaseDate);
	// 	return;
	// }

	// if (lastestReleaseDate <= knownReleaseDate) {
	// 	// no update, ignore
	// 	return;
	// }

	// // consider this released regardless whether we published it or not
	// await persistent.set('dd:tracker:release', lastestReleaseDate);
});
