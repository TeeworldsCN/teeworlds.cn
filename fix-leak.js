const fs = require('fs');

let file = fs.readFileSync('src/lib/server/fetches/ranks.ts', 'utf8');

file = file.replace(
`		if (element.tagName === 'h3') {
			// find ladder
			this.context.type = 'ladder';
		} else if (element.tagName === 'tr') {
			// reset rank
			this.context.rank = { rank: 0, points: 0, region: '', name: '' };
			element.onEndTag(() => {
				if (this.context.rank.name && this.context.ladder)
					this.data.ranks[this.context.ladder].push(this.context.rank);
			});
		} else if (element.tagName === 'td') {`,
`		if (element.tagName === 'h3') {
			// find ladder
			this.context.type = 'ladder';
		} else if (element.tagName === 'tr') {
			// if previous rank is valid, push it (since we don't have onEndTag which leaks memory in Bun)
			if (this.context.rank.name && this.context.ladder)
				this.data.ranks[this.context.ladder].push(this.context.rank);
			// reset rank
			this.context.rank = { rank: 0, points: 0, region: '', name: '' };
		} else if (element.tagName === 'td') {`
);

fs.writeFileSync('src/lib/server/fetches/ranks.ts', file);
console.log('Fixed onEndTag memory leak in ranks.ts');
