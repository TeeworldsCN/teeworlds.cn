import sharp from 'sharp';
import { getSkinImageByName } from '../skin-cache';
import { ddnetColorToRgb } from '$lib/ddnet/helpers';
import { type IconDefinition } from '@fortawesome/free-solid-svg-icons';
import * as qrcode from 'qrcode';
import { encodeAsciiURIComponent } from '$lib/link';

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
	skin: { n: string; b?: number; f?: number },
	ranks: {
		icon: IconDefinition;
		iconColor: string;
		name: string;
		rank?: { points?: number; rank?: number };
		fallback: string;
	}[]
) => {
	console.time('generatePointsImage');

	// Render the Tee character with the player's skin and colors
	const [tee, code] = await Promise.all([
		renderTee(skin.n, skin.b, skin.f, 1),
		qrcode.toBuffer(`https://teeworlds.cn/goto#p${encodeAsciiURIComponent(name)}`, {
			width: 128,
			errorCorrectionLevel: 'L'
		})
	]);
	const teeInfo = tee ? await tee.raw().toBuffer({ resolveWithObject: true }) : null;

	const displayRanks = ranks.slice(0, 6);

	// Create rank cards SVG
	let rankCardsHtml = '';
	const cardWidth = 224;
	const cardHeight = 101;
	const cardsPerCol = 2;
	const cardSpacing = 10;
	const startX = 14;
	const startY = 158;

	displayRanks.forEach((rank, index) => {
		const row = index % cardsPerCol;
		const col = Math.floor(index / cardsPerCol);

		const x = startX + col * (cardWidth + cardSpacing);
		const y = startY + row * (cardHeight + cardSpacing);

		const hasRank = rank.rank && rank.rank.rank;
		const opacity = hasRank ? 1 : 0.5;

		// Format points and rank display
		const pointsText = rank.rank && rank.rank.rank ? `${rank.rank.points}` : '';
		const rankText = rank.rank && rank.rank.rank ? `#${rank.rank.rank}` : '';

		rankCardsHtml += `
			<g opacity="${opacity}">
				<!-- Card background -->
				<rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}"
					  rx="12" fill="#475569" stroke="none"/>

				<!-- Icon and title -->
				<svg x="${x + 10}" y="${y + 8}" width="26" height="26" viewBox="0 0 ${rank.icon.icon[0]} ${rank.icon.icon[1]}">
					<path d="${rank.icon.icon[4]}" fill="${rank.iconColor}" />
				</svg>
				<text x="${x + 112}" y="${y + 32}" font-family="Noto Sans CJK SC"
					  font-weight="400" font-size="28" fill="#cbd5e1" text-anchor="middle">
					${rank.name}
				</text>

				<!-- Points and Rank -->
				<text x="${x + 112}" y="${y + 76}" font-family="Noto Sans CJK SC"
					  font-weight="700" font-size="${pointsText ? '42' : '24'}" fill="#ffffff" text-anchor="middle">
					${pointsText || rank.fallback}
				</text>
				<text x="${x + 215}" y="${y + 95}" font-family="Noto Sans CJK SC"
					  font-weight="400" font-size="18" fill="#cbd5e1" text-anchor="end">
					${rankText}
				</text>
			</g>
		`;
	});

	const svgText = `
		<svg width="720" height="380" xmlns="http://www.w3.org/2000/svg">
			<!-- Background -->
			<rect width="720" height="380" fill="#1e293b"/>

			<!-- Tee rect -->
			<rect x="32" y="48" width="64" height="64" rx="12" fill="#475569"/>

			<!-- Player name -->
			<text x="110" y="90" font-family="Noto Sans CJK SC" font-weight="600"
				  font-size="34" fill="#f1f5f9">${name}</text>
			
			<!-- Info name -->
			<path d="M0 10 h116 a12 12 0 0 1 12 12 v0 a12 12 0 0 1 -12 12 h-116 v-24" fill="#e17100"/>
			<text x="12" y="30" font-family="Noto Sans CJK SC" font-weight="600"
				  font-size="20" fill="#ffffff">DDNet 分数</text>
			
			<!-- Qr code Background -->
			<rect x="580" y="5" width="128" height="140" rx="12" fill="#62748e"/>
			<text x="644" y="24" font-family="Noto Sans CJK SC" font-weight="500"
				  font-size="16" fill="#1d293d" text-anchor="middle">扫码查看详情</text>

			<!-- Rank cards -->
			${rankCardsHtml}
		</svg>
	`;

	const composite: sharp.OverlayOptions[] = [];

	// Add the Tee character if available
	if (teeInfo) {
		composite.push({
			input: code,
			left: 580,
			top: 18,
			blend: 'multiply'
		});
		composite.push({
			input: teeInfo.data,
			raw: { ...teeInfo.info, premultiplied: false },
			left: 24,
			top: 48,
			blend: 'over'
		});
	}

	const result = sharp(Buffer.from(svgText)).composite(composite);
	const data = await result.png().toBuffer();
	console.timeEnd('generatePointsImage');
	return data;
};
