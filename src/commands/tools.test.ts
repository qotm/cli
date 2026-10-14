import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tempDir, writeDataset } from '../../test/datasets.js';
import { testIo } from '../../test/io.js';
import { main } from '../main.js';
import { syncFile } from '../state.js';
import { writeJson } from '../store.js';
import { nodeOk } from './tools.js';

function home() {
	const dir = tempDir();
	mkdirSync(join(dir, 'data'), { recursive: true });
	writeDataset(join(dir, 'data', 'qotm.sqlite'));
	return { dir, data: join(dir, 'data'), env: { QOTM_HOME: dir } as Record<string, string> };
}

async function run(env: Record<string, string>, ...argv: string[]) {
	const t = testIo(env);
	const opened: string[] = [];
	t.io.openUrl = async (url) => void opened.push(url);
	const code = await main(argv, t.io);
	return { code, out: t.out(), err: t.err(), opened };
}

let health: string;
const server = createServer((req, res) => {
	res.writeHead(req.url === '/health' ? 200 : 404, { 'content-type': 'application/json' });
	res.end('{"status":"ok"}');
});
beforeAll(async () => {
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	health = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('every command', () => {
	it('has help text', async () => {
		for (const name of ['open', 'search', 'status', 'config', 'doctor', 'save', 'favorites', 'add', 'last']) {
			const r = await run({}, 'help', name);
			expect(r.code).toBe(0);
			expect(r.out).toMatch(new RegExp(`^Usage: qotm ${name}`));
		}
	});
});

describe('open', () => {
	it('opens the last quote on qotm.dev, as the landing page says', async () => {
		const h = home();
		expect((await run(h.env, 'open')).err).toContain('Nothing shown yet.');
		const shown = JSON.parse((await run(h.env, '--json')).out);
		const r = await run(h.env, 'open');
		expect(r.out).toBe(`opening ${shown.id.replace('q_', 'q/')} in your browser\n`);
		expect(r.opened).toEqual([`https://qotm.dev/q/${shown.id.slice(2)}`]);
		expect((await run({ ...h.env, QOTM_SITE_URL: 'https://qotm.site' }, 'open', '8f2k1c')).opened).toEqual([
			'https://qotm.site/q/8f2k1c'
		]);
	});
});

describe('search', () => {
	it('finds quotes by words and prefixes, offline', async () => {
		const h = home();
		const r = await run(h.env, 'search', 'debug');
		expect(r.out).toBe(
			'q_1t7c4e  Debugging is twice as hard as writing the code in the first place. — Brian W. Kernighan\n'
		);
		expect(JSON.parse((await run(h.env, 'search', 'dijkstra', '--json')).out)).toEqual([
			{
				id: 'q_8f2k1c',
				text: 'Simplicity is prerequisite for reliability.',
				author: 'Edsger W. Dijkstra',
				authorSlug: 'dijkstra',
				work: 'EWD 498',
				year: 1975,
				url: 'https://qotm.dev/q/8f2k1c'
			}
		]);
		expect(JSON.parse((await run(h.env, 'search', 'a', '--limit', '1', '--json')).out)).toHaveLength(1);
		expect((await run(h.env, 'search', 'nothing-like-this')).out).toContain('Nothing in your dataset matches');
		expect((await run(h.env, 'search')).code).toBe(2);
	});

	it('--web opens the site search', async () => {
		const r = await run(home().env, 'search', 'naming things', '--web');
		expect(r.opened).toEqual(['https://qotm.dev/search?q=naming%20things']);
	});
});

describe('status', () => {
	it('reports the dataset, sync, account and counts', async () => {
		const h = home();
		await run(h.env, 'save', 'q_8f2k1c');
		writeJson(syncFile(h.data), { version: 'v2026.09.1', syncedAt: '2026-10-12T09:00:00.000Z' });
		writeJson(join(h.dir, 'config', 'session.json'), { token: 't', handle: 'ada', api: 'https://api.qotm.dev' });
		const json = JSON.parse((await run(h.env, 'status', '--json')).out);
		expect(json).toMatchObject({
			dataset: { version: 'v2026.09.1', schemaVersion: 1, from: 'local', quotes: 3 },
			lastSync: '2026-10-12T09:00:00.000Z',
			account: { handle: 'ada' },
			favorites: 1,
			pendingFavoriteChanges: 1,
			privateQuotes: 0
		});
		const text = (await run(h.env, 'status')).out;
		expect(text).toContain('account        @ada');
		expect(text).toContain('favorites      1 (1 to sync)');
	});
});

describe('config', () => {
	it('lists, gets, sets and unsets, and validates', async () => {
		const { env } = home();
		expect((await run(env, 'config')).out).toContain('api      https://api.qotm.dev  (default)');
		expect((await run(env, 'config', 'set', 'api', 'https://api.qotm.site/')).out).toBe(
			'api = https://api.qotm.site\n'
		);
		expect((await run(env, 'config', 'get', 'api')).out).toBe('https://api.qotm.site\n');
		expect((await run({ ...env, QOTM_API_URL: 'http://localhost:5160' }, 'config', 'get', 'api')).out).toBe(
			'http://localhost:5160\n'
		);
		expect((await run(env, 'config', 'set', 'color', 'sometimes')).code).toBe(2);
		expect((await run(env, 'config', 'set', 'api', 'not a url')).code).toBe(2);
		expect((await run(env, 'config', 'get', 'nope')).err).toContain(
			'Unknown setting "nope". Settings: api, site, color, style, history.'
		);
		expect((await run(env, 'config', 'unset', 'api')).out).toBe('api = https://api.qotm.dev (default)\n');
		expect(JSON.parse((await run(env, 'config', '--json')).out)).toEqual({
			api: 'https://api.qotm.dev',
			site: 'https://qotm.dev',
			color: 'auto',
			style: 'pull',
			history: '50'
		});
	});

	it('the settings apply: colour and history', async () => {
		const { env } = home();
		await run(env, 'config', 'set', 'color', 'always');
		expect((await run(env)).out).toContain('\x1b[1m');
		await run(env, 'config', 'set', 'history', '0');
		// With no history rule, the same quote may come again; qotm last still works.
		await run(env);
		expect((await run(env, 'last')).code).toBe(0);
	});
});

describe('doctor', () => {
	it('passes a healthy install', async () => {
		const h = home();
		writeJson(syncFile(h.data), { version: 'v2026.09.1', sha256: 'x', syncedAt: '2026-10-12T09:00:00Z' });
		// Matching sha: write the real digest.
		const { createHash } = await import('node:crypto');
		const { readFileSync } = await import('node:fs');
		const sha = createHash('sha256')
			.update(readFileSync(join(h.data, 'qotm.sqlite')))
			.digest('hex');
		writeJson(syncFile(h.data), { version: 'v2026.09.1', sha256: sha, syncedAt: '2026-10-12T09:00:00Z' });
		const r = await run({ ...h.env, QOTM_API_URL: health }, 'doctor');
		expect(r.code).toBe(0);
		expect(r.out).toContain('sha256 ok');
		expect(r.out).toContain(`✓ api           ${health} answers`);
		expect(r.out).toContain('all good');
	});

	it('exits 1 and names a dataset that does not match its manifest', async () => {
		const h = home();
		writeJson(syncFile(h.data), { version: 'v2026.09.1', sha256: 'deadbeef', syncedAt: '2026-10-12T09:00:00Z' });
		const r = await run(h.env, 'doctor', '--offline');
		expect(r.code).toBe(1);
		expect(r.out).toContain("does not match its manifest's sha256: run qotm sync");
		expect(r.out).toContain('1 problem: dataset');
		expect(JSON.parse((await run(h.env, 'doctor', '--offline', '--json')).out)).toMatchObject({ ok: false });
	});

	it('names an API it cannot reach', async () => {
		// A port that was free a moment ago: nothing listens there.
		const probe = createServer();
		await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r));
		const port = (probe.address() as AddressInfo).port;
		await new Promise<void>((r) => probe.close(() => r()));
		const r = await run({ ...home().env, QOTM_API_URL: `http://127.0.0.1:${port}` }, 'doctor');
		expect(r.code).toBe(1);
		expect(r.out).toContain(`✗ api           http://127.0.0.1:${port}: it could not be reached`);
		// fetch refuses some ports outright (port 9 among them), and doctor says so.
		expect((await run({ ...home().env, QOTM_API_URL: 'http://127.0.0.1:9' }, 'doctor')).out).toContain(
			'fetch refuses that port'
		);
	});

	it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('names a folder it cannot write', async () => {
		const h = home();
		chmodSync(h.data, 0o500);
		try {
			const r = await run(h.env, 'doctor', '--offline');
			expect(r.code).toBe(1);
			expect(r.out).toMatch(/✗ data folder {3}.* cannot be written: EACCES/);
		} finally {
			chmodSync(h.data, 0o700);
		}
	});

	it('knows the Node floor', () => {
		expect(nodeOk('v22.16.0')).toBe(true);
		expect(nodeOk('v22.15.1')).toBe(false);
		expect(nodeOk('v23.11.1')).toBe(false);
		expect(nodeOk('v24.0.0')).toBe(true);
		expect(nodeOk('v26.1.0')).toBe(true);
		expect(nodeOk('v20.19.0')).toBe(false);
	});

	it('works on a fresh install too (the bundled snapshot)', async () => {
		const r = await run({ QOTM_HOME: tempDir() }, 'doctor', '--offline');
		expect(r.out).toContain('the copy that came with qotm, sha256 ok');
		expect(r.code).toBe(0);
		writeFileSync(join(tempDir(), 'x'), '');
	});
});
