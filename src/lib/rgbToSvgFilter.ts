type RGB = { r: number; g: number; b: number };

/**
 * Converts an RGB color to SVG color matrix filter values
 * This creates a filter that first grayscales the image and then applies the color
 *
 * @param color The RGB color to convert to a filter
 * @returns An object with the filter ID and the SVG filter definition
 */
export const rgbToSvgFilter = (color: RGB, id: string) => {
	// Normalize RGB values to 0-1 range
	const r = Math.round(color.r) / 255;
	const g = Math.round(color.g) / 255;
	const b = Math.round(color.b) / 255;

	// Create the SVG filter definition
	const filterDef = `
		<filter id="${id}">
		  <feComponentTransfer color-interpolation-filters="sRGB">
			<feFuncR type="linear" slope="${r}" />
			<feFuncG type="linear" slope="${g}" />
			<feFuncB type="linear" slope="${b}" />
		  </feComponentTransfer>
		</filter>
	  `;

	return {
		id,
		filterDef
	};
};
