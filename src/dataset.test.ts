import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { QUOTES, tempDir, writeDataset } from '../test/datasets.js';
import { Dataset, DatasetError, SNAPSHOT, openDataset } from './dataset.js';

const setup = () => {
	const dir = tempDir();
	const data = join(dir, 'data');
	mkdirSync(data);
	const snapshot = writeDataset(join(dir, 'snapshot.sqlite'), QUOTES.slice(0, 1), { version: 'v2026.08.3' });
	return { data, snapshot, local: join(data, 'qotm.sqlite') };
};

describe('the dataset', () => {
	it('reads a v1 file: its meta, its quotes', () => {
		const { local } = setup();
		writeDataset(local);
		const ds = Dataset.open(local);
		expect(ds.meta).toEqual({ version: 'v2026.09.1', schemaVersion: 1, builtAt: '2026-09-26T18:02:00.000Z' });
		expect(ds.count()).toBe(3);
		expect(ds.candidates()).toEqual(QUOTES.map((q) => q.id));
		expect(ds.candidates({ topic: 'debugging' })).toEqual(['q_1t7c4e', 'q_4r8y1p']);
		expect(ds.candidates({ author: 'dijkstra' })).toEqual(['q_8f2k1c']);
		expect(ds.candidates({ ids: ['q_4r8y1p', 'q_nope00'] })).toEqual(['q_4r8y1p']);
		expect(ds.candidates({ ids: [] })).toEqual([]);
		expect(ds.quote('q_8f2k1c')).toMatchObject({ author: 'Edsger W. Dijkstra', authorSlug: 'dijkstra', year: 1975 });
		expect(ds.topicsOf('q_8f2k1c')).toEqual(['simplicity']);
		expect(ds.topics()).toEqual(['debugging', 'simplicity']);
		ds.close();
	});

	it('uses the synced file when it is usable', () => {
		const { data, local, snapshot } = setup();
		writeDataset(local);
		const opened = openDataset(data, snapshot);
		expect(opened.from).toBe('local');
		expect(opened.warning).toBeUndefined();
		opened.dataset.close();
	});

	it('falls back to the snapshot, quietly, when nothing has been synced', () => {
		const { data, snapshot } = setup();
		const opened = openDataset(data, snapshot);
		expect(opened).toMatchObject({ from: 'snapshot', warning: undefined });
		expect(opened.dataset.meta.version).toBe('v2026.08.3');
		opened.dataset.close();
	});

	it('falls back, with a word, when the synced file is corrupt', () => {
		const { data, local, snapshot } = setup();
		writeFileSync(local, 'not a database at all, just bytes '.repeat(200));
		const opened = openDataset(data, snapshot);
		expect(opened.from).toBe('snapshot');
		expect(opened.warning).toMatch(/the synced dataset is unreadable .* run qotm sync/);
		opened.dataset.close();
	});

	it('falls back when the synced file is a SQLite file but not a qotm dataset', () => {
		const { data, local, snapshot } = setup();
		writeDataset(local);
		const db = new DatabaseSync(local);
		db.exec('DROP TABLE quotes_fts');
		db.close();
		expect(() => Dataset.open(local)).toThrow(DatasetError);
		expect(openDataset(data, snapshot).warning).toMatch(/has no quotes_fts table/);
	});

	it('refuses a schema it does not know, and says to update', () => {
		const { data, local, snapshot } = setup();
		writeDataset(local, QUOTES, { schemaVersion: 2 });
		expect(() => Dataset.open(local)).toThrow(/dataset schema 2; this qotm reads schema 1/);
		const opened = openDataset(data, snapshot);
		expect(opened.from).toBe('snapshot');
		expect(opened.warning).toMatch(/update qotm \(npm i -g qotm\)/);
		opened.dataset.close();
	});

	it('says which Node search needs when its SQLite has no FTS5 (Node 22.13–22.15)', () => {
		const ds = Dataset.open(SNAPSHOT);
		const db = (ds as unknown as { db: DatabaseSync }).db;
		db.prepare = () => {
			throw new Error('no such module: fts5');
		};
		expect(() => ds.search('complexity')).toThrow(/qotm search needs Node.js 22.16\+ or 24\+/);
		ds.close();
	});

	it('ships a usable snapshot', () => {
		const ds = Dataset.open(SNAPSHOT);
		expect(ds.meta.schemaVersion).toBe(1);
		expect(ds.count()).toBeGreaterThan(0);
		ds.close();
	});
});
