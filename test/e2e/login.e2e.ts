import { describe, expect, it } from 'vitest';
import { readSession } from '../../src/state.js';
import { decide, home, MEMBER, qotm, signIn, sql, startLogin } from './helpers.js';
import { API, WEB } from './stack.js';
import { join } from 'node:path';

describe('qotm login / logout against the test API', () => {
	it('signs in through the device flow, lists the terminal, and logs out revoking it', async () => {
		const h = home();
		const cookie = await signIn();
		const login = startLogin(h);
		const userCode = await login.code;
		expect(userCode).toMatch(/^QTM-[A-Z0-9]{4}$/);
		await decide(cookie, userCode, 'approve');
		const done = await login.done;
		expect(done.out).toContain(`signed in as @${MEMBER.handle}.`);
		expect(done.code).toBe(0);

		const session = readSession(join(h, 'config'))!;
		expect(session.handle).toBe(MEMBER.handle);
		// Settings › Terminals lists it, with the dataset it holds.
		const devices = (await (await fetch(`${API}/v1/me/devices`, { headers: { cookie, origin: WEB } })).json()) as {
			list: { id: string; label: string; revokedAt: string | null; datasetVersion: string | null }[];
		};
		const mine = devices.list.find((d) => d.id === session.deviceId)!;
		expect(mine).toBeTruthy();
		expect(mine.revokedAt).toBeNull();
		expect(qotm(h, 'status').out).toContain(`account        @${MEMBER.handle}`);

		const out = qotm(h, 'logout');
		expect(out.out).toContain('signed out.');
		expect(sql(`SELECT revoked_at IS NOT NULL FROM devices WHERE id = '${session.deviceId}'`)).toBe('t');
		// The token no longer works.
		expect((await fetch(`${API}/v1/me`, { headers: { authorization: `Bearer ${session.token}` } })).status).toBe(401);
		expect(readSession(join(h, 'config'))).toBeNull();
		// And qotm still shows quotes.
		expect(qotm(h).code).toBe(0);
	}, 60_000);

	it('says so when the member denies the code', async () => {
		const h = home();
		const cookie = await signIn();
		const login = startLogin(h);
		await decide(cookie, await login.code, 'deny');
		const done = await login.done;
		expect(done.code).toBe(1);
		expect(done.out).toContain('Sign-in was denied in the browser.');
		expect(readSession(join(h, 'config'))).toBeNull();
	}, 60_000);

	it('says so when the code expires', async () => {
		const h = home();
		const login = startLogin(h);
		const userCode = await login.code;
		sql(`UPDATE device_code SET expires_at = now() - interval '1 minute' WHERE user_code = '${userCode}'`);
		const done = await login.done;
		expect(done.code).toBe(1);
		expect(done.out).toContain('The code expired before it was approved');
	}, 60_000);
});
