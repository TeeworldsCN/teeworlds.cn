import { sqlite } from '../sqlite';

// ============================================================================
// TABLE CREATION
// ============================================================================

// Create posts table
sqlite
	.query(
		`CREATE TABLE IF NOT EXISTS posts (
			uuid TEXT PRIMARY KEY,
			key TEXT UNIQUE NOT NULL,
			title TEXT NOT NULL,
			content TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		)`
	)
	.run();

// indexes
sqlite.query('CREATE INDEX IF NOT EXISTS posts_key ON posts (key);').run();
sqlite.query('CREATE INDEX IF NOT EXISTS posts_created_at ON posts (created_at);').run();

// ============================================================================
// TYPES
// ============================================================================

export interface Post {
	uuid: string;
	key: string;
	title: string;
	content: string;
	created_at: number;
	updated_at: number;
}

export interface CreatePostData {
	key: string;
	title: string;
	content: string;
}

export interface UpdatePostData {
	key?: string;
	title?: string;
	content?: string;
}

// ============================================================================
// PREPARED STATEMENTS
// ============================================================================

const createPostStmt = sqlite.prepare(
	'INSERT INTO posts (uuid, key, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
);

const getPostByKeyStmt = sqlite.prepare(
	'SELECT * FROM posts WHERE key = ?'
);

const getPostByUuidStmt = sqlite.prepare(
	'SELECT * FROM posts WHERE uuid = ?'
);

const updatePostStmt = sqlite.prepare(
	'UPDATE posts SET key = ?, title = ?, content = ?, updated_at = ? WHERE uuid = ?'
);

const deletePostStmt = sqlite.prepare('DELETE FROM posts WHERE uuid = ?');

const listPostsStmt = sqlite.prepare(
	'SELECT * FROM posts ORDER BY created_at DESC'
);

// ============================================================================
// FUNCTIONS
// ============================================================================

export const createPost = (data: CreatePostData): Post => {
	const now = Date.now();
	const postUuid = crypto.randomUUID();

	createPostStmt.run(postUuid, data.key, data.title, data.content, now, now);

	return {
		uuid: postUuid,
		key: data.key,
		title: data.title,
		content: data.content,
		created_at: now,
		updated_at: now
	};
};

export const getPostByKey = (key: string): Post | null => {
	return getPostByKeyStmt.get(key) as Post | null;
};

export const getPostByUuid = (uuid: string): Post | null => {
	return getPostByUuidStmt.get(uuid) as Post | null;
};

export const updatePost = (uuid: string, data: UpdatePostData): boolean => {
	const existingPost = getPostByUuid(uuid);
	if (!existingPost) {
		return false;
	}
	
	const updatedKey = data.key ?? existingPost.key;
	const updatedTitle = data.title ?? existingPost.title;
	const updatedContent = data.content ?? existingPost.content;
	const now = Date.now();
	
	const result = updatePostStmt.run(updatedKey, updatedTitle, updatedContent, now, uuid);
	return result.changes > 0;
};

export const deletePost = (uuid: string): boolean => {
	const result = deletePostStmt.run(uuid);
	return result.changes > 0;
};

export const listPosts = (): Post[] => {
	return listPostsStmt.all() as Post[];
};
