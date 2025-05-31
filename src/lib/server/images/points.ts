import sharp from 'sharp';
import { getSkinImageByName } from '../skin-cache';
import { ddnetColorToRgb } from '$lib/ddnet/helpers';
import { faGlobe, type IconDefinition } from '@fortawesome/free-solid-svg-icons';

export const renderTee = async (
	skin: string,
	bodyColor?: number,
	feetColor?: number,
	scale = 1
) => {
	// Determine if we need grayscale version for coloring
	const needsGrayscale = bodyColor !== undefined || feetColor !== undefined;

	// Get skin data (grayscale if colors are provided)
	const skinData = await getSkinImageByName(skin, needsGrayscale);
	if (!skinData.result) {
		return null;
	}

	const skinBuffer = Buffer.from(skinData.result);
	const skinImage = sharp(skinBuffer);
	const { width: originalWidth, height: originalHeight } = await skinImage.metadata();

	if (!originalWidth || !originalHeight) {
		return null;
	}

	const outputWidth = 80 * scale;
	const outputHeight = 64 * scale;

	const bodyRgb = bodyColor ? ddnetColorToRgb(bodyColor) : undefined;
	const feetRgb = feetColor ? ddnetColorToRgb(feetColor) : undefined;

	const bodyImage = bodyRgb
		? skinImage.clone().linear([bodyRgb.r / 255, bodyRgb.g / 255, bodyRgb.b / 255, 1], [0, 0, 0, 0])
		: skinImage;
	const feetImage = feetRgb
		? skinImage.clone().linear([feetRgb.r / 255, feetRgb.g / 255, feetRgb.b / 255, 1], [0, 0, 0, 0])
		: skinImage;

	const processPart = (
		part: sharp.Sharp,
		left: number,
		top: number,
		width: number,
		height: number,
		newWidth: number,
		newHeight: number
	) => {
		return part
			.clone()
			.extract({
				left,
				top,
				width,
				height
			})
			.resize(newWidth * scale, newHeight * scale, { kernel: 'cubic' });
	};

	const promises = [
		processPart(feetImage, 192, 64, 64, 32, 64, 30).raw().toBuffer({ resolveWithObject: true }),
		processPart(bodyImage, 96, 0, 96, 96, 64, 64).raw().toBuffer({ resolveWithObject: true }),
		processPart(feetImage, 192, 64, 64, 32, 64, 30).raw().toBuffer({ resolveWithObject: true }),
		processPart(feetImage, 192, 32, 64, 32, 64, 30).raw().toBuffer({ resolveWithObject: true }),
		processPart(bodyImage, 0, 0, 96, 96, 64, 64).raw().toBuffer({ resolveWithObject: true }),
		processPart(feetImage, 192, 32, 64, 32, 64, 30).raw().toBuffer({ resolveWithObject: true }),
		processPart(bodyImage, 64, 96, 32, 32, 26, 26).raw().toBuffer({ resolveWithObject: true }),
		processPart(bodyImage, 64, 96, 32, 32, 26, 26)
			.flop()
			.raw()
			.toBuffer({ resolveWithObject: true })
	];

	const [
		backFeetShadow,
		bodyShadow,
		frontFeetShadow,
		backFeet,
		body,
		frontFeet,
		leftEye,
		rightEye
	] = await Promise.all(promises);

	return sharp({
		create: {
			width: outputWidth,
			height: outputHeight,
			channels: 4,
			background: { r: 0, g: 0, b: 0, alpha: 0 }
		}
	}).composite([
		{
			input: backFeetShadow.data,
			raw: { ...backFeetShadow.info, premultiplied: false },
			left: 0,
			top: 32 * scale,
			blend: 'over'
		},
		{
			input: bodyShadow.data,
			raw: { ...bodyShadow.info, premultiplied: false },
			left: 8 * scale,
			top: 0,
			blend: 'over'
		},
		{
			input: frontFeetShadow.data,
			raw: { ...frontFeetShadow.info, premultiplied: false },
			left: 15 * scale,
			top: 32 * scale,
			blend: 'over'
		},
		{
			input: backFeet.data,
			raw: { ...backFeet.info, premultiplied: false },
			left: 0 * scale,
			top: 32 * scale,
			blend: 'over'
		},
		{
			input: body.data,
			raw: { ...body.info, premultiplied: false },
			left: 8 * scale,
			top: 0,
			blend: 'over'
		},
		{
			input: frontFeet.data,
			raw: { ...frontFeet.info, premultiplied: false },
			left: 15 * scale,
			top: 32 * scale,
			blend: 'over'
		},
		{
			input: leftEye.data,
			raw: { ...leftEye.info, premultiplied: false },
			left: 30 * scale,
			top: 16 * scale,
			blend: 'over'
		},
		{
			input: rightEye.data,
			raw: { ...rightEye.info, premultiplied: false },
			left: 39 * scale,
			top: 16 * scale,
			blend: 'over'
		}
	]);
};

