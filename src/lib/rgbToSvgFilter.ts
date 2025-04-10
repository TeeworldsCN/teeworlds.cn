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
	const r = color.r / 255;
	const g = color.g / 255;
	const b = color.b / 255;

	// Create the SVG filter definition
	const filterDef = `
    <filter id="${id}">
      <feColorMatrix type="saturate" values="0" />
      <feComponentTransfer>
        <feFuncR type="table" tableValues="0 ${r}" />
        <feFuncG type="table" tableValues="0 ${g}" />
        <feFuncB type="table" tableValues="0 ${b}" />
      </feComponentTransfer>
    </filter>
  `;

	return {
		id,
		filterDef
	};
};
