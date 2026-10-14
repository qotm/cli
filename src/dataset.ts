import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { CliError } from './io.js';

/** The dataset schema this qotm reads (backend/apps/worker/src/dataset/schema.ts). */
export const SCHEMA_VERSION = 1;
const TABLES = ['authors', 'meta', 'quote_topics', 'quotes', 'quotes_fts', 'topics'];

/** The dataset that ships inside the package, used until the first `qotm sync`. */
export const SNAPSHOT = fileURLToPath(new URL('../data/qotm.sqlite', import.meta.url));
/** Its manifest: version, size and sha256 (scripts/snapshot.mjs writes both). */
export const SNAPSHOT_MANIFEST = fileURLToPath(new URL('../data/snapshot.json', import.meta.url));

export type DatasetMeta = { version: string; schemaVersion: number; builtAt: string | null };

export type Quote = {
	n: number;
	id: string;
	text: string;
	type: 'canonical' | 'original';
	author: string | null;
	authorSlug: string | null;
	work: string | null;
	year: number | null;
	source: string | null;
	sourceUrl: string | null;
	contributor: string | null;
};

type Row = Record<string, string | number | null>;
const toQuote = (r: Row): Quote => ({
	n: Number(r.n),
	id: String(r.id),
	text: String(r.text),
	type: r.type as Quote['type'],
	author: (r.author as string | null) ?? null,
	authorSlug: (r.author_slug as string | null) ?? null,
	work: (r.work as string | null) ?? null,
	year: r.year == null ? null : Number(r.year),
	source: (r.source as string | null) ?? null,
	sourceUrl: (r.source_url as string | null) ?? null,
	contributor: (r.contributor as string | null) ?? null
});

/** Why a dataset file cannot be used. */
export class DatasetError extends Error {
	constructor(
		message: string,
		readonly reason: 'missing' | 'corrupt' | 'schema'
	) {
		super(message);
	}
}

/** One opened `qotm.sqlite`, read-only. */
export class Dataset {
	private constructor(
		private db: DatabaseSync,
		readonly file: string,
		readonly meta: DatasetMeta
	) {}

