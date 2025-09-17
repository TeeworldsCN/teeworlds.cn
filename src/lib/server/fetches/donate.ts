import { FetchCache } from '../fetch-cache';

export interface DonateInfo {
	funding: {
		total: {
			year: string;
			donated: number;
			cost: number;
			percentage: number;
		};
		servers: Array<{
			name: string;
			displayName: string;
			donated: number;
			cost: number;
			percentage: number;
			sponsor?: string;
		}>;
		old: {
			years: string;
			donated: number;
			cost: number;
			percentage: number;
		};
	};
	donors: string[];
	donateLinks: {
		paypal: string;
	};
}

class DonorHandler implements HTMLRewriterTypes.HTMLRewriterElementContentHandlers {
	private data: DonateInfo;

	constructor(data: DonateInfo) {
		this.data = data;
	}

	async text(text: HTMLRewriterTypes.Text) {
		const donorName = text.text
			.trim()
			.replace(/&nbsp;/g, ' ')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&amp;/g, '&');
		if (donorName && donorName.length > 1 && !this.data.donors.includes(donorName)) {
			this.data.donors.push(donorName);
		}
	}
}

class PayPalHandler implements HTMLRewriterTypes.HTMLRewriterElementContentHandlers {
	private data: DonateInfo;

	constructor(data: DonateInfo) {
		this.data = data;
	}

	async element(element: HTMLRewriterTypes.Element) {
		const href = element.getAttribute('href');
		if (href) {
			this.data.donateLinks.paypal = href;
		}
	}
}

