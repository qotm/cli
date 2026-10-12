import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readFavorites } from '../../src/store.js';
import { CLI, decide, env, home, MEMBER, signIn, sql, startLogin } from './helpers.js';
import { API, WEB } from './stack.js';

const accountFavorites = async (cookie: string) =>
	(
		(await (await fetch(`${API}/v1/me/favorites/sync`, { headers: { cookie, origin: WEB } })).json()) as {
			favorites: { id: string }[];
		}
	).favorites.map((f) => f.id);

/** qotm with the API somewhere it cannot be reached: offline, but still signed in. */
const offline = (h: string, ...args: string[]) =>
	execFileSync(process.execPath, [CLI, ...args], {
		encoding: 'utf8',
		env: { ...env(h), QOTM_API_URL: 'http://127.0.0.1:1' }
	});

describe('favorites with the account, against the test API', () => {
	it('an offline save queues, syncs later, and the account’s favorites come back', async () => {
		const memberId = sql(`SELECT id FROM "user" WHERE email = '${MEMBER.email}'`);
		sql(`DELETE FROM favorites WHERE user_id = '${memberId}'`);
		const cookie = await signIn();
		const h = home();
		const login = startLogin(h);
		await decide(cookie, await login.code, 'approve');
		expect((await login.done).code).toBe(0);

		// Offline: saved here, queued for the account.
		expect(offline(h, 'save', 'q_8f2k1c')).toMatch(/^saved to favorites \(it syncs with your account later/);
		expect(await accountFavorites(cookie)).toEqual([]);
		expect(readFavorites(join(h, 'data')).pending.add).toEqual(['q_8f2k1c']);

		// Meanwhile a favorite is added on the web.
		const quoteId = sql(`SELECT id FROM quotes WHERE public_id = 'q_1t7c4e'`);
		sql(`INSERT INTO favorites (user_id, quote_id) VALUES ('${memberId}', '${quoteId}')`);

		// Back online: qotm sync replays the queue and brings the account's set.
		const out = execFileSync(process.execPath, [CLI, 'sync'], { encoding: 'utf8', env: env(h) });
		expect(out).toContain('favorites: 2, synced with @test_user');
		expect((await accountFavorites(cookie)).sort()).toEqual(['q_1t7c4e', 'q_8f2k1c']);
		const local = readFavorites(join(h, 'data'));
		expect(local.favorites.map((f) => f.id).sort()).toEqual(['q_1t7c4e', 'q_8f2k1c']);
		expect(local.pending).toEqual({ add: [], remove: [] });

		// Online, an unsave reaches the account straight away.
		execFileSync(process.execPath, [CLI, 'unsave', 'q_8f2k1c'], { encoding: 'utf8', env: env(h) });
		expect(await accountFavorites(cookie)).toEqual(['q_1t7c4e']);
	}, 60_000);
});
