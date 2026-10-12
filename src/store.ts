import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * qotm's own small files in the data folder, as JSON: what was shown
 * (history), favorites and private quotes. Each is read whole and written
 * atomically (a temp file, then a rename), so an interrupted write never
 * leaves half a file; an unreadable one reads as empty.
 */
export function readJson<T>(file: string, empty: T): T {
	try {
		return { ...empty, ...(JSON.parse(readFileSync(file, 'utf8')) as T) };
	} catch {
		return empty;
	}
}

export function writeJson(file: string, value: unknown): void {
	mkdirSync(dirname(file), { recursive: true });
	const tmp = `${file}.${process.pid}.tmp`;
	writeFileSync(tmp, `${JSON.stringify(value, null, '\t')}\n`);
	renameSync(tmp, file);
}

/** How many recent quotes `qotm` avoids repeating. */
export const HISTORY_SIZE = 50;

export type Shown = { id: string; at: string };
export type History = { shown: Shown[] };

export const historyFile = (data: string) => join(data, 'history.json');
export const readHistory = (data: string) => readJson<History>(historyFile(data), { shown: [] });

/** Remembers a shown quote, newest first, keeping the last HISTORY_SIZE. */
export function remember(data: string, id: string, now = new Date()): void {
	const { shown } = readHistory(data);
	writeJson(historyFile(data), {
		shown: [{ id, at: now.toISOString() }, ...shown.filter((s) => s.id !== id)].slice(0, HISTORY_SIZE)
	});
}

/** A favorite: a dataset quote id, and when it was saved. */
export type Favorite = { id: string; addedAt: string };
export type Favorites = { favorites: Favorite[] };
export const favoritesFile = (data: string) => join(data, 'favorites.json');
export const readFavorites = (data: string) => readJson<Favorites>(favoritesFile(data), { favorites: [] });

/** A private quote kept with `qotm add`: on this machine only, never in the dataset. */
export type PersonalQuote = {
	id: string;
	text: string;
	author: string | null;
	work: string | null;
	year: number | null;
	createdAt: string;
};
export type Personal = { quotes: PersonalQuote[] };
export const personalFile = (data: string) => join(data, 'personal.json');
export const readPersonal = (data: string) => readJson<Personal>(personalFile(data), { quotes: [] });