	/** Opens and checks a file: a known schema version and every table it should have. */
	static open(file: string): Dataset {
		if (!existsSync(file)) throw new DatasetError(`${file} does not exist`, 'missing');
		let db: DatabaseSync;
		try {
			db = new DatabaseSync(file, { readOnly: true });
		} catch (err) {
			throw new DatasetError(`${file} cannot be opened: ${(err as Error).message}`, 'corrupt');
		}
		try {
			const userVersion = Number((db.prepare('PRAGMA user_version').get() as Row).user_version);
			const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Row[]).map((r) =>
				String(r.name)
			);
			const meta = Object.fromEntries(
				(db.prepare('SELECT key, value FROM meta').all() as Row[]).map((r) => [String(r.key), String(r.value)])
			);
			const schemaVersion = Number(meta.schemaVersion ?? userVersion);
			if (schemaVersion !== SCHEMA_VERSION || userVersion !== SCHEMA_VERSION)
				throw new DatasetError(
					`${file} is dataset schema ${schemaVersion}; this qotm reads schema ${SCHEMA_VERSION}`,
					'schema'
				);
			const missing = TABLES.filter((t) => !tables.includes(t));
			if (missing.length) throw new DatasetError(`${file} has no ${missing.join(', ')} table`, 'corrupt');
			db.prepare('SELECT count(*) FROM quotes').get();
			return new Dataset(db, file, {
				version: meta.version ?? 'unknown',
				schemaVersion,
				builtAt: meta.builtAt ?? null
			});
		} catch (err) {
			db.close();
			if (err instanceof DatasetError) throw err;
			throw new DatasetError(`${file} is not a qotm dataset: ${(err as Error).message}`, 'corrupt');
		}
	}

	count(): number {
		return Number((this.db.prepare('SELECT count(*) AS n FROM quotes').get() as Row).n);
	}

	/** The ids `qotm` may draw from: every quote, or those under a topic, by an author, or in a set. */
	candidates(filter: { topic?: string; author?: string; ids?: string[] } = {}): string[] {
		const where: string[] = [];
		const params: (string | number)[] = [];
		if (filter.topic) {
			where.push(
				'id IN (SELECT qt.quote_id FROM quote_topics qt JOIN topics t ON t.id = qt.topic_id WHERE t.slug = ?)'
			);
			params.push(filter.topic);
		}
		if (filter.author) {
			where.push('author_slug = ?');
			params.push(filter.author);
		}
		if (filter.ids) {
			if (!filter.ids.length) return [];
			where.push(`id IN (${filter.ids.map(() => '?').join(', ')})`);
			params.push(...filter.ids);
		}
		const sql = `SELECT id FROM quotes${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY n`;
		return (this.db.prepare(sql).all(...params) as Row[]).map((r) => String(r.id));
	}

	quote(id: string): Quote | null {
		const row = this.db.prepare('SELECT * FROM quotes WHERE id = ?').get(id) as Row | undefined;
		return row ? toQuote(row) : null;
	}

	/** A quote's topic slugs. */
	topicsOf(id: string): string[] {
		return (
			this.db
				.prepare(
					'SELECT t.slug FROM quote_topics qt JOIN topics t ON t.id = qt.topic_id WHERE qt.quote_id = ? ORDER BY t.slug'
				)
				.all(id) as Row[]
		).map((r) => String(r.slug));
	}

	topics(): string[] {
		return (this.db.prepare('SELECT slug FROM topics ORDER BY slug').all() as Row[]).map((r) => String(r.slug));
	}

	authors(): string[] {
		return (this.db.prepare('SELECT slug FROM authors ORDER BY slug').all() as Row[]).map((r) => String(r.slug));
	}

	/**
	 * Full-text search (FTS5 over text, author and work), best match first.
	 * Each word is matched as typed or as a prefix, all words required.
	 */
	search(text: string, limit = 10): Quote[] {
		const words = text.match(/[\p{L}\p{N}]+/gu) ?? [];
		if (!words.length) return [];
		const match = words.map((w) => `"${w.replace(/"/g, '')}"*`).join(' ');
		try {
			return (
				this.db
					.prepare(
						'SELECT q.* FROM quotes_fts f JOIN quotes q ON q.n = f.rowid WHERE quotes_fts MATCH ? ORDER BY rank LIMIT ?'
					)
					.all(match, limit) as Row[]
			).map(toQuote);
		} catch (error) {
			// Node's SQLite gained FTS5 in 22.16 (and 24): older ones install with a warning.
			if (error instanceof Error && /no such module: fts5/.test(error.message)) {
				throw new CliError(
					`qotm search needs Node.js 22.16+ or 24+ (this is ${process.version}). Everything else works; update Node to search, or use qotm search --web.`
				);
			}
			throw error;
		}
	}

	close(): void {
		this.db.close();
	}
}

export type Opened = {
	dataset: Dataset;
	/** Where it came from: the synced file, or the bundled snapshot. */
	from: 'local' | 'snapshot';
	/** Why the local file was passed over (missing ones are not worth a word). */
	warning?: string;
};

/**
 * The dataset to read: the synced file in the data folder if it is usable,
 * else the bundled snapshot. A missing, corrupt or unknown-schema local file
 * never stops `qotm` from showing a quote.
 */
export function openDataset(dataDir: string, snapshot: string = SNAPSHOT): Opened {
	const local = join(dataDir, 'qotm.sqlite');
	let warning: string | undefined;
	try {
		return { dataset: Dataset.open(local), from: 'local' };
	} catch (err) {
		if (!(err instanceof DatasetError)) throw err;
		if (err.reason === 'schema')
			warning = `${err.message}. Using the bundled quotes; update qotm (npm i -g qotm) to read it.`;
		else if (err.reason === 'corrupt')
			warning = `the synced dataset is unreadable (${err.message}). Using the bundled quotes; run qotm sync to fetch it again.`;
	}
	return { dataset: Dataset.open(snapshot), from: 'snapshot', warning };
}
