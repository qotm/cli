-- qotm.sqlite schema version 1: a copy of backend/apps/worker/src/dataset/schema.ts
-- (the source of truth), for building test datasets. test/schema.test.ts keeps them equal.
PRAGMA user_version = 1;

-- version ("v2026.09.1"), schemaVersion ("1") and builtAt (ISO 8601). The
-- publish date is the manifest's: the file is frozen at preview, before it is
-- published, so its sha256 never changes.
CREATE TABLE meta (
	key   TEXT PRIMARY KEY,
	value TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE authors (
	id          INTEGER PRIMARY KEY,
	slug        TEXT NOT NULL UNIQUE,      -- qotm --author dijkstra
	name        TEXT NOT NULL,             -- Edsger W. Dijkstra
	born_year   INTEGER,
	died_year   INTEGER,
	description TEXT                       -- computer scientist
);

CREATE TABLE topics (
	id   INTEGER PRIMARY KEY,
	slug TEXT NOT NULL UNIQUE,             -- qotm --topic software-design
	name TEXT NOT NULL                     -- software design
);

CREATE TABLE quotes (
	n           INTEGER PRIMARY KEY,       -- local row number (the FTS rowid)
	id          TEXT NOT NULL UNIQUE,      -- q_8f2k1c: stable across releases
	text        TEXT NOT NULL,
	type        TEXT NOT NULL CHECK (type IN ('canonical', 'original')),
	author_id   INTEGER REFERENCES authors (id),
	author      TEXT,                      -- the author's name; null for originals
	author_slug TEXT,
	work        TEXT,                      -- EWD 498
	year        INTEGER,
	source      TEXT,                      -- the source's title
	source_url  TEXT,
	contributor TEXT                       -- handle; null: a former member
);
CREATE INDEX quotes_author_id_idx ON quotes (author_id);

CREATE TABLE quote_topics (
	quote_id TEXT NOT NULL REFERENCES quotes (id),
	topic_id INTEGER NOT NULL REFERENCES topics (id),
	PRIMARY KEY (quote_id, topic_id)
) WITHOUT ROWID;
CREATE INDEX quote_topics_topic_id_idx ON quote_topics (topic_id);

-- qotm search: SELECT q.* FROM quotes_fts f JOIN quotes q ON q.n = f.rowid
--   WHERE quotes_fts MATCH 'complexity' ORDER BY rank;
CREATE VIRTUAL TABLE quotes_fts USING fts5 (
	text, author, work,
	content = 'quotes', content_rowid = 'n',
	tokenize = 'porter unicode61 remove_diacritics 2'
);
