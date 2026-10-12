import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tempDir } from '../test/datasets.js';
import {
	addFavorite,
	addPersonal,
	favoritesFile,
	readFavorites,
	readHistory,
	readPersonal,
	remember,
	removeFavorite,
	HISTORY_SIZE
} from './store.js';

describe('the local store', () => {
	it('saves a favorite once: the second save changes nothing', () => {
		const data = tempDir();
		expect(addFavorite(data, 'q_8f2k1c')).toBe(true);
		const before = readFileSync(favoritesFile(data), 'utf8');
		expect(addFavorite(data, 'q_8f2k1c')).toBe(false);
		expect(readFileSync(favoritesFile(data), 'utf8')).toBe(before);
		expect(readFavorites(data).favorites.map((f) => f.id)).toEqual(['q_8f2k1c']);
	});

	it('keeps favorites newest first, with the changes since the last sync', () => {
		const data = tempDir();
		addFavorite(data, 'q_aaa111');
		addFavorite(data, 'q_bbb222');
		removeFavorite(data, 'q_aaa111');
		expect(readFavorites(data)).toMatchObject({
			favorites: [{ id: 'q_bbb222' }],
			pending: { add: ['q_bbb222'], remove: ['q_aaa111'] }
		});
		// Saving it again cancels the pending remove.
		addFavorite(data, 'q_aaa111');
		expect(readFavorites(data).pending).toEqual({ add: ['q_bbb222', 'q_aaa111'], remove: [] });
		expect(removeFavorite(data, 'q_nope00')).toBe(false);
	});

	it('keeps private quotes with their own ids', () => {
		const data = tempDir();
		const a = addPersonal(data, { text: 'Name things twice.', author: 'Ada' });
		const b = addPersonal(data, { text: 'Ship small.' });
		expect(a.id).toMatch(/^p_[a-z0-9]{8}$/);
		expect(a.id).not.toBe(b.id);
		expect(readPersonal(data).quotes.map((q) => q.text)).toEqual(['Name things twice.', 'Ship small.']);
	});

	it('remembers the last 50 shown, newest first, without duplicates', () => {
		const data = tempDir();
		for (let i = 0; i < HISTORY_SIZE + 5; i++) remember(data, `q_${i}`);
		remember(data, 'q_10');
		const { shown } = readHistory(data);
		expect(shown).toHaveLength(HISTORY_SIZE);
		expect(shown[0]!.id).toBe('q_10');
		expect(shown.filter((s) => s.id === 'q_10')).toHaveLength(1);
	});

	it('reads an unreadable file as empty rather than failing', () => {
		const data = tempDir();
		writeFileSync(favoritesFile(data), '{ half a file');
		expect(readFavorites(data)).toEqual({ favorites: [], pending: { add: [], remove: [] }, localOnly: [] });
		expect(addFavorite(data, 'q_8f2k1c')).toBe(true);
	});
});
