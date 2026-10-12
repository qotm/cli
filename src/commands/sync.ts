import { createHash } from 'node:crypto';
import { createWriteStream, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parse } from '../args.js';
import type { Command } from '../commands.js';
import { Dataset, DatasetError, SCHEMA_VERSION } from '../dataset.js';
import { api, apiMessage } from '../http.js';
import { syncFavorites, type FavoritesSync } from '../favorites-sync.js';
import { CliError, type Io } from '../io.js';
import { style, useColor } from '../output.js';
import { qotmPaths } from '../paths.js';
import { readSession, readSync, writeSync } from '../state.js';
import { VERSION } from '../version.js';

/** GET /v1/dataset/manifest (BUILD-PLAN §5). */
export type Manifest = {
	version: string;
	schemaVersion: number;
	publishedAt: string;
	url: string;
	size: number;
	sha256: string;
	changes: { eligible: number; added: number; corrected: number; withdrawn: number };
};

const TEMP = /^qotm\.sqlite\.download-\d+$/;
const n = (v: number) => v.toLocaleString('en-US');

/** The version this terminal holds, when it holds a synced, readable file. */
function held(data: string): { version: string; etag: string | null } | null {
	const state = readSync(data);
	if (!state) return null;
	try {
		Dataset.open(join(data, 'qotm.sqlite')).close();
		return { version: state.version, etag: state.etag };
	} catch {
		return null;
	}
}

/**
 * Downloads `url` into `file`, hashing as it arrives. Throws on a network
 * error, a short or long body, or a sha256 that is not the manifest's; the
 * caller removes the temp file, so the dataset in place is never touched.
 */
async function download(m: Manifest, file: string, onProgress: (bytes: number) => void): Promise<void> {
	let res: Response;
	try {
		res = await fetch(m.url, { headers: { 'user-agent': `qotm/${VERSION}` }, signal: AbortSignal.timeout(300_000) });
	} catch {
		throw new CliError(
			`The dataset could not be downloaded from ${new URL(m.url).host}. Your current quotes are unchanged.`
		);
	}
	if (!res.ok || !res.body)
		throw new CliError(`The dataset download failed (HTTP ${res.status}). Your current quotes are unchanged.`);
	const hash = createHash('sha256');
	let bytes = 0;
	const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream);
	body.on('data', (chunk: Buffer) => {
		hash.update(chunk);
		bytes += chunk.length;
		if (bytes > m.size) body.destroy(new CliError('The download is larger than the manifest says. It was refused.'));
		else onProgress(bytes);
	});
	try {
		await pipeline(body, createWriteStream(file));
	} catch (err) {
		if (err instanceof CliError) throw err;
		throw new CliError(`The download was interrupted (${(err as Error).message}). Your current quotes are unchanged.`);
	}
	if (bytes !== m.size)
		throw new CliError(`The download stopped at ${n(bytes)} of ${n(m.size)} bytes. Your current quotes are unchanged.`);
	if (hash.digest('hex') !== m.sha256)
		throw new CliError(
			"The download does not match the manifest's sha256, so it was refused. Your current quotes are unchanged."
		);
}

/**
 * `qotm sync`: the current dataset release. Asks the manifest (with the
 * ETag of what it holds), downloads the file next to the current one,
 * checks its size, sha256 and schema, then swaps it in with one rename.
 */
