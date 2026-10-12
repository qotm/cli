import { createHash } from 'node:crypto';
import { accessSync, constants, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '../args.js';
import type { Command } from '../commands.js';
import { KEYS, SETTINGS, assertKey, resolve, setSetting, setting, unsetSetting } from '../config.js';
import { openDataset, SNAPSHOT_MANIFEST } from '../dataset.js';
import { api } from '../http.js';
import { CliError, type Io } from '../io.js';
import { quoteUrl, siteUrl, style, useColor } from '../output.js';
import { qotmPaths } from '../paths.js';
import { readSession, readSync } from '../state.js';
import { readFavorites, readHistory, readPersonal } from '../store.js';

const JSON_OPT = { json: { type: 'boolean' } } as const;

async function openInBrowser(io: Io, url: string) {
	if (!io.openUrl) throw new CliError(`Open ${url} in your browser.`);
	try {
		await io.openUrl(url);
	} catch {
		io.stdout(`could not open a browser; the address is ${url}\n`);
	}
}

/** `qotm open`: the last quote's page on qotm.dev. */
export const open: Command = {
	name: 'open',
	usage: 'qotm open [<id>]',
	summary: 'open the last quote (or <id>) on qotm.dev',
	help: 'Its page has the source, the context and who verified it.',
	async run(args, io) {
		const { positionals } = parse(args, {}, true);
		let id = positionals[0];
		if (id && !id.startsWith('q_')) id = `q_${id}`;
		if (!id) {
			const [latest] = readHistory(qotmPaths(io.env).data).shown;
			if (!latest) throw new CliError('Nothing shown yet. Run qotm for a quote, then qotm open.');
			id = latest.id;
		}
		const url = quoteUrl(io, id);
		if (!url) throw new CliError('That is one of your private quotes; it has no page on qotm.dev.');
		io.stdout(style.muted(useColor(io))(`opening ${id.replace(/^q_/, 'q/')} in your browser\n`));
		await openInBrowser(io, url);
		return 0;
	}
};

/** `qotm search`: the local dataset's full-text index, or the site's search. */
export const search: Command = {
	name: 'search',
	usage: 'qotm search <text> [--limit <n>] [--web] [--plain | --json]',
	summary: 'search the quotes in your dataset',
	help: `
Searches the text, author and work of every quote in your dataset, offline;
each word also matches as a prefix (debug finds debugging).

  --limit <n>   at most n results (10)
  --web         open the search on qotm.dev instead
  --json        a list of { id, text, author, authorSlug, work, year, url }
`,
	async run(args, io) {
		const { values: v, positionals } = parse(
			args,
			{ limit: { type: 'string' }, web: { type: 'boolean' }, plain: { type: 'boolean' }, ...JSON_OPT },
			true
		);
		const text = positionals.join(' ').trim();
		if (!text) throw new CliError('What should qotm search for? qotm search complexity', 2);
		if (v.web) {
			const url = `${siteUrl(io)}/search?q=${encodeURIComponent(text)}`;
			io.stdout(style.muted(useColor(io))(`opening the search for "${text}" in your browser\n`));
			await openInBrowser(io, url);
			return 0;
		}
		const limit = v.limit === undefined ? 10 : Number(v.limit);
		if (!Number.isInteger(limit) || limit < 1) throw new CliError('--limit is a number of results, like 10.', 2);
		const { dataset, warning } = openDataset(qotmPaths(io.env).data);
		try {
			if (warning) io.stderr(`qotm: ${warning}\n`);
			const found = dataset.search(text, limit);
			if (v.json) {
				io.stdout(
					`${JSON.stringify(
						found.map((q) => ({
							id: q.id,
							text: q.text,
							author: q.author,
							authorSlug: q.authorSlug,
							work: q.work,
							year: q.year,
							url: quoteUrl(io, q.id)
						}))
					)}\n`
				);
				return 0;
			}
			if (!found.length) {
				io.stdout(
					`Nothing in your dataset matches "${text}". qotm search ${JSON.stringify(text)} --web searches qotm.dev.\n`
				);
				return 0;
			}
			const color = useColor(io, v.plain);
			for (const q of found)
				io.stdout(
					`${style.muted(color)(q.id)}  ${q.text} ${style.clay(color)('—')} ${q.author ?? (q.contributor ? `@${q.contributor}` : 'a former member')}\n`
				);
			return 0;
		} finally {
			dataset.close();
		}
	}
};

/** `qotm status`: the dataset, the last sync, who is signed in, and counts. */
export const status: Command = {
	name: 'status',
	usage: 'qotm status [--json]',
	summary: 'show your dataset, last sync and account',
	async run(args, io) {
		const { values: v } = parse(args, JSON_OPT);
		const { config, data } = qotmPaths(io.env);
		const { dataset, from, warning } = openDataset(data);
		const sync = readSync(data);
		const session = readSession(config);
		const favorites = readFavorites(data);
		const report = {
			dataset: {
				version: dataset.meta.version,
				schemaVersion: dataset.meta.schemaVersion,
				from,
				quotes: dataset.count(),
				file: dataset.file
			},
			lastSync: sync?.syncedAt ?? null,
			account: session ? { handle: session.handle, api: session.api } : null,
			favorites: favorites.favorites.length,
			pendingFavoriteChanges: favorites.pending.add.length + favorites.pending.remove.length,
			privateQuotes: readPersonal(data).quotes.length,
			api: setting(io, 'api')
		};
		dataset.close();
		if (v.json) {
			io.stdout(`${JSON.stringify(report)}\n`);
			return 0;
		}
		const m = style.muted(useColor(io));
		const lines: [string, string][] = [
			[
				'dataset',
				`${report.dataset.version} · ${report.dataset.quotes} quotes${from === 'snapshot' ? ' (the copy that came with qotm)' : ''}`
			],
			['last sync', report.lastSync ? report.lastSync.replace('T', ' ').slice(0, 16) : 'never (qotm sync)'],
			['account', session ? `@${session.handle ?? '?'}` : 'not signed in (qotm login)'],
			[
				'favorites',
				`${report.favorites}${report.pendingFavoriteChanges ? ` (${report.pendingFavoriteChanges} to sync)` : ''}`
			],
			['private quotes', String(report.privateQuotes)]
		];
		if (warning) io.stderr(`qotm: ${warning}\n`);
		for (const [k, val] of lines) io.stdout(`${m(k.padEnd(15))}${val}\n`);
		return 0;
	}
};

/** `qotm config`: list, get, set and unset settings. */
export const config: Command = {
	name: 'config',
	usage: 'qotm config [get <key> | set <key> <value> | unset <key>] [--json]',
	summary: 'show or change settings',
	help: `
Settings (qotm config set <key> <value>):
${KEYS.map((k) => `  ${k.padEnd(9)}${SETTINGS[k].describe} (default ${SETTINGS[k].default})`).join('\n')}

QOTM_API_URL and QOTM_SITE_URL override api and site for one run.
`,
	run(args, io) {
		const { values: v, positionals } = parse(args, JSON_OPT, true);
		const [action, key, value] = positionals;
		if (!action || action === 'list') {
			const all = KEYS.map((k) => resolve(io, k));
			if (v.json) io.stdout(`${JSON.stringify(Object.fromEntries(all.map((r) => [r.key, r.value])))}\n`);
			else
				for (const r of all)
					io.stdout(
						`${r.key.padEnd(9)}${r.value}${r.from === 'default' ? '  (default)' : r.from === 'env' ? '  (from the environment)' : ''}\n`
					);
			return 0;
		}
		if (action === 'get') {
			const r = resolve(io, assertKey(key));
			io.stdout(v.json ? `${JSON.stringify({ [r.key]: r.value })}\n` : `${r.value}\n`);
			return 0;
		}
		if (action === 'set') {
			const k = assertKey(key);
			if (value === undefined) throw new CliError(`Give the value: qotm config set ${k} <value>.`, 2);
			io.stdout(`${k} = ${setSetting(io, k, value)}\n`);
			return 0;
		}
		if (action === 'unset') {
			const k = assertKey(key);
			unsetSetting(io, k);
			io.stdout(`${k} = ${SETTINGS[k].default} (default)\n`);
			return 0;
		}
		throw new CliError(`Unknown config action "${action}": get, set, unset or list.`, 2);
	}
};

type Check = { name: string; ok: boolean; detail: string };
const sha256 = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

/** The minimum Node this qotm runs on (node:sqlite). */
export const MIN_NODE = [22, 13] as const;

export function nodeOk(version: string): boolean {
	const [major = 0, minor = 0] = version.replace(/^v/, '').split('.').map(Number);
	return major > MIN_NODE[0] || (major === MIN_NODE[0] && minor >= MIN_NODE[1]);
}

/** `qotm doctor`: checks the install and says what is wrong. Exits 1 when a check fails. */
export const doctor: Command = {
	name: 'doctor',
	usage: 'qotm doctor [--offline] [--json]',
	summary: 'check the install: Node, folders, dataset, API',
	help: `
Checks, and names any problem:
  node       Node.js ${MIN_NODE.join('.')} or later
  folders    the config and data folders can be written
  dataset    the dataset opens, and its sha256 matches its manifest
  api        the API answers (skipped with --offline)
`,
	async run(args, io) {
		const { values: v } = parse(args, { offline: { type: 'boolean' }, ...JSON_OPT });
		const checks: Check[] = [];
		const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

		add(
			'node',
			nodeOk(process.version),
			nodeOk(process.version) ? process.version : `${process.version}: qotm needs ${MIN_NODE.join('.')} or later`
		);

		const paths = qotmPaths(io.env);
		for (const [label, dir] of [
			['config folder', paths.config],
			['data folder', paths.data]
		] as const) {
			try {
				mkdirSync(dir, { recursive: true });
				accessSync(dir, constants.W_OK);
				const probe = join(dir, `.doctor-${process.pid}`);
				writeFileSync(probe, 'ok');
				rmSync(probe);
				add(label, true, dir);
			} catch (err) {
				add(label, false, `${dir} cannot be written: ${(err as NodeJS.ErrnoException).code ?? (err as Error).message}`);
			}
		}

		try {
			const { dataset, from, warning } = openDataset(paths.data);
			const file = dataset.file;
			const label = `${dataset.meta.version}, ${dataset.count()} quotes`;
			dataset.close();
			const expected = from === 'local' ? readSync(paths.data)?.sha256 : snapshotSha();
			if (warning) add('dataset', false, warning);
			else if (!expected) add('dataset', true, `${label} (no manifest to check against; qotm sync records one)`);
			else if (sha256(file) !== expected)
				add('dataset', false, `${file} does not match its manifest's sha256: run qotm sync to fetch it again`);
			else add('dataset', true, `${label}${from === 'snapshot' ? ', the copy that came with qotm' : ''}, sha256 ok`);
		} catch (err) {
			add('dataset', false, `no usable dataset: ${(err as Error).message}. Reinstall qotm (npm i -g qotm).`);
		}

		if (!v.offline) {
			const base = setting(io, 'api');
			try {
				const res = await api<unknown>(io, '/health', { timeoutMs: 5000 });
				add('api', res.status === 200, res.status === 200 ? `${base} answers` : `${base} answered ${res.status}`);
			} catch (err) {
				add('api', false, (err as Error).message);
			}
		}

		const failed = checks.filter((c) => !c.ok);
		if (v.json) io.stdout(`${JSON.stringify({ ok: !failed.length, checks })}\n`);
		else {
			const color = useColor(io);
			for (const c of checks)
				io.stdout(`${c.ok ? style.muted(color)('✓') : style.clay(color)('✗')} ${c.name.padEnd(14)}${c.detail}\n`);
			io.stdout(
				failed.length
					? `\n${failed.length} problem${failed.length > 1 ? 's' : ''}: ${failed.map((c) => c.name).join(', ')}\n`
					: '\nall good\n'
			);
		}
		return failed.length ? 1 : 0;
	}
};

function snapshotSha(): string | undefined {
	try {
		return (JSON.parse(readFileSync(SNAPSHOT_MANIFEST, 'utf8')) as { sha256?: string }).sha256;
	} catch {
		return undefined;
	}
}
