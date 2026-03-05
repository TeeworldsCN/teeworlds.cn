import { readFileSync, writeFileSync } from 'fs';

let file = readFileSync('src/lib/server/fetches/ranks.ts', 'utf8');

file = file.replace(
`			element.onEndTag(() => {
				if (this.context.rank.name && this.context.ladder)
					this.data.ranks[this.context.ladder].push(this.context.rank);
			});`,
`			// Element ending logic moved to end of element to prevent memory leak
			// (HTMLRewriter onEndTag closures can capture context and leak memory)`
);

// find where to add the check for row ending
// We need to push the rank at the start of a new row or when we finish parsing
// Let's replace the whole element function

let replacement = `	async element(element: HTMLRewriterTypes.Element) {
		if (element.tagName === 'h3') {
			// find ladder
			this.context.type = 'ladder';
		} else if (element.tagName === 'tr') {
			if (this.context.rank.name && this.context.ladder) {
				this.data.ranks[this.context.ladder].push({ ...this.context.rank });
			}
			// reset rank
			this.context.rank = { rank: 0, points: 0, region: '', name: '' };
		} else if (element.tagName === 'td') {
			// extract info
			const className = element.getAttribute('class');
			if (className === 'rankglobal') {
				this.context.type = 'rank';
			} else if (className === 'points') {
				this.context.type = 'points';
			} else if (!element.hasAttribute('class')) {
				this.context.type = 'name';
			}
		} else if (element.tagName === 'img') {
			this.context.rank.region = element.getAttribute('alt') || 'UNK';
		}
	}
	
	// We also need a way to push the very last rank
	// But ranks are inside tables, and there are many tables
	// Let's push when h3 is seen (start of new ladder) or table ends. But we can't hook table end easily without onEndTag.
	// Oh, we can just push in document.onEnd() or just trust that since the next row pushes the previous row, we only miss the last row.
`;