export const donate = new FetchCache<DonateInfo>(
	'https://ddnet.org/funding/',
	async (response) => {
		const html = await response.text();

		// Extract JavaScript variables using regex
		const costsMatch = html.match(/var costs = ({[\s\S]*?});/);
		const donatedMatch = html.match(/var donated = (\d+);/);
		const yearStrMatch = html.match(/var yearStr = "(\d+)";/);
		const costOldMatch = html.match(/var costOld = ([^;]+);/);
		const donatedOldMatch = html.match(/var donatedOld = (\d+);/);
		const yearStrOldMatch = html.match(/var yearStrOld = "([^"]+)";/);

		if (!costsMatch || !donatedMatch || !yearStrMatch) {
			throw new Error('Failed to parse funding data');
		}

		// Evaluate the costs object safely
		const costsStr = costsMatch[1];
		const costs = eval(`(${costsStr})`);
		const donated = parseInt(donatedMatch[1]);
		const yearStr = yearStrMatch[1];
		// Calculate the old cost properly - it's a mathematical expression
		let costOld = 0;
		if (costOldMatch) {
			try {
				// The costOld is typically something like "365*24 + 365*12 + ..."
				costOld = eval(costOldMatch[1]);
			} catch {
				costOld = 0;
			}
		}
		const donatedOld = donatedOldMatch ? parseInt(donatedOldMatch[1]) : 0;
		const yearStrOld = yearStrOldMatch ? yearStrOldMatch[1] : '';

		// Extract server names from HTML and calculate funding details
		const servers: DonateInfo['funding']['servers'] = [];
		let totalCost = 0;
		let totalPartSponsored = 0;

		// Extract server display names from the HTML table structure
		const serverNameMap: Record<string, string> = {};
		const tableMatch = html.match(/<table[^>]*>[\s\S]*?<\/table>/);
		if (tableMatch) {
			const tableHtml = tableMatch[0];
			const rowMatches = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/g);
			if (rowMatches) {
				for (const rowMatch of rowMatches) {
					const idMatch = rowMatch.match(/id="funding-([^"]+)"/);
					const cellMatch = rowMatch.match(/<td[^>]*>([^<]+)<\/td>/);
					if (idMatch && cellMatch) {
						const serverKey = idMatch[1];
						const displayName = cellMatch[1].trim();
						if (displayName && !displayName.includes('€') && !displayName.includes('sponsored')) {
							serverNameMap[serverKey] = displayName;
						}
					}
				}
			}
		}

		// If we couldn't extract from HTML table, try a simpler text-based approach
		if (Object.keys(serverNameMap).length === 0) {
			const serverTextMatch = html.match(/DDNet\.org[\s\S]*?DDNet South Africa/);
			if (serverTextMatch) {
				const serverText = serverTextMatch[0];
				const lines = serverText
					.split('\n')
					.map((line) => line.trim())
					.filter((line) => line.length > 0);
				let index = 0;
				for (const [serverKey] of Object.entries(costs)) {
					if (index < lines.length) {
						serverNameMap[serverKey] = lines[index];
						index++;
					}
				}
			}
		}

		for (const [serverKey, serverData] of Object.entries(costs)) {
			const displayName = serverNameMap[serverKey];

			if (typeof serverData === 'number') {
				totalCost += serverData;
				servers.push({
					name: serverKey,
					displayName,
					donated: 0, // Will be calculated later
					cost: serverData,
					percentage: 0
				});
			} else if (Array.isArray(serverData)) {
				const [sponsored, cost, sponsor] = serverData;
				totalCost += cost;
				totalPartSponsored += sponsored;
				servers.push({
					name: serverKey,
					displayName,
					donated: sponsored, // Sponsored amount
					cost: cost,
					percentage: (sponsored / cost) * 100,
					sponsor: sponsor
				});
			} else if (typeof serverData === 'string') {
				// Fully sponsored server
				servers.push({
					name: serverKey,
					displayName,
					donated: 0,
					cost: 0,
					percentage: 100,
					sponsor: serverData
				});
			}
		}

		// Calculate donation distribution following DDNet's original algorithm
		const sumToPay = totalCost - totalPartSponsored;
		let donatedRest = 0;
		const paid: Record<string, number> = {};

		// First pass: calculate base allocation for each server
		for (const server of servers) {
			paid[server.name] = 0;

			// Add any remaining donations from previous servers
			if (donatedRest > 0) {
				paid[server.name] += donatedRest;
				donatedRest = 0;
			}

			if (server.cost > 0 && !server.sponsor) {
				// Unsponsored server: gets proportional share of donations
				paid[server.name] += (server.cost * donated) / sumToPay;
				if (paid[server.name] > server.cost) {
					donatedRest += paid[server.name] - server.cost;
					paid[server.name] = server.cost;
				}
			} else if (server.sponsor && server.cost > 0) {
				// Partially sponsored server: sponsored amount + proportional share of remaining cost
				const remainingCost = server.cost - server.donated; // server.donated is the sponsored amount
				paid[server.name] += (remainingCost * donated) / sumToPay + server.donated;
				if (paid[server.name] > server.cost) {
					donatedRest += paid[server.name] - server.cost;
					paid[server.name] = server.cost;
				}
			}
			// Fully sponsored servers (cost === 0) don't need allocation
		}

		// Second pass: update server objects with calculated amounts
		for (const server of servers) {
			if (server.cost === 0) {
				// Fully sponsored server
				server.donated = 0;
				server.percentage = 100;
			} else {
				server.donated = paid[server.name] || 0;
				server.percentage = (server.donated / server.cost) * 100;
			}
		}

		// Extract donors list using HTMLRewriter
		const data: DonateInfo = {
			funding: {
				total: {
					year: yearStr,
					donated: donated + totalPartSponsored,
					cost: totalCost,
					percentage: ((donated + totalPartSponsored) / totalCost) * 100
				},
				servers,
				old: {
					years: yearStrOld,
					donated: donatedOld,
					cost: costOld,
					percentage: costOld > 0 ? (donatedOld / costOld) * 100 : 0
				}
			},
			donors: [],
			donateLinks: { paypal: '' }
		};

		// Extract donors using HTMLRewriter targeting the staff class
		new HTMLRewriter()
			.on('.staff>li>a', new DonorHandler(data))
			.on('.staff>li>span', new DonorHandler(data))
			.transform(html);

		// Extract PayPal link using HTMLRewriter
		new HTMLRewriter().on('a[href*="paypal"]', new PayPalHandler(data)).transform(html);

		return data;
	},
	{
		version: 4
	}
);
