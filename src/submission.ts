/**
 * What `qotm submit` sends: the web form's body (POST /v1/submissions,
 * BUILD-PLAN §5), checked here field by field so every problem is printed at
 * once (the API reports only the first). The rules mirror the API's
 * SubmitQuote; the API still has the last word.
 */
export type CanonicalBody = {
	type: 'canonical';
	text: string;
	attribution: string;
	source: string;
	year?: number;
	sourceUrl?: string;
	context?: string;
	topics: string[];
};
export type OriginalBody = { type: 'original'; text: string; topics: string[]; rights: true };
export type PrivateBody = {
	type: 'private';
	text: string;
	attribution?: string;
	source?: string;
	year?: number;
	topics?: string[];
};
export type SubmitBody = CanonicalBody | OriginalBody | PrivateBody;

export type FieldErrors = Partial<
	Record<'text' | 'author' | 'source' | 'year' | 'url' | 'context' | 'topic' | 'rights', string>
>;

const QUOTE_MARKS = /^["“”„'‘’«»]+|["“”„'‘’«»]+$/g;

/** The quote's words as the API keeps them: whitespace collapsed, quotation marks dropped. */
export const cleanText = (text: string) => text.replace(/\s+/g, ' ').trim().replace(QUOTE_MARKS, '').trim();

/** "programming,debugging" or repeated --topic: slugs, deduplicated. */
export const topicList = (values: string[]) => [
	...new Set(
		values
			.flatMap((v) => v.split(','))
			.map((t) => t.trim())
			.filter(Boolean)
	)
];

export type SubmitInput = {
	original: boolean;
	text: string;
	author?: string;
	source?: string;
	year?: string;
	url?: string;
	context?: string;
	topics: string[];
	rights?: boolean;
};

/** Every problem with the input, by field; empty when it can be sent. */
export function validate(input: SubmitInput, knownTopics?: string[]): FieldErrors {
	const e: FieldErrors = {};
	const text = cleanText(input.text);
	if (text.length < 3) e.text = 'give the quote, at least 3 characters';
	else if (text.length > 280) e.text = `at most 280 characters (this is ${text.length})`;
	if (!input.topics.length) e.topic = 'choose at least one topic (--topic debugging)';
	else if (input.topics.length > 3) e.topic = 'at most three topics';
	else if (knownTopics?.length) {
		const unknown = input.topics.filter((t) => !knownTopics.includes(t));
		if (unknown.length)
			e.topic = `unknown topic ${unknown.join(', ')} (qotm search --web, or: ${knownTopics.join(', ')})`;
	}
	if (input.original) {
		if (!input.rights) e.rights = 'confirm you wrote this quote and may publish it (--rights)';
		for (const [field, value] of [
			['author', input.author],
			['source', input.source]
		] as const)
			if (value) e[field] = 'an original is yours: leave out --author and --source';
		return e;
	}
	const author = input.author?.trim() ?? '';
	if (author.length < 2) e.author = 'who said or wrote it (--author "Donald E. Knuth")';
	else if (author.length > 160) e.author = 'at most 160 characters';
	const source = input.source?.trim() ?? '';
	if (source.length < 2)
		e.source = 'where it was said or written (--source "Structured Programming with go to Statements")';
	else if (source.length > 300) e.source = 'at most 300 characters';
	if (
		input.year !== undefined &&
		(!/^-?\d{1,4}$/.test(input.year) || Number(input.year) > 2100 || Number(input.year) < -3000)
	)
		e.year = 'a year, like 1974';
	if (input.url !== undefined) {
		try {
			const u = new URL(input.url);
			if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error();
		} catch {
			e.url = 'a link to the source, starting with https://';
		}
	}
	if (input.context && input.context.trim().length > 1000) e.context = 'at most 1000 characters';
	return e;
}

export function body(input: SubmitInput): SubmitBody {
	const text = cleanText(input.text);
	if (input.original) return { type: 'original', text, topics: input.topics, rights: true };
	return {
		type: 'canonical',
		text,
		attribution: input.author!.trim(),
		source: input.source!.trim(),
		...(input.year ? { year: Number(input.year) } : {}),
		...(input.url ? { sourceUrl: input.url } : {}),
		...(input.context?.trim() ? { context: input.context.trim() } : {}),
		topics: input.topics
	};
}

/** The API's "Validation: <field>: <problem>" (or "<field> - <problem>"), as [field, problem]. */
export function apiFieldError(message: string): [string, string] | null {
	const m = /^Validation: (\w+)(?::| -) (.+)$/.exec(message);
	if (!m) return null;
	const field =
		({ attribution: 'author', sourceUrl: 'url', topics: 'topic' } as Record<string, string>)[m[1]!] ?? m[1]!;
	return [field, m[2]!];
}
