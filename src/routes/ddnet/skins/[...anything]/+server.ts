import { getSkinData, setSkinData } from '$lib/server/db/skins.js';
import { error } from '@sveltejs/kit';
import { Image } from 'imagescript';

export const GET = async ({ request, url }) => {
	const path = url.pathname;

	if (!path.startsWith('/ddnet/skins/')) {
		return error(500);
	}

	const time = Date.now();

	const name = path.slice('/ddnet/skins/'.length);
	const grayscale = url.searchParams.get('grayscale') == '1';

	const elapsed = () => Math.ceil(Date.now() - time);

	const skin = getSkinData(name, grayscale);
	if (skin) {
		return new Response(skin, {
			headers: {
				'content-type': 'image/png',
				'cache-control': 'public, max-age=31536000',
				'x-skin-cache': 'hit',
				'x-skin-time': `${elapsed()}`
			}
		});
	}

	const skinData = await fetch(`https://ddnet.org/skins/skin/${name}`);
	if (!skinData.ok) {
		return error(skinData.status);
	}

	const skinDataBuffer = await skinData.arrayBuffer();
	const skinDataArray = new Uint8Array(skinDataBuffer);

	if (!grayscale) {
		setSkinData(name, grayscale, skinDataArray);

		return new Response(skinDataArray, {
			headers: {
				'content-type': 'image/png',
				'cache-control': 'public, max-age=31536000',
				'x-skin-cache': 'miss',
				'x-skin-time': `${elapsed()}`
			}
		});
	} else {
		const skinImage = await Image.decode(new Uint8Array(skinDataBuffer));
		skinImage.saturation(0);

		const bodyWidth = Math.round((skinImage.width * 96) / 256);
		const bodyHeight = Math.round((skinImage.height * 96) / 128);
		const bodyImage = skinImage.clone();

		bodyImage.crop(0, 0, bodyWidth, bodyHeight);

		const freq = new Array(255).fill(0);
		for (let data of bodyImage.iterateWithColors()) {
			const r = data[2] >>> 24;
			const a = data[2] & 0xff;
			if (a > 128) {
				freq[r]++;
			}
		}
		let dominantColor = 1;
		for (let i = 1; i < 256; i++) {
			if (freq[i] > freq[dominantColor]) {
				dominantColor = i;
			}
		}

		for (let data of bodyImage.iterateWithColors()) {
			let v = data[2] >>> 24;
			const a = data[2] & 0xff;
			if (v <= dominantColor) {
				v = Math.floor((v / dominantColor) * 192) & 0xff;
			} else {
				v = Math.floor(((v - dominantColor) / (255 - dominantColor)) * (255 - 192) + 192) & 0xff;
			}
			let rgba = (v << 24) | (v << 16) | (v << 8) | a;
			skinImage.setPixelAt(data[0], data[1], rgba);
		}

		const image = await skinImage.encode(9);
		setSkinData(name, grayscale, image);

		return new Response(image, {
			headers: {
				'content-type': 'image/png',
			    'cache-control': 'public, max-age=31536000',
				'x-skin-cache': 'miss',
				'x-skin-time': `${elapsed()}`
			}
		});
	}
};
