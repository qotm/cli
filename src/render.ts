/**
 * How a quote is drawn on a terminal (the "CLI render" page of the design
 * file): four styles, all box-drawing and block characters, no dependencies.
 *
 * - pull (the default): clay quote marks hang left of a text column.
 * - bubble: a speech bubble with the qotm "q" under its tail, cowsay's heir.
 * - card: a centred frame with the quote's id and status in its bottom edge.
 * - slab: a lighter panel with the share card's clay edge (needs colour).
 *
 * Each fits its frame to the quote: lines wrap at most `MAX` columns, never
 * past the terminal, balanced so the last line is not a lone word. Without
 * colour the shape stays; below `MIN_COLUMNS` there is no room for one.
 */

export const STYLES = ['pull', 'bubble', 'card', 'slab'] as const;
export type Style = (typeof STYLES)[number];

/** Narrower than this, a shape costs more than it gives: plain lines instead. */
export const MIN_COLUMNS = 40;

export type Card = {
	text: string;
	/** "Edsger W. Dijkstra", "@ada", "you". */
	credit: string;
	/** Under the credit, for --source. */
	source?: string | null;
	/** "q/8f2k1c", or null for a private quote. */
	ref: string | null;
	/** "✓ curated", "private": the card's bottom edge and the slab's footer. */
	status: string;
	/** Topic names, for the slab's footer. */
	topics: string[];
};

type Paint = (s: string) => string;
export type Palette = {
	/** The quote's words. */
	text: Paint;
	/** Frames and quiet metadata. */
	frame: Paint;
	/** The credit. */
	credit: Paint;
	/** Marks, dashes, the q, the slab's edge. */
	accent: Paint;
	/** The slab's panel: a lighter ground with light text. */
	panel: Paint;
	panelText: Paint;
	panelAccent: Paint;
	panelCredit: Paint;
};

const sgr = (open: string, close: string) => (s: string) => (s ? `\x1b[${open}m${s}\x1b[${close}m` : s);
const none: Paint = (s) => s;

/** qotm_kit in 256 colours: clay #c67457 ≈ 173, stone #a7a29a ≈ 248, #6e6a64 ≈ 242, the slab #24211e ≈ 235. */
export function palette(color: boolean): Palette {
	if (!color)
		return {
			text: none,
			frame: none,
			credit: none,
			accent: none,
			panel: none,
			panelText: none,
			panelAccent: none,
			panelCredit: none
		};
	const panel = '48;5;235';
	return {
		text: sgr('1', '22'),
		frame: sgr('38;5;242', '39'),
		credit: sgr('38;5;248', '39'),
		accent: sgr('38;5;173', '39'),
		panel: sgr(panel, '49'),
		panelText: sgr(`1;38;5;255;${panel}`, '22;39;49'),
		panelAccent: sgr(`38;5;173;${panel}`, '39;49'),
		panelCredit: sgr(`38;5;248;${panel}`, '39;49')
	};
}

/** Terminal cells a string takes (one per code point; the quotes are Latin text). */
export const cells = (s: string) => [...s].length;

/** Greedy word wrap at `width` (a longer word keeps its own line, whole). */
export function wrapWords(text: string, width: number): string[] {
	const lines: string[] = [];
	for (const paragraph of text.split('\n')) {
		let line = '';
		for (const word of paragraph.split(/\s+/).filter(Boolean)) {
			if (line && cells(line) + 1 + cells(word) > width) {
				lines.push(line);
				line = word;
			} else line = line ? `${line} ${word}` : word;
		}
		lines.push(line);
	}
	return lines;
}

/**
 * Wraps at `max` columns, then narrows the column for as long as the line
 * count holds, so the lines come out even (CSS's text-wrap: balance).
 */
export function balance(text: string, max: number): string[] {
	const count = wrapWords(text, max).length;
	if (count === 1) return wrapWords(text, max);
	let width = max;
	while (width > 12 && wrapWords(text, width - 1).length === count) width--;
	return wrapWords(text, width);
}

const longest = (lines: string[]) => Math.max(0, ...lines.map(cells));
const clip = (s: string, n: number) => (cells(s) > n ? `${[...s].slice(0, n - 1).join('')}…` : s);

/** C: marks hanging left, then the column, then the credit. */
function pull(card: Card, columns: number, p: Palette): string[] {
	const indent = '         ';
	const lines = balance(card.text, Math.min(60, columns - indent.length - 2));
	const marks = ['  ▄▄ ▄▄  ', '  ▀█ ▀█  '];
	const out = lines.map((l, i) => (i < 2 ? p.accent(marks[i]!) : indent) + p.text(l));
	if (lines.length < 2) out.push(p.accent(marks[1]!));
	out.push('');
	const ref = card.ref ? p.frame(`  ·  ${card.ref}`) : '';
	out.push(`${indent}${p.accent('—')}  ${p.credit(card.credit)}${ref}`);
	if (card.source)
		out.push(...balance(card.source, Math.min(60, columns - indent.length - 2)).map((l) => indent + p.frame(l)));
	return out;
}

