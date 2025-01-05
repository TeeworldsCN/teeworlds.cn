import { browser } from '$app/environment';

import { writable } from 'svelte/store';

export interface SortKey {
	key: 'region' | 'player' | 'name' | 'map' | 'mode';
	desc: boolean;
}

const defaultValue = {
	include: '',
	exclude: '',
	sort: [
		{ key: 'region', desc: false },
		{ key: 'player', desc: true },
		{ key: 'name', desc: false },
		{ key: 'map', desc: false },
		{ key: 'mode', desc: false }
	] as SortKey[]
};

const initialValue = browser
	? JSON.parse(window.localStorage.getItem('ddnet:servers:search') || JSON.stringify(defaultValue))
	: defaultValue;

const serverSearch = writable<typeof defaultValue>(initialValue);

serverSearch.subscribe((value) => {
	if (browser) {
		window.localStorage.setItem('ddnet:servers:search', JSON.stringify(value));
	}
});

export default serverSearch;
