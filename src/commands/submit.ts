import { parse } from '../args.js';
import type { Command } from '../commands.js';
import { openDataset } from '../dataset.js';
import { api, apiMessage } from '../http.js';
import { CliError, type Io } from '../io.js';
import { siteUrl, style, useColor } from '../output.js';
import { qotmPaths } from '../paths.js';
import { readSession } from '../state.js';
import { readPersonal } from '../store.js';
import { apiFieldError, body, topicList, validate, type FieldErrors, type SubmitInput } from '../submission.js';

/** POST /v1/quotes/match: the closest quote already on qotm, if any. */
type Match = {
	match: { id: string; text: string; author: string | null } | null;
	method: 'exact' | 'fuzzy';
	score: number | null;
};

/** "  text: at least 3 characters", one line per field. */
const fieldLines = (errors: FieldErrors) =>
	Object.entries(errors)
		.map(([field, problem]) => `  ${field.padEnd(8)}${problem}`)
		.join('\n');

function knownTopics(io: Io): string[] {
	try {
		const { dataset } = openDataset(qotmPaths(io.env).data);
		const topics = dataset.topics();
		dataset.close();
		return topics;
	} catch {
		return [];
	}
}

/** The match check the web form runs, shown before sending. */
async function showMatch(io: Io, token: string, text: string, original: boolean): Promise<Match | null> {
	const res = await api<Match>(io, '/v1/quotes/match', { method: 'POST', token, body: { text } });
	if (res.status === 401) throw new CliError('Your session ended. Run qotm login, then try again.');
	if (res.status !== 200) throw new CliError(`The match check failed: ${apiMessage(res)}.`);
	if (!res.body.match) return null;
	const m = res.body;
	const color = useColor(io);
	const how = m.method === 'exact' ? 'the same words' : `${Math.round((m.score ?? 0) * 100)}% similar`;
	io.stdout(
		`${style.clay(color)('possible match')} ${style.muted(color)(`(${how}):`)} ${m.match!.id}  “${m.match!.text}”${m.match!.author ? ` — ${m.match!.author}` : ''}\n` +
			style.muted(color)(
				original
					? 'Declared original, but it matches a quote on qotm: a moderator checks it before it is published.\n'
					: 'It may already be on qotm; a verifier will compare them.\n'
			)
	);
	return m;
}

/**
 * `qotm submit`: send a quote for review, as the web's Submit page does. A
 * canonical quote needs its author, source and topics; an original (your own
 * words, or one of your private quotes) needs --rights.
 */
export const submit: Command = {
	name: 'submit',
	usage:
		'qotm submit "<text>" --author <name> --source <title> --topic <slug> [--year] [--url] [--context]\n       qotm submit --original "<text>" --topic <slug> --rights\n       qotm submit <p_id> --topic <slug> --rights',
	summary: 'send a quote for review',
	help: `
Canonical quotes (someone else's words) go to a verifier, who checks the
source; originals (your own words) get an originality check. Signing in is
needed: qotm login.

  --author <name>     who said or wrote it
  --source <title>    where: a book, paper, talk or post
  --year <yyyy>       when (optional)
  --url <link>        a link to the source (optional)
  --context <text>    what surrounded it (optional)
  --topic <slug>      one to three topics: --topic debugging,unix
  --original          your own words; needs --rights
  --rights            "I wrote this quote and have the right to publish it"
  --check             only show whether it matches a quote already on qotm (signed in)
  --json              print the created quote as JSON

A private quote's id (p_…, from qotm add) submits it as your original.
`,
	async run(args, io) {
		const { values: v, positionals } = parse(
			args,
			{
				author: { type: 'string' },
				source: { type: 'string' },
				year: { type: 'string' },
				url: { type: 'string' },
				context: { type: 'string' },
				topic: { type: 'string', multiple: true },
				original: { type: 'boolean' },
				rights: { type: 'boolean' },
				check: { type: 'boolean' },
				json: { type: 'boolean' }
			},
			true
		);
		let text = positionals.join(' ');
		let original = Boolean(v.original);
		// A private quote from qotm add, submitted as your original.
		if (/^p_[a-z0-9]{8}$/.test(text.trim())) {
			const kept = readPersonal(qotmPaths(io.env).data).quotes.find((q) => q.id === text.trim());
			if (!kept) throw new CliError(`No private quote ${text.trim()} here. qotm --personal --json shows yours.`, 2);
			text = kept.text;
			original = true;
		}
		const input: SubmitInput = {
			original,
			text,
			author: v.author,
			source: v.source,
			year: v.year,
			url: v.url,
			context: v.context,
			topics: topicList(v.topic ?? []),
			rights: v.rights
		};

		const session = readSession(qotmPaths(io.env).config);
		if (v.check) {
			if (cleanLength(text) < 3) throw new CliError('Give the quote to check: qotm submit --check "<text>"', 2);
			if (!session) throw new CliError('Sign in to check for matches: qotm login.');
			const m = await showMatch(io, session.token, text, original);
			if (!m) io.stdout('no match: nothing like it on qotm yet\n');
			return 0;
		}

		const errors = validate(input, knownTopics(io));
		if (Object.keys(errors).length)
			throw new CliError(
				`the quote was not sent. Fix:\n${fieldLines(errors)}\nqotm submit --help shows every option.`,
				2
			);

		if (!session)
			throw new CliError('Sign in to submit: qotm login. (qotm add keeps a quote on this machine meanwhile.)');

		await showMatch(io, session.token, input.text, original);
		const res = await api<{ id: string; status: string }>(io, '/v1/submissions', {
			method: 'POST',
			token: session.token,
			body: body(input)
		});
		if (res.status === 401) throw new CliError('Your session ended. Run qotm login, then submit again.');
		if (res.status === 400) {
			const field = apiFieldError(apiMessage(res));
			throw new CliError(
				`the quote was not accepted:\n${field ? fieldLines({ [field[0]]: field[1] } as FieldErrors) : `  ${apiMessage(res)}`}`,
				2
			);
		}
		if (res.status !== 200 && res.status !== 201) throw new CliError(`The quote was not sent: ${apiMessage(res)}.`);
		if (v.json) {
			io.stdout(`${JSON.stringify(res.body)}\n`);
			return 0;
		}
		const color = useColor(io);
		const next = original
			? 'It gets an originality check, then goes public.'
			: 'A verifier checks the source; you get an email when they have decided.';
		io.stdout(
			`submitted ${res.body.id} ${style.muted(color)(`(${res.body.status.toLowerCase().replace(/_/g, ' ')})`)}\n${style.muted(color)(`${next} ${siteUrl(io)}/my-quotes`)}\n`
		);
		return 0;
	}
};

const cleanLength = (text: string) => text.replace(/\s+/g, ' ').trim().length;
