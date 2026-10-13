import { describe, expect, it } from 'vitest';
import { testIo } from '../test/io.js';
import { formatQuote, type Shown } from './quotes.js';
import { STYLES, balance, cells, render, wrapWords, type Card } from './render.js';

const HOARE: Card = {
	text: 'There are two ways of constructing a software design: one way is to make it so simple that there are obviously no deficiencies, and the other way is to make it so complicated that there are no obvious deficiencies.',
	credit: 'C. A. R. Hoare',
	ref: 'q/0h5w3q',
	status: '✓ curated',
	topics: ['software design', 'simplicity']
};
const BECK: Card = {
	...HOARE,
	text: 'Make it work, make it right, make it fast.',
	credit: 'Kent Beck',
	ref: 'q/3kb8m1'
};
const ESC = /\x1b\[/;
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
const lines = (s: string) => strip(s).split('\n');

describe('wrapping', () => {
	it('balances lines instead of leaving a word alone at the end', () => {
		const text =
			'The question of whether a computer can think is no more interesting than the question of whether a submarine can swim.';
		expect(wrapWords(text, 39).at(-1)).toBe('swim.');
		const even = balance(text, 39);
		expect(even).toHaveLength(wrapWords(text, 39).length);
		expect(even.at(-1)).toBe('whether a submarine can swim.');
		expect(Math.max(...even.map(cells))).toBeLessThanOrEqual(39);
	});

	it('keeps a one-line quote on one line', () => {
		expect(balance(BECK.text, 60)).toEqual([BECK.text]);
	});
});

describe('render', () => {
	it.each(STYLES)('%s fits an 80- and a 50-column terminal', (style) => {
		for (const columns of [80, 50]) {
			for (const card of [HOARE, BECK, { ...HOARE, source: 'EWD 498, 1975 · https://www.cs.utexas.edu/~EWD/' }]) {
				const out = lines(render(card, style, columns, true));
				expect(Math.max(...out.map(cells))).toBeLessThanOrEqual(columns);
				expect(out.join('\n')).toContain(card.credit);
			}
		}
	});

	it.each(['bubble', 'card'] as const)('%s closes its frame: every frame line is as wide as the top', (style) => {
		for (const card of [HOARE, BECK, { ...BECK, source: 'Kent Beck, on Ward Cunningham’s wiki' }]) {
			const out = lines(render(card, style, 80, false)).filter((l) => /^ {2}[╭│╰]/.test(l));
			const width = cells(out[0]!);
			for (const l of out) expect(cells(l)).toBe(width);
		}
	});

	it('pull hangs the marks beside the first two lines, even for a one-line quote', () => {
		const out = lines(render(BECK, 'pull', 80, false));
		expect(out[1]).toBe(`  ▄▄ ▄▄  ${BECK.text}`);
		expect(out[2]!.trimEnd()).toBe('  ▀█ ▀█');
		expect(out).toContain('         —  Kent Beck  ·  q/3kb8m1');
	});

	it('card centres the quote and sets the id and status in its bottom edge', () => {
		const out = lines(render(BECK, 'card', 80, false));
		const quote = out.find((l) => l.includes('Make it work'))!;
		const [left, right] = [quote.indexOf('M') - 3, cells(quote) - cells(quote.trimEnd().slice(0, -1).trimEnd()) - 1];
		expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
		expect(out.at(-2)).toMatch(/^ {2}╰─ q\/3kb8m1 ─+ ✓ curated ─╯$/);
	});

	it('bubble ends in the q, under a tail', () => {
		const out = lines(render(BECK, 'bubble', 80, false));
		expect(out.some((l) => l.startsWith('  ╰──┬'))).toBe(true);
		expect(out.at(-2)).toBe('            ▀▄▄');
	});

	it('slab lists the topics, status and id under the panel', () => {
		expect(lines(render(HOARE, 'slab', 80, false)).at(-2)).toBe(
			'    software design · simplicity · ✓ curated · q/0h5w3q'
		);
	});

	it('colours with the kit’s clay, and not at all without colour', () => {
		for (const style of STYLES) {
			expect(render(HOARE, style, 80, true)).toContain('\x1b[38;5;173m');
			expect(render(HOARE, style, 80, false)).not.toMatch(ESC);
		}
	});

	it.each(STYLES)('%s at 80 columns', (style) => {
		expect(strip(render(HOARE, style, 80, false))).toMatchSnapshot();
	});
});

describe('formatQuote', () => {
	const Q: Shown = {
		id: 'q_3kb8m1',
		text: BECK.text,
		type: 'canonical',
		author: { name: 'Kent Beck', slug: 'beck' },
		contributor: null,
		work: null,
		year: null,
		source: null,
		sourceUrl: null,
		topics: ['software-engineering']
	};

	it('draws on a terminal, in the style asked for', () => {
		const tty = testIo({}, true).io;
		expect(strip(formatQuote(Q, tty))).toContain('▄▄ ▄▄');
		expect(strip(formatQuote(Q, tty, { style: 'card' }))).toContain('╰─ q/3kb8m1');
		expect(strip(formatQuote(Q, tty, { style: 'slab' }))).toContain('software engineering · ✓ curated');
	});

	it('keeps the shape without colour (NO_COLOR) on a terminal', () => {
		const out = formatQuote(Q, testIo({ NO_COLOR: '' }, true).io);
		expect(out).not.toMatch(ESC);
		expect(out).toContain('▀█ ▀█');
	});

	it('draws no shape when piped, with --plain, or under 40 columns', () => {
		const plain = 'Make it work, make it right, make it fast.\n—  Kent Beck\n';
		expect(formatQuote(Q, testIo().io)).toBe(plain);
		expect(formatQuote(Q, testIo({}, true).io, { plain: true })).toBe(plain);
		expect(strip(formatQuote(Q, testIo({ NO_COLOR: '' }, true).io, { columns: 39 }))).toBe(
			'Make it work, make it right, make it\nfast.\n—  Kent Beck\n'
		);
	});

	it('marks a private quote private, with no id', () => {
		const out = strip(
			formatQuote({ ...Q, id: 'p_1', type: 'personal', author: null }, testIo({}, true).io, { style: 'card' })
		);
		expect(out).toContain('you');
		expect(out).toContain('private ─╯');
		expect(out).not.toContain('q/');
	});
});