/** The qotm "q", drawn where cowsay drew its cow. */
const Q = ['      ▄▄▄▄▄', '    ▄▀     ▀▄', '    █       █', '    ▀▄     ▄█', '      ▀▀▀▀▀ █', '            ▀▄▄'];

/** A: a speech bubble, the credit set right inside it, a tail down to the q. */
function bubble(card: Card, columns: number, p: Palette): string[] {
	const max = Math.min(56, columns - 12);
	const lines = balance(card.text, max);
	const credit = `— ${clip(card.credit, max - 2)}`;
	const source = card.source ? balance(card.source, max) : [];
	const width = Math.max(longest(lines), cells(credit), longest(source));
	const inner = width + 6;
	const row = (content: string, length: number) =>
		`  ${p.frame('│')}   ${content}${' '.repeat(width - length)}   ${p.frame('│')}`;
	const blank = `  ${p.frame(`│${' '.repeat(inner)}│`)}`;
	return [
		`  ${p.frame(`╭${'─'.repeat(inner)}╮`)}`,
		blank,
		...lines.map((l) => row(p.text(l), cells(l))),
		blank,
		row(' '.repeat(width - cells(credit)) + p.accent('—') + ' ' + p.credit(credit.slice(2)), width),
		...source.map((l) => row(' '.repeat(width - cells(l)) + p.frame(l), width)),
		blank,
		`  ${p.frame(`╰──┬${'─'.repeat(inner - 3)}╯`)}`,
		`     ${p.frame('│')}`,
		...Q.map((l) => p.accent(l))
	];
}

/** B: a centred card; the bottom edge carries the id and status. */
function card(c: Card, columns: number, p: Palette): string[] {
	const max = Math.min(50, columns - 14);
	const lines = balance(c.text, max);
	const credit = clip(c.credit, max);
	const source = c.source ? balance(c.source, max) : [];
	const inner = Math.max(longest(lines), cells(credit), longest(source), 24) + 10;
	const centre = (s: string, paint: Paint) => {
		const left = Math.floor((inner - cells(s)) / 2);
		return `  ${p.frame('│')}${' '.repeat(left)}${paint(s)}${' '.repeat(inner - left - cells(s))}${p.frame('│')}`;
	};
	const blank = `  ${p.frame(`│${' '.repeat(inner)}│`)}`;
	const ref = c.ref ?? '';
	const status = c.status;
	const dashes = inner - 5 - cells(ref) - cells(status) - (ref ? 1 : 0);
	const bottom =
		dashes >= 2
			? `  ${p.frame('╰─')}${ref ? ` ${p.credit(ref)}` : ''} ${p.frame('─'.repeat(dashes))} ${p.accent(status)} ${p.frame('─╯')}`
			: `  ${p.frame(`╰${'─'.repeat(inner)}╯`)}`;
	return [
		`  ${p.frame(`╭${'─'.repeat(inner)}╮`)}`,
		blank,
		...lines.map((l) => centre(l, p.text)),
		blank,
		centre('──', p.accent),
		centre(credit, p.credit),
		...source.map((l) => centre(l, p.frame)),
		blank,
		bottom
	];
}

/** D: a lighter panel with a clay edge, then where it is from. */
function slab(c: Card, columns: number, p: Palette): string[] {
	const max = Math.min(56, columns - 11);
	const lines = balance(c.text, max);
	const credit = `— ${clip(c.credit, max - 2)}`;
	const source = c.source ? balance(c.source, max) : [];
	const width = Math.max(longest(lines), cells(credit), longest(source)) + 6;
	const edge = `  ${p.accent('▌')}`;
	const blank = edge + p.panel(' '.repeat(width));
	const row = (content: string, length: number, rest = p.panel) =>
		`${edge}${p.panel('   ')}${content}${rest(' '.repeat(width - 3 - length))}`;
	const footer = clip([...c.topics, c.status, c.ref].filter(Boolean).join(' · '), columns - 5);
	return [
		blank,
		...lines.map((l) => row(p.panelText(l), cells(l))),
		blank,
		row(p.panelAccent('—') + p.panel(' ') + p.panelCredit(credit.slice(2)), cells(credit)),
		...source.map((l) => row(p.panelCredit(l), cells(l))),
		blank,
		`    ${p.frame(footer)}`
	];
}

const DRAW = { pull, bubble, card, slab };

/** The quote in `style`, as lines; a blank line above sets it apart from the prompt. */
export function render(c: Card, style: Style, columns: number, color: boolean): string {
	return `\n${DRAW[style](c, columns, palette(color)).join('\n')}\n`;
}
