import { parse } from '../args.js';
import type { Command } from '../commands.js';
import { openDataset } from '../dataset.js';
import { syncFavorites } from '../favorites-sync.js';
import { CliError, type Io } from '../io.js';
import { style, useColor } from '../output.js';
import { qotmPaths } from '../paths.js';
import { addFavorite, addPersonal, readFavorites, readHistory, removeFavorite } from '../store.js';

const QUOTE_ID = /^q_[a-z0-9]{3,32}$/i;

/** The quote a save or unsave is about: the one given, else the last shown. */
function target(given: string | undefined, data: string, verb: string): string {
	if (given) {
		const id = given.startsWith('q_') ? given : `q_${given}`;
		if (!QUOTE_ID.test(id)) throw new CliError(`"${given}" is not a quote id (q_8f2k1c).`, 2);
		return id;
	}
	const [latest] = readHistory(data).shown;
	if (!latest) throw new CliError(`Nothing to ${verb} yet. Run qotm for a quote, then qotm ${verb}.`);
	if (latest.id.startsWith('p_'))
		throw new CliError('The last quote is one of your private quotes; favorites are quotes from the dataset.');
	return latest.id;
}

/** After a save or unsave: shares it with the account straight away, or says it waits. */
async function share(io: Io): Promise<string> {
	const r = await syncFavorites(io, 3000);
	return r.status === 'queued' ? ` (it syncs with your account later: ${r.reason})` : '';
}

/** `qotm save`: favorite the last quote shown (or one by id). Works offline. */
export const save: Command = {
	name: 'save',
	usage: 'qotm save [<id>]',
	summary: 'add the last quote to your favorites',
	help: 'Favorites live on this machine; signed in, they are shared with your account (offline, at the next qotm sync).',
	async run(args, io) {
		const { positionals } = parse(args, {}, true);
		const { data } = qotmPaths(io.env);
		const id = target(positionals[0], data, 'save');
		const muted = style.muted(useColor(io));
		const added = addFavorite(data, id);
		const note = added ? await share(io) : '';
		io.stdout(muted(added ? `saved to favorites${note}\n` : 'already in your favorites\n'));
		return 0;
	}
};

/** `qotm unsave`: take a quote out of your favorites. */
export const unsave: Command = {
	name: 'unsave',
	usage: 'qotm unsave [<id>]',
	summary: 'remove the last quote (or <id>) from your favorites',
	async run(args, io) {
		const { positionals } = parse(args, {}, true);
		const { data } = qotmPaths(io.env);
		const id = target(positionals[0], data, 'unsave');
		const muted = style.muted(useColor(io));
		const removed = removeFavorite(data, id);
		const note = removed ? await share(io) : '';
		io.stdout(muted(removed ? `removed from favorites${note}\n` : 'not in your favorites\n'));
		return 0;
	}
};

/** `qotm favorites`: your favorites, newest first. */
export const favorites: Command = {
	name: 'favorites',
	usage: 'qotm favorites [--plain | --json]',
	summary: 'list your favorites',
	run(args, io) {
		const { values: v } = parse(args, { plain: { type: 'boolean' }, json: { type: 'boolean' } });
		const { data } = qotmPaths(io.env);
		const list = readFavorites(data).favorites;
		const { dataset } = openDataset(data);
		try {
			const rows = list.map((f) => ({ ...f, quote: dataset.quote(f.id) }));
			if (v.json) {
				io.stdout(
					`${JSON.stringify(
						rows.map((r) => ({
							id: r.id,
							addedAt: r.addedAt,
							text: r.quote?.text ?? null,
							author: r.quote?.author ?? null
						}))
					)}\n`
				);
				return 0;
			}
			if (!rows.length) {
				io.stdout('No favorites yet. Save the last quote with qotm save.\n');
				return 0;
			}
			const color = useColor(io, v.plain);
			const width = v.plain || !io.columns ? Infinity : io.columns;
			for (const r of rows) {
				const words = r.quote
					? `${r.quote.text} — ${r.quote.author ?? (r.quote.contributor ? `@${r.quote.contributor}` : 'a former member')}`
					: 'not in this dataset (run qotm sync)';
				const line = `${r.id}  ${words}`;
				const clipped = line.length > width ? `${line.slice(0, Math.max(10, width - 1))}…` : line;
				io.stdout(`${style.muted(color)(clipped.slice(0, r.id.length))}${clipped.slice(r.id.length)}\n`);
			}
			return 0;
		} finally {
			dataset.close();
		}
	}
};

/** `qotm add`: keep a private quote on this machine. */
export const add: Command = {
	name: 'add',
	usage: 'qotm add "<text>" [--author <name>] [--work <title>] [--year <yyyy>]',
	summary: 'keep a private quote',
	help: `
Private quotes stay on this machine and never enter the dataset.
qotm --personal draws from them; qotm submit sends one for review.
`,
	run(args, io) {
		const { values: v, positionals } = parse(
			args,
			{ author: { type: 'string' }, work: { type: 'string' }, year: { type: 'string' } },
			true
		);
		const text = positionals.join(' ').replace(/\s+/g, ' ').trim();
		if (!text) throw new CliError('Give the quote: qotm add "Make it work, make it right, make it fast."', 2);
		if (text.length > 280) throw new CliError(`That is ${text.length} characters; a quote is at most 280.`, 2);
		if (v.year !== undefined && !/^\d{1,4}$/.test(v.year)) throw new CliError('--year is a year, like 1974.', 2);
		const { data } = qotmPaths(io.env);
		const kept = addPersonal(data, {
			text,
			author: v.author?.trim() || null,
			work: v.work?.trim() || null,
			year: v.year ? Number(v.year) : null
		});
		io.stdout(
			style.muted(useColor(io))(`kept as a private quote (${kept.id}). qotm --personal shows your private quotes.\n`)
		);
		return 0;
	}
};
