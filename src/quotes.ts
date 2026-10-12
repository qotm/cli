import type { Dataset, Quote } from './dataset.js';
import type { Io } from './io.js';
import { quoteUrl, style, useColor, wrap } from './output.js';
import type { PersonalQuote } from './store.js';

/** A quote as `qotm` shows it: from the dataset, or one of your private quotes. */
export type Shown = {
	id: string;
	text: string;
	type: 'canonical' | 'original' | 'personal';
	author: { name: string; slug: string | null } | null;
	contributor: string | null;
	work: string | null;
	year: number | null;
	source: string | null;
	sourceUrl: string | null;
	topics: string[];
};

export const fromDataset = (q: Quote, topics: string[]): Shown => ({
	id: q.id,
	text: q.text,
	type: q.type,
	author: q.author ? { name: q.author, slug: q.authorSlug } : null,
	contributor: q.contributor,
	work: q.work,
	year: q.year,
	source: q.source,
	sourceUrl: q.sourceUrl,
	topics
});

export const fromPersonal = (p: PersonalQuote): Shown => ({
	id: p.id,
	text: p.text,
	type: 'personal',
	author: p.author ? { name: p.author, slug: null } : null,
	contributor: null,
	work: p.work,
	year: p.year,
	source: null,
	sourceUrl: null,
	topics: []
});

/** Who the line after the quote credits: the author, an original's member, or no one. */
function credit(q: Shown): string {
	if (q.author) return q.author.name;
	if (q.type === 'original') return q.contributor ? `@${q.contributor}` : 'a former member';
	return q.type === 'personal' ? 'you' : 'unknown';
}

/** "EWD 498, 1975 · https://…": where it is from, for --source. */
function sourceLine(q: Shown): string | null {
	const work = [q.source ?? q.work, q.year].filter(Boolean).join(', ');
	const parts = [work, q.sourceUrl].filter(Boolean);
	return parts.length ? parts.join(' · ') : null;
}

export type FormatOptions = { plain?: boolean; source?: boolean; columns?: number };

/**
 * The quote, as the landing page's terminal shows it: the words in bold,
 * then a clay "—" and the author, muted. Plain: the same lines with no
 * escape codes and no wrapping, for pipes.
 */
export function formatQuote(q: Shown, io: Io, opts: FormatOptions = {}): string {
	const color = useColor(io, opts.plain);
	const width = Math.max(20, Math.min(opts.columns ?? 80, 80) - 2);
	const text = color ? wrap(q.text, width) : q.text;
	const lines = [style.bold(color)(text), `${style.clay(color)('—')}  ${style.muted(color)(credit(q))}`];
	if (opts.source) {
		const where = sourceLine(q);
		lines.push(style.muted(color)(`   ${where ?? 'no source on record'}`));
	}
	return `${lines.join('\n')}\n`;
}

/**
 * `qotm --json`: one object, documented in the README.
 * { id, text, type, author: { name, slug } | null, contributor, work, year,
 *   source, sourceUrl, topics: [slug], url, dataset }
 */
export function jsonQuote(q: Shown, io: Io, dataset: Dataset | null): string {
	return `${JSON.stringify({
		id: q.id,
		text: q.text,
		type: q.type,
		author: q.author,
		contributor: q.contributor,
		work: q.work,
		year: q.year,
		source: q.source,
		sourceUrl: q.sourceUrl,
		topics: q.topics,
		url: quoteUrl(io.env, q.id),
		dataset: q.type === 'personal' ? null : (dataset?.meta.version ?? null)
	})}\n`;
}
