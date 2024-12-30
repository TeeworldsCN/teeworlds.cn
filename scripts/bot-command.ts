const args = process.argv.slice(2);

const options = {
	port: 5173
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
	const result = await fetch(`http://localhost:${options.port}/bots/local`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-forwarded-for': '127.0.0.1',
			'x-forwarded-host': 'localhost',
			'x-forwarded-proto': 'http'
		},
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
