export class ArgParser {
	private matches;
	public constructor(command: string) {
		this.matches = command.match(
			/((?:(?:\\")|[^"\s])+\s*)|('.*?(?:(?<!\\)'|$)\s*)|(".*?(?:(?<!\\)"|$)\s*)/gs
		);
	}

	public getString(index: number) {
		if (!this.matches) return undefined;
		const part = this.matches[index];
		if (!part) return undefined;
		const str = part.trimEnd().replace(/\\['"]/g, (str) => str.slice(1));
		if (str.startsWith('"') && str.endsWith('"')) return str.slice(1, str.length - 1);
		if (str.startsWith("'") && str.endsWith("'")) return str.slice(1, str.length - 1);
		return str;
	}

	public getInt(index: number) {
		const result = parseInt(this.getString(index) || 'NaN');
		return isNaN(result) ? undefined : result;
	}

	public getFloat(index: number) {
		const result = parseFloat(this.getString(index) || 'NaN');
		return isNaN(result) ? undefined : result;
	}

	public getRest(index: number) {
		if (!this.matches) return undefined;
		const str = this.matches.slice(index).join('');
		if (str.startsWith('"') && str.endsWith('"')) return str.slice(1, str.length - 1);
		if (str.startsWith("'") && str.endsWith("'")) return str.slice(1, str.length - 1);
		return str;
	}
}
