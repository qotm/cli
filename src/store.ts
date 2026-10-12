import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
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

/** How many recent quotes `qotm` avoids repeating, unless `qotm config set history` says otherwise. */
export const HISTORY_SIZE = 50;

export type Shown = { id: string; at: string };
export type History = { shown: Shown[] };

export const historyFile = (data: string) => join(data, 'history.json');
export const readHistory = (data: string) => readJson<History>(historyFile(data), { shown: [] });

/** Remembers a shown quote, newest first, keeping the last `size` (at least the latest, for qotm last). */
export function remember(data: string, id: string, now = new Date(), size = HISTORY_SIZE): void {
	const { shown } = readHistory(data);
	writeJson(historyFile(data), {
		shown: [{ id, at: now.toISOString() }, ...shown.filter((s) => s.id !== id)].slice(0, Math.max(1, size))
	});
}

/** A favorite: a dataset quote id, and when it was saved. */
export type Favorite = { id: string; addedAt: string };
/**
 * Favorites, newest first, and the changes made here since the last sync
 * with the account (QOT-101 replays them: adds are idempotent and a remove
 * of something not favorited is a no-op, so replaying is safe).
 */
export type Favorites = {
	favorites: Favorite[];
	pending: { add: string[]; remove: string[] };
	/** Saved here, but the account skipped them (not public on qotm.dev): kept on this machine only. */
	localOnly: string[];
};
export const favoritesFile = (data: string) => join(data, 'favorites.json');
export const readFavorites = (data: string): Favorites => {
	const f = readJson<Partial<Favorites>>(favoritesFile(data), {});
	return {
		favorites: f.favorites ?? [],
		pending: { add: f.pending?.add ?? [], remove: f.pending?.remove ?? [] },
		localOnly: f.localOnly ?? []
	};
};
export const writeFavorites = (data: string, f: Favorites) => writeJson(favoritesFile(data), f);

/** Adds a favorite; false if it already was one (nothing changes). */
export function addFavorite(data: string, id: string, now = new Date()): boolean {
	const f = readFavorites(data);
	if (f.favorites.some((x) => x.id === id)) return false;
	writeFavorites(data, {
		favorites: [{ id, addedAt: now.toISOString() }, ...f.favorites],
		pending: { add: [...new Set([...f.pending.add, id])], remove: f.pending.remove.filter((x) => x !== id) },
		localOnly: f.localOnly
	});
	return true;
}

/** Removes a favorite; false if it was not one. */
export function removeFavorite(data: string, id: string): boolean {
	const f = readFavorites(data);
	if (!f.favorites.some((x) => x.id === id)) return false;
	writeFavorites(data, {
		favorites: f.favorites.filter((x) => x.id !== id),
		pending: { add: f.pending.add.filter((x) => x !== id), remove: [...new Set([...f.pending.remove, id])] },
		localOnly: f.localOnly.filter((x) => x !== id)
	});
	return true;
}

/** A private quote kept with `qotm add`: on this machine only, never in the dataset. */
export type PersonalQuote = {
	id: string;
	text: string;
	author: string | null;
	work: string | null;
	year: number | null;
	createdAt: string;
	/** Its id in your account, once sent there (qotm add while signed in). */
	remoteId?: string | null;
};
export type Personal = { quotes: PersonalQuote[] };
export const personalFile = (data: string) => join(data, 'personal.json');
export const readPersonal = (data: string) => readJson<Personal>(personalFile(data), { quotes: [] });

/** Keeps a private quote; returns it with its new id (p_ and 8 random characters). */
export function addPersonal(
	data: string,
	quote: { text: string; author?: string | null; work?: string | null; year?: number | null },
	now = new Date()
): PersonalQuote {
	const { quotes } = readPersonal(data);
	let id: string;
	do
		id = `p_${randomBytes(6)
			.toString('base64url')
			.toLowerCase()
			.replace(/[^a-z0-9]/g, '')
			.slice(0, 8)
			.padEnd(8, '0')}`;
	while (quotes.some((q) => q.id === id));
	const created: PersonalQuote = {
		id,
		text: quote.text,
		author: quote.author ?? null,
		work: quote.work ?? null,
		year: quote.year ?? null,
		createdAt: now.toISOString()
	};
	writeJson(personalFile(data), { quotes: [...quotes, created] });
	return created;
}

/** Records the account's id for a private quote sent there. */
export function setRemoteId(data: string, id: string, remoteId: string): void {
	const { quotes } = readPersonal(data);
	writeJson(personalFile(data), { quotes: quotes.map((q) => (q.id === id ? { ...q, remoteId } : q)) });
}
