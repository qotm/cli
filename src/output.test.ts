import { describe, expect, it } from 'vitest';
import { tempDir } from '../test/datasets.js';
import { testIo } from '../test/io.js';
import { quoteUrl, useColor, wrap } from './output.js';
import { formatQuote, jsonQuote, type Shown } from './quotes.js';

const Q: Shown = {
	id: 'q_8f2k1c',
	text: 'Simplicity is prerequisite for reliability.',
	type: 'canonical',
	author: { name: 'Edsger W. Dijkstra', slug: 'dijkstra' },
	contributor: 'kofi',
	work: 'EWD 498',
	year: 1975,
	source: 'EWD 498: How do we tell truths that might hurt?',
	sourceUrl: 'https://www.cs.utexas.edu/~EWD/transcriptions/EWD04xx/EWD498.html',
	topics: ['simplicity']
};
const ANSI = /\x1b\[/;

describe('output', () => {
	it('colours a terminal only, and honours NO_COLOR, TERM=dumb, FORCE_COLOR and --plain', () => {
		expect(useColor(testIo({}, true).io)).toBe(true);
		expect(useColor(testIo({}, false).io)).toBe(false);
		expect(useColor(testIo({ NO_COLOR: '' }, true).io)).toBe(false);
		expect(useColor(testIo({ TERM: 'dumb' }, true).io)).toBe(false);
		expect(useColor(testIo({ FORCE_COLOR: '1' }, false).io)).toBe(true);
		expect(useColor(testIo({}, true).io, true)).toBe(false);
	});

	it('prints the quote, then — and the author, as the landing terminal does', () => {
		expect(formatQuote(Q, testIo().io)).toBe('Simplicity is prerequisite for reliability.\n—  Edsger W. Dijkstra\n');
		const tty = formatQuote(Q, testIo({}, true).io);
		expect(tty).toMatch(ANSI);
		expect(tty).toContain('\x1b[1mSimplicity is prerequisite for reliability.\x1b[22m');
	});

	it('--plain has no escape codes, even on a terminal', () => {
		expect(formatQuote(Q, testIo({}, true).io, { plain: true, source: true })).not.toMatch(ANSI);
	});

	it('--source adds where it is from', () => {
		expect(formatQuote(Q, testIo().io, { source: true })).toContain(
			'   EWD 498: How do we tell truths that might hurt?, 1975 · https://www.cs.utexas.edu/~EWD/transcriptions/EWD04xx/EWD498.html\n'
		);
		expect(
			formatQuote({ ...Q, work: null, year: null, source: null, sourceUrl: null }, testIo().io, { source: true })
		).toContain('   no source on record');
	});

	it('credits originals to their member and private quotes to you', () => {
		expect(formatQuote({ ...Q, type: 'original', author: null, contributor: 'ada' }, testIo().io)).toContain('—  @ada');
		expect(formatQuote({ ...Q, type: 'original', author: null, contributor: null }, testIo().io)).toContain(
			'—  a former member'
		);
		expect(formatQuote({ ...Q, id: 'p_1', type: 'personal', author: null }, testIo().io)).toContain('—  you');
	});

	it('wraps long quotes on a terminal, at word boundaries', () => {
		expect(wrap('one two three four', 9)).toBe('one two\nthree\nfour');
		const long = { ...Q, text: 'word '.repeat(30).trim() };
		const lines = formatQuote(long, testIo({}, true).io, { columns: 40 }).split('\n');
		expect(lines[0]!.replace(/\x1b\[[0-9;]*m/g, '').length).toBeLessThanOrEqual(38);
	});

	it('--json has the documented shape', () => {
		// An empty home: the defaults, not this machine's settings.json.
		const json = JSON.parse(
			jsonQuote(Q, testIo({ QOTM_HOME: tempDir() }).io, { meta: { version: 'v2026.09.1' } } as never)
		);
		expect(Object.keys(json)).toEqual([
			'id',
			'text',
			'type',
			'author',
			'contributor',
			'work',
			'year',
			'source',
			'sourceUrl',
			'topics',
			'url',
			'dataset'
		]);
		expect(json).toMatchObject({
			id: 'q_8f2k1c',
			url: 'https://qotm.dev/q/8f2k1c',
			dataset: 'v2026.09.1',
			topics: ['simplicity']
		});
		expect(quoteUrl(testIo({ QOTM_SITE_URL: 'https://qotm.site/' }).io, 'q_8f2k1c')).toBe('https://qotm.site/q/8f2k1c');
		expect(quoteUrl(testIo().io, 'p_123')).toBeNull();
	});
});
