import type { SQLQueryBindings, Database } from 'bun:sqlite';

export type DbQuery = (
	sqlString: string,
	...parameter: SQLQueryBindings[]
) => ReturnType<ReturnType<Database['query']>['all']>;
export type DbClose = () => void;

export type KeyvSqliteOptions = {
	dialect?: 'sqlite';
	table?: string;
	keySize?: number;
	db?: string;
	iterationLimit?: number | string;
	connect?: () => {
		query: DbQuery;
		close: DbClose;
	};
};

export type Db = {
	query: DbQuery;
	close: DbClose;
};
