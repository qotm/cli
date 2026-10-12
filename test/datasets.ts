import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const SCHEMA_V1 = readFileSync(new URL('./fixtures/schema-v1.sql', import.meta.url), 'utf8');

export type FixtureQuote = {
	id: string;
	text: string;
	type?: 'canonical' | 'original';
	author?: { slug: string; name: string } | null;
	work?: string | null;
	year?: number | null;
	contributor?: string | null;
	topics?: string[];
};

export const QUOTES: FixtureQuote[] = [
	{
		id: 'q_8f2k1c',
		text: 'Simplicity is prerequisite for reliability.',
		author: { slug: 'dijkstra', name: 'Edsger W. Dijkstra' },
		work: 'EWD 498',
		year: 1975,
		topics: ['simplicity']
	},
	{
		id: 'q_1t7c4e',
		text: 'Debugging is twice as hard as writing the code in the first place.',
		author: { slug: 'kernighan', name: 'Brian W. Kernighan' },
		topics: ['debugging']
	},
	{
		id: 'q_4r8y1p',
		text: 'A green build is a hypothesis, not a proof.',
		type: 'original',
		author: null,
		contributor: 'ada',
		topics: ['debugging']
	}
];

export const tempDir = (prefix = 'qotm-test-') => mkdtempSync(join(tmpdir(), prefix));

/** Writes a qotm.sqlite with these quotes, as the release build would. */
export function writeDataset(
	file: string,
	quotes: FixtureQuote[] = QUOTES,
	{ version = 'v2026.09.1', schemaVersion = 1 }: { version?: string; schemaVersion?: number } = {}
) {
	const db = new DatabaseSync(file);
	db.exec(SCHEMA_V1.replace('PRAGMA user_version = 1', `PRAGMA user_version = ${schemaVersion}`));
	const meta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
	meta.run('version', version);
	meta.run('schemaVersion', String(schemaVersion));
	meta.run('builtAt', '2026-09-26T18:02:00.000Z');
	const authors = new Map<string, number>();
	const topics = new Map<string, number>();
	for (const q of quotes) {
		if (q.author && !authors.has(q.author.slug)) {
			const r = db.prepare('INSERT INTO authors (slug, name) VALUES (?, ?)').run(q.author.slug, q.author.name);
			authors.set(q.author.slug, Number(r.lastInsertRowid));
		}
		for (const t of q.topics ?? [])
			if (!topics.has(t))
				topics.set(
					t,
					Number(
						db.prepare('INSERT INTO topics (slug, name) VALUES (?, ?)').run(t, t.replace(/-/g, ' ')).lastInsertRowid
					)
				);
	}
	const insert = db.prepare(
		'INSERT INTO quotes (id, text, type, author_id, author, author_slug, work, year, contributor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
	);
	for (const q of quotes) {
		insert.run(
			q.id,
			q.text,
			q.type ?? 'canonical',
			q.author ? authors.get(q.author.slug)! : null,
			q.author?.name ?? null,
			q.author?.slug ?? null,
			q.work ?? null,
			q.year ?? null,
			q.contributor ?? null
		);
		for (const t of q.topics ?? [])
			db.prepare('INSERT INTO quote_topics (quote_id, topic_id) VALUES (?, ?)').run(q.id, topics.get(t)!);
	}
	db.exec(`INSERT INTO quotes_fts (quotes_fts) VALUES ('rebuild')`);
	db.close();
	return file;
}
