const fs = require('fs');
let file = fs.readFileSync('src/lib/server/fetches/ranks.ts', 'utf8');

file = file.replace(
`			element.onEndTag(() => {
				if (this.context.rank.name && this.context.ladder)
					this.data.ranks[this.context.ladder].push(this.context.rank);
			});`,
`			// Element ending logic moved to end of element to prevent memory leak
			// (HTMLRewriter onEndTag closures can capture context and leak memory)`
);

// We need to find the element function and add the new elementEnd function or adjust the logic
// Bun's HTMLRewriter doesn't seem to have elementEnd but maybe we can just push on the next row
