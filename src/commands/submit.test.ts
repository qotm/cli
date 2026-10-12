import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { tempDir } from '../../test/datasets.js';
import { fakeApi, type Seen } from '../../test/fake-api.js';
import { testIo } from '../../test/io.js';
import { main } from '../main.js';
import { writeSession } from '../state.js';
import { addPersonal, readPersonal } from '../store.js';

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
	await close?.();
	close = undefined;
});

async function api(opts: { match?: unknown; submit?: (req: Seen) => { status?: number; body?: unknown } } = {}) {
	const a = await fakeApi({
		'POST /v1/quotes/match': () => ({ body: opts.match ?? { match: null, method: 'fuzzy', score: null } }),
		'POST /v1/submissions': (req) => opts.submit?.(req) ?? { body: { id: 'q_new001', status: 'SUBMITTED' } }
	});
	close = a.close;
	return a;
}

function home(url: string, signedIn = true) {
	const dir = tempDir();
	if (signedIn)
		writeSession(join(dir, 'config'), { token: 'tok', handle: 'ada', deviceId: 'd', api: url, signedInAt: '' });
	return { dir, env: { QOTM_HOME: dir, QOTM_API_URL: url } };
}

async function run(env: Record<string, string>, ...argv: string[]) {
	const t = testIo(env);
	const code = await main(argv, t.io);
	return { code, out: t.out(), err: t.err() };
}

const KNUTH = [
	'submit',
	'Premature optimization is the root of all evil.',
	'--author',
	'Donald E. Knuth',
	'--source',
	'Structured Programming with go to Statements',
	'--year',
	'1974',
	'--topic',
	'simplicity'
];

describe('qotm submit', () => {
	it('sends a canonical quote with the web form’s body, and says what happens next', async () => {
		const a = await api();
		const h = home(a.url);
		const r = await run(h.env, ...KNUTH);
		expect(r.code).toBe(0);
		expect(r.out).toContain('submitted q_new001 (submitted)');
		expect(r.out).toContain('A verifier checks the source');
		const sent = a.seen.find((s) => s.path === '/v1/submissions')!;
		expect(sent.headers.authorization).toBe('Bearer tok');
		expect(sent.body).toEqual({
			type: 'canonical',
			text: 'Premature optimization is the root of all evil.',
			attribution: 'Donald E. Knuth',
			source: 'Structured Programming with go to Statements',
			year: 1974,
			topics: ['simplicity']
		});
	});

	it('prints every validation problem per field, and sends nothing', async () => {
		const a = await api();
		const r = await run(home(a.url).env, 'submit', 'x', '--year', 'soon');
		expect(r.code).toBe(2);
		expect(r.err).toBe(
			'qotm: the quote was not sent. Fix:\n' +
				'  text    give the quote, at least 3 characters\n' +
				'  topic   choose at least one topic (--topic debugging)\n' +
				'  author  who said or wrote it (--author "Donald E. Knuth")\n' +
				'  source  where it was said or written (--source "Structured Programming with go to Statements")\n' +
				'  year    a year, like 1974\n' +
				'qotm submit --help shows every option.\n'
		);
		expect(a.seen).toHaveLength(0);
	});

	it('prints the API’s own validation error against its field', async () => {
		const a = await api({
			submit: () => ({ status: 400, body: { statusCode: 400, message: 'Validation: topics - unknown topic quantum' } })
		});
		const r = await run(home(a.url).env, ...KNUTH);
		expect(r.code).toBe(2);
		expect(r.err).toBe('qotm: the quote was not accepted:\n  topic   unknown topic quantum\n');
	});

	it('shows the match result before sending', async () => {
		const a = await api({
			match: {
				match: { id: 'q_5k0q2j', text: 'Premature optimization is the root of all evil.', author: 'Donald E. Knuth' },
				method: 'exact',
				score: 1
			}
		});
		const r = await run(home(a.url).env, ...KNUTH);
		expect(r.out).toMatch(
			/^possible match \(the same words\): q_5k0q2j {2}“Premature optimization is the root of all evil\.” — Donald E\. Knuth\n/
		);
		expect(r.out).toContain('a verifier will compare them');
	});

	it('--check only shows the match (it needs a session, as the API does)', async () => {
		const a = await api({
			match: { match: { id: 'q_x', text: 'Close.', author: null }, method: 'fuzzy', score: 0.91 }
		});
		const r = await run(home(a.url).env, 'submit', '--check', 'Close enough.');
		expect(r.out).toContain('possible match (91% similar): q_x  “Close.”');
		expect(a.seen.map((s) => s.path)).toEqual(['/v1/quotes/match']);
		expect(a.seen[0]!.headers.authorization).toBe('Bearer tok');
		expect((await run(home(a.url, false).env, 'submit', '--check', 'Close enough.')).err).toContain(
			'Sign in to check for matches'
		);
		await close!();
		const none = await api();
		expect((await run(home(none.url).env, 'submit', '--check', 'Nothing like it.')).out).toBe(
			'no match: nothing like it on qotm yet\n'
		);
	});

	it('does not mistake a refused match check for "no match"', async () => {
		const a = await fakeApi({
			'POST /v1/quotes/match': () => ({ status: 401, body: { statusCode: 401, message: 'Unauthorized' } })
		});
		close = a.close;
		const r = await run(home(a.url).env, 'submit', '--check', 'Close enough.');
		expect(r.code).toBe(1);
		expect(r.err).toContain('Your session ended. Run qotm login');
	});

	it('submits one of your private quotes as an original, with --rights', async () => {
		const a = await api({ submit: () => ({ body: { id: 'q_orig01', status: 'ORIGINALITY_CHECK' } }) });
		const h = home(a.url);
		const kept = addPersonal(join(h.dir, 'data'), { text: 'Name things twice.' });
		expect((await run(h.env, 'submit', kept.id, '--topic', 'programming')).err).toContain('--rights');
		const r = await run(h.env, 'submit', kept.id, '--topic', 'programming', '--rights');
		expect(r.out).toContain('submitted q_orig01 (originality check)');
		expect(a.seen.find((s) => s.path === '/v1/submissions')!.body).toEqual({
			type: 'original',
			text: 'Name things twice.',
			topics: ['programming'],
			rights: true
		});
	});

	it('needs a session, and says what to do', async () => {
		const a = await api();
		const r = await run(home(a.url, false).env, ...KNUTH);
		expect(r.err).toContain('Sign in to submit: qotm login.');
	});
});

describe('qotm add, signed in', () => {
	it('also keeps the quote in the account’s private quotes', async () => {
		const a = await api({ submit: () => ({ body: { id: 'q_priv01', status: 'PRIVATE' } }) });
		const h = home(a.url);
		const r = await run(h.env, 'add', 'Name things twice.', '--author', 'Ada');
		expect(r.out).toContain("and in your account's private quotes (q_priv01)");
		expect(a.seen[0]!.body).toEqual({ type: 'private', text: 'Name things twice.', attribution: 'Ada' });
		expect(readPersonal(join(h.dir, 'data')).quotes[0]!.remoteId).toBe('q_priv01');
	});
});
