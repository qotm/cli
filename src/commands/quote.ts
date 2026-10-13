import { parse } from '../args.js';
import type { Command } from '../commands.js';
import { openDataset } from '../dataset.js';
import { SETTINGS, setting } from '../config.js';
import type { Style } from '../render.js';
import { CliError, type Io } from '../io.js';
import { qotmPaths } from '../paths.js';
import { closest, pick } from '../pick.js';
import { formatQuote, fromDataset, fromPersonal, jsonQuote, type Shown } from '../quotes.js';
import { readFavorites, readHistory, readPersonal, remember } from '../store.js';

const OUTPUT = {
	style: { type: 'string' },
	plain: { type: 'boolean' },
	json: { type: 'boolean' },
	source: { type: 'boolean' }
} as const;

const OPTIONS = {
	topic: { type: 'string' },
	author: { type: 'string' },
	favorites: { type: 'boolean' },
	personal: { type: 'boolean' },
	...OUTPUT
} as const;

type Output = { style?: string; plain?: boolean; json?: boolean; source?: boolean };

function print(q: Shown, io: Io, out: Output, dataset: Parameters<typeof jsonQuote>[2]) {
	// --style for one run; else the style setting (each checked the same way).
	const drawn = SETTINGS.style.parse(out.style ?? setting(io, 'style')) as Style;
	io.stdout(
		out.json
			? jsonQuote(q, io, dataset)
			: formatQuote(q, io, { plain: out.plain, source: out.source, style: drawn, columns: io.columns })
	);
}

function unknown(kind: 'topic' | 'author', slug: string, options: string[]): never {
	const near = closest(slug, options);
	throw new CliError(
		`No ${kind} "${slug}" in your dataset.${near ? ` Did you mean ${near}?` : ''} ${
			kind === 'topic' ? `Topics: ${options.join(', ')}.` : 'Authors go by slug: qotm --author dijkstra.'
		}`,
		2
	);
}

/** `qotm`: one considered quote from the local dataset. Never touches the network. */
export const quote: Command = {
	name: 'quote',
	usage:
		'qotm [--topic <slug>] [--author <slug>] [--favorites | --personal] [--source] [--style <name>] [--plain | --json]',
	summary: 'print a quote (the default)',
	help: `
Prints one curated quote from the local dataset, avoiding the last 50 shown
(qotm config set history <n>).

  --topic <slug>    from one topic: qotm --topic debugging
  --author <slug>   by one author: qotm --author dijkstra
  --favorites       from your favorites (qotm save)
  --personal        from your private quotes (qotm add)
  --source          add where it is from
  --style <name>    draw it as pull (the default), bubble, card or slab, this
                    once (qotm config set style <name> to keep one)
  --plain           just the words and the credit: no shape, colour or
                    wrapping (also when piped)
  --json            one JSON object: id, text, type, author, contributor, work,
                    year, source, sourceUrl, topics, url, dataset
`,
	run(args, io) {
		const { values: v } = parse(args, OPTIONS);
		if (v.favorites && v.personal) throw new CliError('Choose --favorites or --personal, not both.', 2);
		const { data } = qotmPaths(io.env);
		const size = Number(setting(io, 'history'));
		// history 0: no variety rule (qotm last still works).
		const recent = size
			? readHistory(data)
					.shown.slice(0, size)
					.map((s) => s.id)
			: [];

		if (v.personal) {
			if (v.topic || v.author)
				throw new CliError('--topic and --author pick from the dataset, not your private quotes.', 2);
			const { quotes } = readPersonal(data);
			const id = pick(
				quotes.map((q) => q.id),
				recent
			);
			if (!id) throw new CliError('You have no private quotes yet. Keep one with qotm add "<text>".');
			print(fromPersonal(quotes.find((q) => q.id === id)!), io, v, null);
			remember(data, id, new Date(), size);
			return 0;
		}

		const { dataset, warning } = openDataset(data);
		try {
			if (warning) io.stderr(`qotm: ${warning}\n`);
			if (v.topic && !dataset.topics().includes(v.topic)) unknown('topic', v.topic, dataset.topics());
			if (v.author && !dataset.authors().includes(v.author)) unknown('author', v.author, dataset.authors());
			const favorites = v.favorites ? readFavorites(data).favorites.map((f) => f.id) : undefined;
			const candidates = dataset.candidates({ topic: v.topic, author: v.author, ids: favorites });
			const id = pick(candidates, recent);
			if (!id) {
				if (v.favorites)
					throw new CliError(
						favorites!.length
							? 'None of your favorites are in this dataset (with these filters).'
							: 'You have no favorites yet. Save the last quote with qotm save.'
					);
				throw new CliError('No quotes match. Try without --topic or --author.');
			}
			print(fromDataset(dataset.quote(id)!, dataset.topicsOf(id)), io, v, dataset);
			remember(data, id, new Date(), size);
			return 0;
		} finally {
			dataset.close();
		}
	}
};

/** `qotm last`: the previous quote again, as it was shown. */
export const last: Command = {
	name: 'last',
	usage: 'qotm last [--source] [--style <name>] [--plain | --json]',
	summary: 'show the last quote again',
	run(args, io) {
		const { values: v } = parse(args, OUTPUT);
		const { data } = qotmPaths(io.env);
		const [latest] = readHistory(data).shown;
		if (!latest) throw new CliError('Nothing shown yet. Run qotm for a quote.');
		if (latest.id.startsWith('p_')) {
			const p = readPersonal(data).quotes.find((q) => q.id === latest.id);
			if (!p) throw new CliError('That private quote is gone. Run qotm for another.');
			print(fromPersonal(p), io, v, null);
			return 0;
		}
		const { dataset } = openDataset(data);
		try {
			const q = dataset.quote(latest.id);
			if (!q) throw new CliError(`${latest.id} is no longer in your dataset. Run qotm for another.`);
			print(fromDataset(q, dataset.topicsOf(q.id)), io, v, dataset);
			return 0;
		} finally {
			dataset.close();
		}
	}
};
