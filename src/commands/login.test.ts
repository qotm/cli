import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { tempDir } from '../../test/datasets.js';
import { fakeApi } from '../../test/fake-api.js';
import { testIo } from '../../test/io.js';
import { main } from '../main.js';
import { readSession, sessionFile, writeSession } from '../state.js';
import { addFavorite } from '../store.js';
import { deviceLabel } from './login.js';

const CODE = {
	device_code: 'dev-123',
	user_code: 'QTM-7F3K',
	verification_uri: 'https://qotm.dev/device',
	verification_uri_complete: 'https://qotm.dev/device?user_code=QTM-7F3K',
	expires_in: 900,
	interval: 0
};

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
	await close?.();
	close = undefined;
});

/** A fake API whose token endpoint answers each poll from `polls`, in order. */
async function deviceApi(polls: { status: number; body: unknown }[]) {
	let i = 0;
	const api = await fakeApi({
		'POST /auth/device/code': () => ({ body: CODE }),
		'POST /auth/device/token': () => polls[Math.min(i++, polls.length - 1)],
		'GET /v1/me': () => ({ body: { handle: 'ada' } }),
		'POST /v1/me/devices': () => ({
			status: 201,
			body: { id: 'dev_1', label: 'x', authorizedAt: '2026-10-12T00:00:00Z' }
		}),
		'DELETE /v1/me/devices/current': () => ({ body: { ok: true } })
	});
	close = api.close;
	return api;
}

async function run(env: Record<string, string>, ...argv: string[]) {
	const t = testIo(env);
	const opened: string[] = [];
	t.io.openUrl = async (url) => void opened.push(url);
	const code = await main(argv, t.io);
	return { code, out: t.out(), err: t.err(), opened };
}

const pending = { status: 400, body: { error: 'authorization_pending' } };

