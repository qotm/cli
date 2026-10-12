import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { QUOTES, tempDir, writeDataset } from '../../test/datasets.js';
import { fakeApi } from '../../test/fake-api.js';
import { testIo } from '../../test/io.js';
import { main } from '../main.js';
import { readSync, writeSession } from '../state.js';

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
	await close?.();
	close = undefined;
});

/** A release file and its manifest, as the API and the releases host serve them. */
function release(version = 'v2026.09.1', opts: { schemaVersion?: number } = {}) {
	const file = writeDataset(join(tempDir(), 'qotm.sqlite'), QUOTES, { version, ...opts });
	const bytes = readFileSync(file);
	return {
		bytes,
		manifest: {
			version,
			schemaVersion: 1,
			publishedAt: '2026-09-26T18:02:00.000Z',
			size: bytes.length,
			sha256: createHash('sha256').update(bytes).digest('hex'),
			changes: { eligible: 3, added: 1, corrected: 0, withdrawn: 0 }
		}
	};
}

type Serve = { manifest?: Record<string, unknown> | null; file?: (res: import('node:http').ServerResponse) => void };

async function server(r: ReturnType<typeof release>, serve: Serve = {}) {
	const etag = `"${r.manifest.version}-${r.manifest.sha256}"`;
	const api = await fakeApi({
		'GET /v1/dataset/manifest': (req) => {
			if (serve.manifest === null) return { status: 404, body: { statusCode: 404, message: 'No release yet' } };
			if (req.headers['if-none-match'] === etag) return { status: 304, headers: { etag } };
			return { body: { ...r.manifest, url: `${api.url}/releases/qotm.sqlite`, ...serve.manifest }, headers: { etag } };
		},
		'GET /releases/qotm.sqlite': (_req, res) => {
			if (serve.file) {
				serve.file(res);
				return 'handled';
			}
			res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': String(r.bytes.length) });
			res.end(r.bytes);
			return 'handled';
		}
	});
	close = api.close;
	return api;
}

function home(withLocal?: Buffer) {
	const dir = tempDir();
	const data = join(dir, 'data');
	mkdirSync(data, { recursive: true });
	if (withLocal) writeFileSync(join(data, 'qotm.sqlite'), withLocal);
	return { dir, data };
}

async function run(env: Record<string, string>, ...argv: string[]) {
	const t = testIo(env);
	const code = await main(argv, t.io);
	return { code, out: t.out(), err: t.err() };
}

