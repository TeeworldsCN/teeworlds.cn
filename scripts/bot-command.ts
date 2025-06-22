import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const args = process.argv.slice(2);

const options = {
	port: parseInt(process.env.PORT || '3000')
};

let rest = '';

for (let i = 0; i < args.length; i++) {
	if (args[i].startsWith('--')) {
		const equalsIndex = args[i].indexOf('=');
		const key = args[i].slice(2, equalsIndex);
		const value = args[i].slice(equalsIndex + 1);
		if (options[key]) {
			const type = typeof options[key];
			if (type == 'number') {
				options[key] = parseInt(value);
			} else if (type == 'boolean') {
				options[key] = value == 'true';
			} else if (type == 'string') {
				options[key] = value;
			} else {
				console.log(`Unknown option ${key}`);
				process.exit(1);
			}
		} else {
			console.log(`Unknown option ${key}`);
			process.exit(1);
		}
	} else {
		rest = args.slice(i).join(' ');
		break;
	}
}

(async () => {
	// Build headers following SvelteKit adapter-node conventions
	const headers: Record<string, string> = {
		'Content-Type': 'application/json'
	};

	// Read SvelteKit adapter-node environment variables
	const addressHeader = process.env.ADDRESS_HEADER?.toLowerCase();
	const xffDepth = parseInt(process.env.XFF_DEPTH || '1');

	// Set headers based on SvelteKit configuration
	if (addressHeader) {
		headers[addressHeader] = '127.0.0.1';
	} else {
		// Default fallback headers for localhost detection
		let xff = '127.0.0.1';
		for (let i = 1; i < xffDepth; i++) {
			xff += ',127.0.0.1';
		}
		headers['x-forwarded-for'] = xff;
		headers['x-real-ip'] = '127.0.0.1';
	}

	const result = await fetch(`http://localhost:${options.port}/bots/local`, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			message: rest
		})
	});

	if (!result.ok) {
		throw new Error(`Failed to execute command: ${result.status} ${result.statusText}`);
	}

	const data = await result.json();
	console.log(data);
})();