describe('qotm login', () => {
	it('prints the code, opens /device, polls until approved, registers the terminal and keeps the token', async () => {
		const api = await deviceApi([
			pending,
			pending,
			{ status: 200, body: { access_token: 'tok-1', token_type: 'Bearer', expires_in: 3600 } }
		]);
		const home = tempDir();
		const r = await run({ QOTM_HOME: home, QOTM_API_URL: api.url, SHELL: '/bin/zsh' }, 'login');
		expect(r.code).toBe(0);
		expect(r.out).toContain('To sign in, open https://qotm.dev/device and enter:\n\n    QTM-7F3K\n');
		expect(r.out).toContain('signed in as @ada.');
		expect(r.opened).toEqual([CODE.verification_uri_complete]);

		const calls = api.seen.map((s) => `${s.method} ${s.path}`);
		expect(calls.filter((c) => c === 'POST /auth/device/token')).toHaveLength(3);
		expect(api.seen[0]!.body).toEqual({ client_id: 'qotm-cli' });
		expect(api.seen[1]!.body).toEqual({
			grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
			device_code: 'dev-123',
			client_id: 'qotm-cli'
		});
		const register = api.seen.find((s) => s.path === '/v1/me/devices')!;
		expect(register.headers.authorization).toBe('Bearer tok-1');
		expect((register.body as { label: string }).label).toMatch(/ · zsh$/);
		expect(register.headers['user-agent']).toMatch(/^qotm\//);

		const session = readSession(join(home, 'config'))!;
		expect(session).toMatchObject({ token: 'tok-1', handle: 'ada', deviceId: 'dev_1', api: api.url });
		if (process.platform !== 'win32') expect(statSync(sessionFile(join(home, 'config'))).mode & 0o777).toBe(0o600);
	});

	it('--no-browser only prints the address', async () => {
		const api = await deviceApi([{ status: 200, body: { access_token: 'tok-1' } }]);
		const r = await run({ QOTM_HOME: tempDir(), QOTM_API_URL: api.url }, 'login', '--no-browser');
		expect(r.opened).toEqual([]);
		expect(r.code).toBe(0);
	});

	it('says so when the member denies, and keeps no session', async () => {
		const api = await deviceApi([pending, { status: 400, body: { error: 'access_denied' } }]);
		const home = tempDir();
		const r = await run({ QOTM_HOME: home, QOTM_API_URL: api.url }, 'login');
		expect(r.code).toBe(1);
		expect(r.err).toBe('qotm: Sign-in was denied in the browser. Nothing changed here.\n');
		expect(readSession(join(home, 'config'))).toBeNull();
	});

	it('says so when the code expires', async () => {
		const api = await deviceApi([{ status: 400, body: { error: 'expired_token' } }]);
		const r = await run({ QOTM_HOME: tempDir(), QOTM_API_URL: api.url }, 'login');
		expect(r.code).toBe(1);
		expect(r.err).toContain('The code expired before it was approved (codes last 15 minutes). Run qotm login again.');
	});

	it('refuses to sign in twice unless forced', async () => {
		const api = await deviceApi([{ status: 200, body: { access_token: 'tok-2' } }]);
		const home = tempDir();
		writeSession(join(home, 'config'), { token: 'old', handle: 'ada', deviceId: null, api: api.url, signedInAt: '' });
		const r = await run({ QOTM_HOME: home, QOTM_API_URL: api.url }, 'login');
		expect(r.err).toContain('Already signed in as @ada. qotm logout first, or qotm login --force.');
		expect((await run({ QOTM_HOME: home, QOTM_API_URL: api.url }, 'login', '--force')).code).toBe(0);
		expect(readSession(join(home, 'config'))!.token).toBe('tok-2');
	});

	it('names an API it cannot reach', async () => {
		const r = await run({ QOTM_HOME: tempDir(), QOTM_API_URL: 'http://127.0.0.1:1' }, 'login');
		expect(r.code).toBe(1);
		expect(r.err).toMatch(/^qotm: http:\/\/127\.0\.0\.1:1: /);
	});
});

describe('qotm logout', () => {
	it('revokes this terminal and keeps local quotes, favorites and the dataset', async () => {
		const api = await deviceApi([]);
		const home = tempDir();
		const config = join(home, 'config');
		const data = join(home, 'data');
		mkdirSync(data, { recursive: true });
		addFavorite(data, 'q_8f2k1c');
		writeSession(config, { token: 'tok-1', handle: 'ada', deviceId: 'dev_1', api: api.url, signedInAt: '' });
		const r = await run({ QOTM_HOME: home, QOTM_API_URL: api.url }, 'logout');
		expect(r.out).toContain('signed out.');
		expect(r.out).toContain('Your local quotes, favorites and dataset stay.');
		const revoke = api.seen.find((s) => s.method === 'DELETE')!;
		expect(revoke.path).toBe('/v1/me/devices/current');
		expect(revoke.headers.authorization).toBe('Bearer tok-1');
		expect(readSession(config)).toBeNull();
		expect(readFileSync(join(data, 'favorites.json'), 'utf8')).toContain('q_8f2k1c');
	});

	it('signs out locally when the API cannot be reached, saying where to revoke', async () => {
		const home = tempDir();
		writeSession(join(home, 'config'), { token: 't', handle: 'ada', deviceId: null, api: 'x', signedInAt: '' });
		const r = await run({ QOTM_HOME: home, QOTM_API_URL: 'http://127.0.0.1:1' }, 'logout');
		expect(r.code).toBe(0);
		expect(r.out).toContain('revoke it from Settings › Terminals');
		expect(readSession(join(home, 'config'))).toBeNull();
	});

	it('is calm when not signed in', async () => {
		expect((await run({ QOTM_HOME: tempDir() }, 'logout')).out).toBe('not signed in\n');
	});
});

describe('the terminal label', () => {
	it('is the host and the shell', () => {
		expect(deviceLabel({ SHELL: '/usr/bin/fish' }, 'wc-laptop.local')).toBe('wc-laptop · fish');
		expect(deviceLabel({ ComSpec: 'C:\\Windows\\system32\\cmd.exe' }, 'DESKTOP-1')).toBe('DESKTOP-1 · cmd');
		expect(deviceLabel({}, '')).toBe('this computer · terminal');
	});
});
