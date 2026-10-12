// Refreshes the dataset snapshot the package ships (data/qotm.sqlite), so a
// fresh install shows a quote offline until its first `qotm sync`.
//
//   node scripts/snapshot.mjs                       # the latest release, from https://api.qotm.dev
//   node scripts/snapshot.mjs --api <url>           # from another API (dev: https://api.qotm.site)
//   node scripts/snapshot.mjs --from <qotm.sqlite>  # a file built by the worker (yarn dataset:sample)
//
// Downloads are checked against the manifest's size and sha256, as `qotm sync` does.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const args = process.argv.slice(2);
const opt = (name) => {
	const i = args.indexOf(name);
	return i === -1 ? undefined : args[i + 1];
};
const out = new URL('../data/', import.meta.url);
mkdirSync(out, { recursive: true });
const file = new URL('qotm.sqlite', out);
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

let publishedAt = null;
const from = opt('--from');
if (from) {
	copyFileSync(from, file);
} else {
	const api = (opt('--api') ?? 'https://api.qotm.dev').replace(/\/+$/, '');
	const res = await fetch(`${api}/v1/dataset/manifest`, { headers: { 'user-agent': 'qotm-snapshot' } });
	if (!res.ok) throw new Error(`${api}/v1/dataset/manifest: ${res.status}`);
	const manifest = await res.json();
	if (manifest.schemaVersion !== 1) throw new Error(`schemaVersion ${manifest.schemaVersion}: this qotm reads 1`);
	const body = Buffer.from(await (await fetch(manifest.url)).arrayBuffer());
	if (body.length !== manifest.size || sha256(body) !== manifest.sha256)
		throw new Error(`${manifest.url} does not match the manifest's size and sha256`);
	writeFileSync(file, body);
	publishedAt = manifest.publishedAt;
}

const db = new DatabaseSync(file.pathname ? decodeURIComponent(file.pathname) : file, { readOnly: true });
const meta = Object.fromEntries(
	db
		.prepare('SELECT key, value FROM meta')
		.all()
		.map((r) => [r.key, r.value])
);
const quotes = db.prepare('SELECT count(*) AS n FROM quotes').get().n;
db.close();
const body = readFileSync(file);
const manifest = {
	version: meta.version,
	schemaVersion: Number(meta.schemaVersion),
	builtAt: meta.builtAt ?? null,
	publishedAt,
	quotes,
	size: body.length,
	sha256: sha256(body)
};
writeFileSync(new URL('snapshot.json', out), `${JSON.stringify(manifest, null, '\t')}\n`);
console.log(`data/qotm.sqlite: ${manifest.version}, ${quotes} quotes, ${manifest.size} bytes`);
