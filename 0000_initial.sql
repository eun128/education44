CREATE TABLE sessions (id TEXT PRIMARY KEY, role TEXT, failures INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE posts (id TEXT PRIMARY KEY, author TEXT NOT NULL, subject TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, created INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE replies (id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id), author TEXT NOT NULL, role TEXT NOT NULL, body TEXT NOT NULL, created INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE threads (id TEXT PRIMARY KEY, student TEXT NOT NULL UNIQUE, solved INTEGER NOT NULL DEFAULT 0, student_read INTEGER NOT NULL DEFAULT 0, teacher_read INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE messages (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL REFERENCES threads(id), role TEXT NOT NULL, body TEXT NOT NULL, created INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX messages_thread ON messages(thread_id, created);
--> statement-breakpoint
CREATE INDEX replies_post ON replies(post_id, created);