describe('qotm sync', () => {
	it('downloads, checks and installs the release; qotm then reads it', async () => {
		const r = release();
		const api = await server(r);
		const h = home();
		const env = { QOTM_HOME: h.dir, QOTM_API_URL: api.url };
		const out = await run(env, 'sync');
		expect(out.code).toBe(0);
		expect(out.out).toBe('synced v2026.09.1: 3 quotes (+1 new, ~0 corrected, −0 withdrawn)\n');
		expect(readFileSync(join(h.data, 'qotm.sqlite')).equals(r.bytes)).toBe(true);
		expect(readSync(h.data)).toMatchObject({ version: 'v2026.09.1', sha256: r.manifest.sha256, size: r.bytes.length });
		expect(JSON.parse((await run(env, 'status', '--json')).out).dataset).toMatchObject({
			from: 'local',
			version: 'v2026.09.1'
		});
		expect((await run(env, 'doctor', '--offline')).out).toContain('sha256 ok');
	});

	it('asks with the ETag of what it holds, and stops at a 304', async () => {
		const r = release();
		const api = await server(r);
		const h = home();
		const env = { QOTM_HOME: h.dir, QOTM_API_URL: api.url };
		await run(env, 'sync');
		const again = await run(env, 'sync');
		expect(again.out).toBe('already up to date (v2026.09.1)\n');
		const manifests = api.seen.filter((s) => s.path === '/v1/dataset/manifest');
		expect(manifests[1]!.headers['if-none-match']).toBe(`"v2026.09.1-${r.manifest.sha256}"`);
		expect(api.seen.filter((s) => s.path === '/releases/qotm.sqlite')).toHaveLength(1);
		expect(JSON.parse((await run(env, 'sync', '--json')).out)).toEqual({ updated: false, version: 'v2026.09.1' });
		// --force downloads again.
		await run(env, 'sync', '--force');
		expect(api.seen.filter((s) => s.path === '/releases/qotm.sqlite')).toHaveLength(2);
	});

	it('refuses a checksum mismatch and keeps the old dataset', async () => {
		const old = readFileSync(
			writeDataset(join(tempDir(), 'old.sqlite'), QUOTES.slice(0, 1), { version: 'v2026.08.3' })
		);
		const r = release();
		const api = await server(r, { manifest: { sha256: 'f'.repeat(64) } });
		const h = home(old);
		const out = await run({ QOTM_HOME: h.dir, QOTM_API_URL: api.url }, 'sync');
		expect(out.code).toBe(1);
		expect(out.err).toBe(
			"qotm: The download does not match the manifest's sha256, so it was refused. Your current quotes are unchanged.\n"
		);
		expect(readFileSync(join(h.data, 'qotm.sqlite')).equals(old)).toBe(true);
		expect(readdirSync(h.data)).toEqual(['qotm.sqlite']);
	});

	it('an interrupted download leaves the old dataset intact', async () => {
		const old = readFileSync(
			writeDataset(join(tempDir(), 'old.sqlite'), QUOTES.slice(0, 1), { version: 'v2026.08.3' })
		);
		const r = release();
		const api = await server(r, {
			file: (res) => {
				res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': String(r.bytes.length) });
				res.write(r.bytes.subarray(0, 4096));
				setTimeout(() => res.destroy(), 20);
			}
		});
		const h = home(old);
		const out = await run({ QOTM_HOME: h.dir, QOTM_API_URL: api.url }, 'sync');
		expect(out.code).toBe(1);
		expect(out.err).toMatch(/interrupted|stopped at/);
		expect(out.err).toContain('Your current quotes are unchanged.');
		expect(readFileSync(join(h.data, 'qotm.sqlite')).equals(old)).toBe(true);
		expect(readdirSync(h.data)).toEqual(['qotm.sqlite']);
		expect(readSync(h.data)).toBeNull();
	});

	it('refuses a download larger than the manifest says', async () => {
		const r = release();
		const api = await server(r, { manifest: { size: 1000 } });
		const h = home();
		const out = await run({ QOTM_HOME: h.dir, QOTM_API_URL: api.url }, 'sync');
		expect(out.err).toContain('larger than the manifest says');
		expect(existsSync(join(h.data, 'qotm.sqlite'))).toBe(false);
	});

	it('refuses a schema it does not know, from the manifest or inside the file', async () => {
		const r = release();
		let api = await server(r, { manifest: { schemaVersion: 2 } });
		let out = await run({ QOTM_HOME: home().dir, QOTM_API_URL: api.url }, 'sync');
		expect(out.err).toContain('uses dataset schema 2; this qotm reads schema 1. Update qotm: npm i -g qotm');
		await close!();
		const sneaky = release('v2026.09.1', { schemaVersion: 2 });
		api = await server(sneaky);
		const h = home();
		out = await run({ QOTM_HOME: h.dir, QOTM_API_URL: api.url }, 'sync');
		expect(out.err).toContain('is not a usable dataset');
		expect(existsSync(join(h.data, 'qotm.sqlite'))).toBe(false);
	});

	it('says so before the first release', async () => {
		const api = await server(release(), { manifest: null });
		const out = await run({ QOTM_HOME: home().dir, QOTM_API_URL: api.url }, 'sync');
		expect(out).toMatchObject({
			code: 0,
			out: 'No dataset release has been published yet; you have the quotes that came with qotm.\n'
		});
	});

	it('reports what it holds when signed in, with the bearer', async () => {
		const r = release();
		const api = await server(r);
		const h = home();
		const env = { QOTM_HOME: h.dir, QOTM_API_URL: api.url };
		await run(env, 'sync');
		writeSession(join(h.dir, 'config'), { token: 'tok', handle: 'ada', deviceId: 'd', api: api.url, signedInAt: '' });
		await run(env, 'sync');
		const last = api.seen.filter((s) => s.path === '/v1/dataset/manifest').at(-1)!;
		expect(last.headers['x-qotm-dataset']).toBe('v2026.09.1');
		expect(last.headers.authorization).toBe('Bearer tok');
		expect(api.seen.filter((s) => s.path === '/v1/dataset/manifest')[0]!.headers['x-qotm-dataset']).toBeUndefined();
	});

	it('cleans up a download left by a killed sync', async () => {
		const r = release();
		const api = await server(r);
		const h = home();
		writeFileSync(join(h.data, 'qotm.sqlite.download-99999'), 'half');
		await run({ QOTM_HOME: h.dir, QOTM_API_URL: api.url }, 'sync');
		expect(readdirSync(h.data).sort()).toEqual(
			['history.json', 'qotm.sqlite', 'sync.json'].filter((f) => f !== 'history.json')
		);
	});
});
