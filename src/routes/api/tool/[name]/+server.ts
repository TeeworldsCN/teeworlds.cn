import { getToolCount, increaseToolCount } from '$lib/server/db/tool.js';

export const GET = ({ params }) => {
	const name = params.name;

	const count = getToolCount(name);

	return new Response(JSON.stringify({ count }), {
		headers: {
			'Content-Type': 'application/json'
		}
	});
};

export const POST = ({ params }) => {
	const name = params.name;

	const count = increaseToolCount(name);

	return new Response(JSON.stringify({ count }), {
		headers: {
			'Content-Type': 'application/json'
		}
	});
};
