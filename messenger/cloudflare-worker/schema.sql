PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, display_name TEXT NOT NULL,
 password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'offline' CHECK(status IN ('online','offline')),
 is_admin INTEGER NOT NULL DEFAULT 0 CHECK(is_admin IN (0,1)), created_at TEXT NOT NULL, last_seen TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS friendships (
 user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL, PRIMARY KEY(user_a,user_b), CHECK(user_a <> user_b)
);
CREATE TABLE IF NOT EXISTS chat_rooms (
 id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', is_group INTEGER NOT NULL DEFAULT 0 CHECK(is_group IN (0,1)),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_members (
 room_id TEXT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 joined_at TEXT NOT NULL, PRIMARY KEY(room_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members(user_id);
CREATE TABLE IF NOT EXISTS messages (
 id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE, sender_id TEXT NOT NULL REFERENCES users(id),
 content TEXT NOT NULL, message_type TEXT NOT NULL DEFAULT 'text', created_at TEXT NOT NULL, edited_at TEXT, deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_room_time ON messages(room_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE TABLE IF NOT EXISTS message_reads (
 message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 read_at TEXT NOT NULL, PRIMARY KEY(message_id,user_id)
);
CREATE TABLE IF NOT EXISTS file_attachments (
 id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE, message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
 uploader_id TEXT NOT NULL REFERENCES users(id), object_key TEXT NOT NULL UNIQUE, file_name TEXT NOT NULL, mime_type TEXT NOT NULL,
 size_bytes INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_files_room ON file_attachments(room_id,created_at DESC);
