import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { tempDir } from '../test/datasets.js';
import { fakeApi, type Seen } from '../test/fake-api.js';
import { testIo } from '../test/io.js';
import { syncFavorites } from './favorites-sync.js';
import { main } from './main.js';
import { writeSession } from './state.js';
import { addFavorite, readFavorites, removeFavorite } from './store.js';

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
	await close?.();
	close = undefined;
});

/**
 * A fake account: applies the replayed adds and removes to its own set as
 * the API does (idempotent; unknown ids skipped), and answers with the
 * merged set.
 */
async function account(initial: string[] = [], publicIds = ['q_8f2k1c', 'q_1t7c4e', 'q_4r8y1p', 'q_acct01']) {
	const set = new Map(initial.map((id, i) => [id, `2026-10-0${i + 1}T00:00:00.000Z`]));
	const api = await fakeApi({
		'PUT /v1/me/favorites/sync': (req: Seen) => {
			const { add, remove } = req.body as { add: string[]; remove: string[] };
			const skipped: string[] = [];
			for (const id of add)
				if (!publicIds.includes(id)) skipped.push(id);
				else if (!set.has(id)) set.set(id, '2026-10-12T10:00:00.000Z');
			for (const id of remove) set.delete(id);
			return { body: { favorites: [...set].map(([id, addedAt]) => ({ id, addedAt })), skipped } };
		}
	});
	close = api.close;
	return { api, set };
}

function signedIn(url: string) {
	const home = tempDir();
	writeSession(join(home, 'config'), { token: 'tok', handle: 'ada', deviceId: 'd', api: url, signedInAt: '' });
	return { home, data: join(home, 'data'), env: { QOTM_HOME: home, QOTM_API_URL: url } };
}

describe('favorites sync', () => {
	it('stays local when signed out', async () => {
		const home = tempDir();
		addFavorite(join(home, 'data'), 'q_8f2k1c');
		expect(await syncFavorites(testIo({ QOTM_HOME: home }).io)).toEqual({ status: 'signed-out' });
		expect(readFavorites(join(home, 'data')).pending.add).toEqual(['q_8f2k1c']);
	});

	it('replays the queue and takes the account’s merged set', async () => {
		const { api, set } = await account(['q_acct01']);
		const h = signedIn(api.url);
		addFavorite(h.data, 'q_8f2k1c');
		addFavorite(h.data, 'q_1t7c4e');
		removeFavorite(h.data, 'q_1t7c4e');
		const r = await syncFavorites(testIo(h.env).io);
		expect(r).toMatchObject({ status: 'synced', handle: 'ada', count: 2, skipped: [] });
		const sent = api.seen[0]!;
		expect(sent.headers.authorization).toBe('Bearer tok');
		expect(sent.body).toEqual({ add: ['q_8f2k1c'], remove: ['q_1t7c4e'] });
		expect([...set.keys()].sort()).toEqual(['q_8f2k1c', 'q_acct01']);
		const after = readFavorites(h.data);
		expect(after.favorites.map((f) => f.id).sort()).toEqual(['q_8f2k1c', 'q_acct01']);
		expect(after.pending).toEqual({ add: [], remove: [] });
	});

	it('an offline save queues, and syncs later', async () => {
		const { api, set } = await account();
		const h = signedIn('http://127.0.0.1:1');
		// Offline: the save works, and says it will sync later.
		const t = testIo(h.env);
		await main(['save', 'q_8f2k1c'], t.io);
		expect(t.out()).toMatch(/^saved to favorites \(it syncs with your account later: .*could not be reached\)\n$/);
		expect(readFavorites(h.data).pending.add).toEqual(['q_8f2k1c']);
		// Back online: the queue goes up.
		const r = await syncFavorites(testIo({ ...h.env, QOTM_API_URL: api.url }).io);
		expect(r.status).toBe('synced');
		expect(set.has('q_8f2k1c')).toBe(true);
		expect(readFavorites(h.data).pending.add).toEqual([]);
	});

	it('saving while signed in and online syncs straight away', async () => {
		const { api, set } = await account();
		const h = signedIn('');
		const t = testIo({ ...h.env, QOTM_API_URL: api.url });
		await main(['save', 'q_4r8y1p'], t.io);
		expect(t.out()).toBe('saved to favorites\n');
		expect(set.has('q_4r8y1p')).toBe(true);
		await main(['unsave', 'q_4r8y1p'], testIo({ ...h.env, QOTM_API_URL: api.url }).io);
		expect(set.has('q_4r8y1p')).toBe(false);
	});

	it('keeps a skipped id (not public on qotm.dev) on this machine only', async () => {
		const { api } = await account();
		const h = signedIn(api.url);
		addFavorite(h.data, 'q_zz9zz9');
		const r = await syncFavorites(testIo(h.env).io);
		expect(r).toMatchObject({ status: 'synced', skipped: ['q_zz9zz9'] });
		const f = readFavorites(h.data);
		expect(f.favorites.map((x) => x.id)).toEqual(['q_zz9zz9']);
		expect(f.localOnly).toEqual(['q_zz9zz9']);
		// It survives the next sync too.
		await syncFavorites(testIo(h.env).io);
		expect(readFavorites(h.data).favorites.map((x) => x.id)).toEqual(['q_zz9zz9']);
	});

	it('keeps the queue when the session has ended', async () => {
		const api = await fakeApi({
			'PUT /v1/me/favorites/sync': () => ({ status: 401, body: { statusCode: 401, message: 'Unauthorized' } })
		});
		close = api.close;
		const h = signedIn(api.url);
		addFavorite(h.data, 'q_8f2k1c');
		expect(await syncFavorites(testIo(h.env).io)).toEqual({
			status: 'queued',
			reason: 'your session ended; run qotm login',
			pending: 1
		});
		expect(readFavorites(h.data).pending.add).toEqual(['q_8f2k1c']);
	});
});