export const sync: Command = {
	name: 'sync',
	usage: 'qotm sync [--force] [--json]',
	summary: 'update your quotes to the latest dataset release',
	help: `
Fetches the latest dataset release (qotm.sqlite), checks it against its
manifest (size and sha256), and replaces your copy in one step: an
interrupted or mismatched download leaves your quotes as they were.

  --force   download even when you already have this release
  --json    print what was done as JSON
`,
	async run(args, io) {
		const { values: v } = parse(args, { force: { type: 'boolean' }, json: { type: 'boolean' } });
		const { config, data } = qotmPaths(io.env);
		mkdirSync(data, { recursive: true });
		// A sync killed mid-download leaves its temp file; start clean.
		for (const f of readdirSync(data)) if (TEMP.test(f)) rmSync(join(data, f), { force: true });

		const session = readSession(config);
		const have = held(data);
		const res = await api<Manifest>(io, '/v1/dataset/manifest', {
			token: session?.token,
			headers: {
				...(have && !v.force && have.etag ? { 'if-none-match': have.etag } : {}),
				...(session && have ? { 'x-qotm-dataset': have.version } : {})
			}
		});
		const report = async (out: Record<string, unknown>, text: string) => {
			const favorites = await syncFavorites(io);
			io.stdout(v.json ? `${JSON.stringify({ ...out, favorites })}\n` : text + favoritesLine(io, favorites));
			return 0;
		};
		if (res.status === 404)
			return report(
				{ updated: false, reason: 'no-release' },
				'No dataset release has been published yet; you have the quotes that came with qotm.\n'
			);
		if (res.status === 304)
			return report({ updated: false, version: have!.version }, `already up to date (${have!.version})\n`);
		if (res.status !== 200) throw new CliError(`The dataset manifest could not be read: ${apiMessage(res)}.`);
		const m = res.body;
		if (m.schemaVersion !== SCHEMA_VERSION)
			throw new CliError(
				`Release ${m.version} uses dataset schema ${m.schemaVersion}; this qotm reads schema ${SCHEMA_VERSION}. Update qotm: npm i -g qotm`
			);
		const etag = res.headers.get('etag');
		const current = readSync(data);
		if (!v.force && have && current?.version === m.version && current.sha256 === m.sha256) {
			writeSync(data, { ...current, etag, syncedAt: new Date().toISOString() });
			return report({ updated: false, version: m.version }, `already up to date (${m.version})\n`);
		}

		const temp = join(data, `qotm.sqlite.download-${process.pid}`);
		const cleanup = () => rmSync(temp, { force: true });
		process.once('SIGINT', cleanup);
		const color = useColor(io);
		const progress = io.isTTY && !v.json;
		try {
			let last = -1;
			await download(m, temp, (bytes) => {
				const pct = Math.floor((bytes / m.size) * 100);
				if (progress && pct !== last) {
					last = pct;
					io.stdout(`\r${style.muted(color)(`downloading ${m.version}… ${pct}%`)}`);
				}
			});
			if (progress) io.stdout('\r\x1b[2K');
			// The file must be what it says it is before it replaces anything.
			try {
				const ds = Dataset.open(temp);
				const version = ds.meta.version;
				ds.close();
				if (version !== m.version) throw new DatasetError(`it holds ${version}, not ${m.version}`, 'corrupt');
			} catch (err) {
				throw new CliError(`The download is not a usable dataset (${(err as Error).message}). It was refused.`);
			}
			renameSync(temp, join(data, 'qotm.sqlite'));
		} catch (err) {
			if (progress) io.stdout('\r\x1b[2K');
			throw err;
		} finally {
			cleanup();
			process.removeListener('SIGINT', cleanup);
		}

		writeSync(data, {
			version: m.version,
			schemaVersion: m.schemaVersion,
			sha256: m.sha256,
			size: m.size,
			publishedAt: m.publishedAt,
			etag,
			syncedAt: new Date().toISOString()
		});
		const c = m.changes;
		return report(
			{ updated: true, version: m.version, from: have?.version ?? null, changes: c },
			`synced ${m.version}: ${n(c.eligible)} quotes ${style.muted(color)(`(+${n(c.added)} new, ~${n(c.corrected)} corrected, −${n(c.withdrawn)} withdrawn)`)}\n`
		);
	}
};

function favoritesLine(io: Io, f: FavoritesSync): string {
	const m = style.muted(useColor(io));
	if (f.status === 'signed-out') return '';
	if (f.status === 'queued')
		return m(`favorites: ${f.pending} change${f.pending === 1 ? '' : 's'} waiting (${f.reason})\n`);
	const skipped = f.skipped.length ? `; ${f.skipped.length} not on qotm.dev, kept here only` : '';
	return m(`favorites: ${f.count}, synced with @${f.handle ?? 'your account'}${skipped}\n`);
}
