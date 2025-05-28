import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import sqlstring from 'sqlstring-sqlite';

// check whether two name can be merged
export const GET: RequestHandler = async ({ request, url }) => {
	const from = url.searchParams.get('from');
	const to = url.searchParams.get('to');
	if (!from || !to) {
		return error(400);
	}

	const SQL = `SELECT t1.Map FROM teamrace t1 JOIN teamrace t2 ON t1.ID = t2.ID
WHERE t1.Name = ${sqlstring.escape(from)} AND t2.Name = ${sqlstring.escape(to)} Limit 1;`;

	const queryUrl = `https://db.ddstats.org/ddnet.json?sql=${encodeURIComponent(SQL)}`;
	const response = await fetch(queryUrl);

	if (!response.ok) {
		return error(500);
	}

	const data = await response.json();
	return json(data.rows.length <= 0);
};
