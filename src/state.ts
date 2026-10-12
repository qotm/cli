import { join } from 'node:path';
import { readJson } from './store.js';

/** The signed-in terminal (qotm login, QOT-97): in the config folder, never in the data folder. */
export type Session = {
	token: string;
	handle: string | null;
	deviceId: string | null;
	/** The API it was issued by: a session belongs to one API. */
	api: string;
	signedInAt: string;
};
export const sessionFile = (config: string) => join(config, 'session.json');
export const readSession = (config: string): Session | null => {
	const s = readJson<Partial<Session>>(sessionFile(config), {});
	return s.token ? (s as Session) : null;
};

/** What the last `qotm sync` (QOT-98) installed: the release's manifest, as checked. */
export type SyncState = {
	version: string;
	schemaVersion: number;
	sha256: string;
	size: number;
	publishedAt: string | null;
	etag: string | null;
	syncedAt: string;
};
export const syncFile = (data: string) => join(data, 'sync.json');
export const readSync = (data: string): SyncState | null => {
	const s = readJson<Partial<SyncState>>(syncFile(data), {});
	return s.version ? (s as SyncState) : null;
};
