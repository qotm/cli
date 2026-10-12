import { setting } from './config.js';
import type { Io } from './io.js';

/** The site quotes link to (qotm config set site …, or QOTM_SITE_URL). */
export const siteUrl = (io: Io) => setting(io, 'site');

/** /q/8f2k1c: a dataset quote's page (private quotes have none). */
export const quoteUrl = (io: Io, id: string) => (id.startsWith('q_') ? `${siteUrl(io)}/q/${id.slice(2)}` : null);

/**
 * Colour, as the terminal on the landing page has it, when it can be shown:
 * the color setting if it is always or never; else a TTY, NO_COLOR unset,
 * TERM not dumb (FORCE_COLOR turns it on regardless).
 */
export function useColor(io: Io, plain = false): boolean {
	if (plain) return false;
	const configured = setting(io, 'color');
	if (configured !== 'auto') return configured === 'always';
	if (io.env.FORCE_COLOR && io.env.FORCE_COLOR !== '0') return true;
	if ('NO_COLOR' in io.env && io.env.NO_COLOR !== undefined) return false;
	if (io.env.TERM === 'dumb') return false;
	return io.isTTY;
}

const sgr = (open: string, close: string) => (on: boolean) => (s: string) =>
	on ? `\x1b[${open}m${s}\x1b[${close}m` : s;
export const style = {
	bold: sgr('1', '22'),
	/** The kit's clay accent (#b85c3e), as near as 256 colours get. */
	clay: sgr('38;5;173', '39'),
	/** Muted text. */
	muted: sgr('38;5;245', '39')
};

/** Wraps at word boundaries to `width` columns (a word longer than that stays whole). */
export function wrap(text: string, width: number): string {
	const lines: string[] = [];
	for (const paragraph of text.split('\n')) {
		let line = '';
		for (const word of paragraph.split(/\s+/).filter(Boolean)) {
			if (line && line.length + 1 + word.length > width) {
				lines.push(line);
				line = word;
			} else line = line ? `${line} ${word}` : word;
		}
		lines.push(line);
	}
	return lines.join('\n');
}
