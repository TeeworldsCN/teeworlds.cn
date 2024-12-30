import type { SUBSCRIPTION_KEYS } from '$lib/types';
import { persistent } from './kv';

export type SubscriptionKey = (typeof SUBSCRIPTION_KEYS)[number];
export type Subscriptions = string[];

export const listSubscriptions = () => {
	return persistent.listPrefix<Subscriptions>(`sub:`);
};

export const getSubscriptions = (key: SubscriptionKey) => {
	const result = persistent.get<Subscriptions>(`sub:${key}`);
	if (!result) {
		return [];
	}
    return result;
};

export const addSubscription = (key: SubscriptionKey, target: string) => {
	const result = persistent.get<Subscriptions>(`sub:${key}`);
	if (!result) {
		persistent.set<Subscriptions>(`sub:${key}`, [target]);
		return;
	}

	if (result.includes(target)) {
		return;
	}
	result.push(target);
	persistent.set<Subscriptions>(`sub:${key}`, result);
};

export const removeSubscription = (key: SubscriptionKey, target: string) => {
	const result = persistent.get<Subscriptions>(`sub:${key}`);
	if (!result) {
		return;
	}
	const index = result.indexOf(target);
	if (index < 0) {
		return;
	}
	result.splice(index, 1);
	persistent.set<Subscriptions>(`sub:${key}`, result);
};
