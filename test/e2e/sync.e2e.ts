import { copyFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, inject, it } from 'vitest';
import { readSession, readSync } from '../../src/state.js';
import { QUOTES, writeDataset } from '../datasets.js';
import { decide, home, qotm, signIn, sql, startLogin } from './helpers.js';
import { CURRENT } from './stack.js';

describe('qotm sync against the test API', () => {
	it('installs the current release, then is up to date', () => {
		const h = home();
		const first = qotm(h, 'sync');
		expect(first.out).toMatch(new RegExp(`^synced ${CURRENT.replace(/\./g, '\\.')}: \\d+ quotes`));
		expect(readSync(join(h, 'data'))).toMatchObject({ version: CURRENT });
		expect(JSON.parse(qotm(h, 'status', '--json').out).dataset).toMatchObject({
			version: CURRENT,
			from: 'local',
			quotes: QUOTES.length
		});
		expect(qotm(h, 'sync').out).toBe(`already up to date (${CURRENT})\n`);
		expect(qotm(h, 'doctor', '--offline').code).toBe(0);
	});

	it('refuses a release whose bytes do not match the manifest, keeping the old dataset', () => {
		const h = home();
		qotm(h, 'sync');
		const before = readFileSync(join(h, 'data', 'qotm.sqlite'));
		// The releases host now serves different bytes under the same name.
		const served = join(inject('releases'), CURRENT, 'qotm.sqlite');
		const good = `${served}.good`;
		copyFileSync(served, good);
		try {
			writeDataset(`${served}.tmp`, QUOTES.slice(0, 2), { version: CURRENT });
			copyFileSync(`${served}.tmp`, served);
			const out = qotm(h, 'sync', '--force');
			expect(out.code).toBe(1);
			expect(out.out).toMatch(/does not match the manifest|stopped at|larger than the manifest/);
			expect(readFileSync(join(h, 'data', 'qotm.sqlite')).equals(before)).toBe(true);
		} finally {
			copyFileSync(good, served);
		}
	});

	it('when signed in, the terminal records the release it holds', async () => {
		const h = home();
		const cookie = await signIn();
		const login = startLogin(h);
		await decide(cookie, await login.code, 'approve');
		expect((await login.done).code).toBe(0);
		qotm(h, 'sync');
		// The manifest call after the sync reports the new version.
		qotm(h, 'sync');
		const { deviceId } = readSession(join(h, 'config'))!;
		await expect
			.poll(() => sql(`SELECT dataset_version FROM devices WHERE id = '${deviceId}'`), { timeout: 5000 })
			.toBe(CURRENT);
		expect(sql(`SELECT last_sync_at IS NOT NULL FROM devices WHERE id = '${deviceId}'`)).toBe('t');
	});
});
