import fs from 'fs';

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

// We need to push the final rank as well. The HTML ends, but document handler can catch it.
file = file.replace(
`		return ranks;
	},`,
`		// push the last rank
		const handler = new LadderHandler(ranks);
		new HTMLRewriter()
			.on(
				[
					'div[class="block2 ladder"] > h3',
					'div[class="block2 ladder"] > table > tr:not([class="allPoints"])',
					'div[class="block2 ladder"] > table > tr:not([class="allPoints"]) > td',
					'div[class="block2 ladder"] > table > tr:not([class="allPoints"]) > td > img'
				].join(','),
				handler
			)
			.on('p[class="toggle"] > span[data-type="date"]', new UpdateTimeHandler(ranks))
			.onDocument({
				end(end) {
					// @ts-ignore
					if (handler.context.rank.name && handler.context.ladder) {
						// @ts-ignore
						ranks.ranks[handler.context.ladder].push(handler.context.rank);
					}
				}
			})
			.transform(html);

		return ranks;
	},`
);

// remove the original one
file = file.replace(
`		new HTMLRewriter()
			.on(
				[
					'div[class="block2 ladder"] > h3',
					'div[class="block2 ladder"] > table > tr:not([class="allPoints"])',
					'div[class="block2 ladder"] > table > tr:not([class="allPoints"]) > td',
					'div[class="block2 ladder"] > table > tr:not([class="allPoints"]) > td > img'
				].join(','),
				new LadderHandler(ranks)
			)
			.on('p[class="toggle"] > span[data-type="date"]', new UpdateTimeHandler(ranks))
			.transform(html);

		// push the last rank`,
		`		// push the last rank`
);

// Do the same for region cache
file = file.replace(
`			new HTMLRewriter()
				.on(
					[
						'div[class="block2 ladder"] > h3',
						'div[class="block2 ladder"] > table > tr',
						'div[class="block2 ladder"] > table > tr > td',
						'div[class="block2 ladder"] > table > tr > td > img'
					].join(','),
					new LadderHandler(ranks)
				)
				.on('p[class="toggle"] > span[data-type="date"]', new UpdateTimeHandler(ranks))
				.transform(html);

			return ranks;
		},`,
`			const handler = new LadderHandler(ranks);
			new HTMLRewriter()
				.on(
					[
						'div[class="block2 ladder"] > h3',
						'div[class="block2 ladder"] > table > tr',
						'div[class="block2 ladder"] > table > tr > td',
						'div[class="block2 ladder"] > table > tr > td > img'
					].join(','),
					handler
				)
				.on('p[class="toggle"] > span[data-type="date"]', new UpdateTimeHandler(ranks))
				.onDocument({
					end(end) {
						// @ts-ignore
						if (handler.context.rank.name && handler.context.ladder) {
							// @ts-ignore
							ranks.ranks[handler.context.ladder].push(handler.context.rank);
						}
					}
				})
				.transform(html);

			return ranks;
		},`
);

fs.writeFileSync('src/lib/server/fetches/ranks.ts', file);
console.log('Fixed onEndTag memory leak in ranks.ts');
