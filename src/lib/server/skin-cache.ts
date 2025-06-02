import sharp from 'sharp';
import { getSkinData, setSkinData } from './db/skins';
import { skins } from './fetches/skins';

export const getSkinImageByName = async (
	name: string,
	grayscale: boolean,
	def?: string
): Promise<{ result: Uint8Array | null; hit: boolean }> => {
	const skinMap = (await skins.fetchCache()).result.map;
	const skinPath = skinMap[name] || (def ? skinMap[def] : null);
	if (!skinPath) {
		return { result: null, hit: false };
	}
	if (skinPath.startsWith('/api/skins/')) {
		return await getSkinImageByPath(skinPath.slice(11), grayscale);
	}
	return { result: null, hit: false };
};

export const getSkinImageByPath = async (
	path: string,
	grayscale: boolean
): Promise<{ result: Uint8Array | null; hit: boolean }> => {
	const skin = getSkinData(path, grayscale)
	if (skin) {
		return { result: skin, hit: true };
	}

	const skinData = await fetch(`https://ddnet.org/skins/skin/${path}`);
	if (!skinData.ok) {
		return { result: null, hit: false };
	}

	const skinDataBuffer = await skinData.arrayBuffer();
	const skinDataArray = new Uint8Array(skinDataBuffer);

	if (!grayscale) {
		setSkinData(path, grayscale, skinDataArray);
		return { result: skinDataArray, hit: false };
	} else {
		// Load image with Sharp
		const skinImage = sharp(skinDataBuffer).modulate({ saturation: 0 });
		const { width, height, channels } = await skinImage.metadata();

		if (channels != 4) {
			return { result: null, hit: false };
		}

		if (!width || !height) {
			return { result: null, hit: false };
		}

		// Calculate body dimensions for dominant color analysis
		const bodyWidth = Math.round((width * 96) / 256);
		const bodyHeight = Math.round((height * 96) / 128);

		// Get raw pixel data
		const { data: pixelData } = await skinImage
			.clone()
			.extract({
				left: 0,
				top: 0,
				width: bodyWidth,
				height: bodyHeight
			})
			.raw()
			.toBuffer({ resolveWithObject: true });

		// Extract body region pixels for dominant color analysis
		const freq = new Array(256).fill(0);

		for (let i = 0; i < pixelData.length; i += channels) {
			const r = pixelData[i];
			const a = pixelData[i + 3];

			if (a > 128) {
				freq[r]++;
			}
		}

		// Find dominant color
		let dominantColor = 1;
		for (let i = 1; i < 256; i++) {
			if (freq[i] > freq[dominantColor]) {
				dominantColor = i;
			}
		}

		// Process all pixels with custom grayscale algorithm
		for (let i = 0; i < pixelData.length; i += channels) {
			let r = pixelData[i];

			// Apply custom color mapping
			if (r <= dominantColor) {
				r = Math.floor((r / dominantColor) * 192) & 0xff;
			} else {
				r = Math.floor(((r - dominantColor) / (255 - dominantColor)) * (255 - 192) + 192) & 0xff;
			}

			// Set RGB channels to the same grayscale value
			pixelData[i] = r; // R
			pixelData[i + 1] = r; // G
			pixelData[i + 2] = r; // B
			// Keep alpha channel unchanged
		}

		// Create final image with processed data
		const image = await skinImage
			.composite([
				{
					input: pixelData,
					raw: { width: bodyWidth, height: bodyHeight, channels: 4 },
					left: 0,
					top: 0,
					blend: 'atop'
				}
			])
			.png()
			.toBuffer();

		const data = new Uint8Array(image);
		setSkinData(path, grayscale, data);

		return { result: data, hit: false };
	}
};