export const generatePointsImage = async (
	name: string,
	skin: { n: string; b: number; f: number },
	ranks: {
		icon: IconDefinition;
		name: string;
		rank: { points?: number; rank?: number | null; pending?: number };
	}[]
) => {
	console.time('generatePointsImage');

	// Render the Tee character with the player's skin and colors
	const tee = await renderTee(skin.n, skin.b, skin.f, 2);
	const teeInfo = tee ? await tee.raw().toBuffer({ resolveWithObject: true }) : null;

	// Filter ranks to show only the most important ones (first 4)
	const displayRanks = ranks.slice(0, 4);

	// Create rank cards SVG
	let rankCardsHtml = '';
	const cardWidth = 420;
	const cardHeight = 140;
	const cardsPerRow = 2;
	const cardSpacing = 30;
	const startX = 40;
	const startY = 140;

	displayRanks.forEach((rank, index) => {
		const row = Math.floor(index / cardsPerRow);
		const col = index % cardsPerRow;
		const x = startX + col * (cardWidth + cardSpacing);
		const y = startY + row * (cardHeight + cardSpacing);

		const hasRank = rank.rank.rank && rank.rank.points;
		const opacity = hasRank ? 1 : 0.5;

		// Format points and rank display
		const pointsText = rank.rank.points ? `${rank.rank.points}pts` : '0pts';
		const rankText = rank.rank.rank ? `No.${rank.rank.rank}` : '未获得';
		const pendingText = rank.rank.pending ? ` +${rank.rank.pending}` : '';

		rankCardsHtml += `
			<g opacity="${opacity}">
				<!-- Card background -->
				<rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}"
					  rx="12" fill="#475569" stroke="none"/>

				<!-- Icon and title -->
				<svg x="${x + 10}" y="${y + 10}" width="32" height="32" viewBox="0 0 ${faGlobe.icon[0]} ${faGlobe.icon[1]}">
					<path d="${faGlobe.icon[4]}" fill="#f1f5f9" />
				</svg>
				<text x="${x + 48}" y="${y + 35}" font-family="Noto Sans CJK SC"
					  font-weight="600" font-size="22" fill="#f1f5f9">
					${rank.name}
				</text>

				<!-- Rank and points -->
				<text x="${x + 20}" y="${y + 70}" font-family="Noto Sans CJK SC"
					  font-weight="400" font-size="18" fill="#cbd5e1">
					${rankText}
				</text>

				<text x="${x + 20}" y="${y + 100}" font-family="Noto Sans CJK SC"
					  font-weight="400" font-size="18" fill="#cbd5e1">
					${pointsText}${pendingText}
				</text>
			</g>
		`;
	});

	const svgText = `
		<svg width="960" height="512" xmlns="http://www.w3.org/2000/svg">
			<!-- Background -->
			<rect width="960" height="512" fill="#1e293b"/>

			<!-- Player name -->
			<text x="200" y="80" font-family="Noto Sans CJK SC" font-weight="600"
				  font-size="48" fill="#f1f5f9">${name}</text>

			<!-- Subtitle -->
			<text x="200" y="110" font-family="Noto Sans CJK SC" font-weight="400"
				  font-size="20" fill="#94a3b8">DDNet 玩家信息</text>

			<!-- Rank cards -->
			${rankCardsHtml}
		</svg>
	`;

	const composite: sharp.OverlayOptions[] = [];

	// Add the Tee character if available
	if (teeInfo) {
		composite.push({
			input: teeInfo.data,
			raw: { ...teeInfo.info, premultiplied: false },
			left: 40,
			top: 20,
			blend: 'over'
		});
	}

	const result = sharp(Buffer.from(svgText)).composite(composite);
	const data = await result.png().toBuffer();
	console.timeEnd('generatePointsImage');
	return data;
};
