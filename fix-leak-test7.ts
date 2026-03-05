import { writeFileSync, readFileSync } from 'fs';

async function run() {
    let rss = process.memoryUsage().rss;
    console.log(`Initial: ${rss / 1024 / 1024} MB`);
    const str = `<div class="block2 ladder"><h3>Points (10 total)</h3><table><tr><td>10</td><td class="points">10</td><td>John Doe</td></tr></table></div>`.repeat(500);

    for (let i = 0; i < 1000; i++) {
        
        class LadderHandler implements HTMLRewriterTypes.HTMLRewriterElementContentHandlers {
            async element(element: HTMLRewriterTypes.Element) {
                if (element.tagName === 'tr') {
                    element.onEndTag(() => {
                        // this will leak memory
                    });
                }
            }
        }

        new HTMLRewriter()
            .on(
				[
					'div[class="block2 ladder"] > h3',
					'div[class="block2 ladder"] > table > tr',
					'div[class="block2 ladder"] > table > tr > td',
					'div[class="block2 ladder"] > table > tr > td > img'
				].join(','),
				new LadderHandler()
			)
            .transform(str);
            
        if (i % 100 === 0) {
            Bun.gc(true);
            const newRss = process.memoryUsage().rss;
            console.log(`Iteration ${i}: ${newRss / 1024 / 1024} MB (+${(newRss - rss) / 1024 / 1024} MB)`);
            rss = newRss;
        }
    }
    
    Bun.gc(true);
    console.log(`Final: ${process.memoryUsage().rss / 1024 / 1024} MB`);
}

run();
