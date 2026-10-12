import { api, apiMessage } from './http.js';
import type { Io } from './io.js';
import { qotmPaths } from './paths.js';
import { readSession } from './state.js';
import { readFavorites, writeFavorites, type Favorite } from './store.js';

/** PUT /v1/me/favorites/sync's answer: the merged set, and adds it skipped. */
type Synced = { favorites: Favorite[]; skipped?: string[] };

export type FavoritesSync =
	| { status: 'signed-out' }
	| { status: 'synced'; handle: string | null; count: number; skipped: string[] }
	/** Kept queued: offline, or the session ended. */
	| { status: 'queued'; reason: string; pending: number };

/**
 * Shares this terminal's favorites with the account (BUILD-PLAN §5): replays
 * the changes queued since the last sync (adds are idempotent, removes of
 * something not favorited are no-ops, so a replay is safe), then takes the
 * account's merged set as the local list. Skipped adds (not public on
 * qotm.dev) stay here as local-only favorites. Nothing is lost when the API
 * cannot be reached: the queue simply waits.
 */
export async function syncFavorites(io: Io, timeoutMs = 15_000): Promise<FavoritesSync> {
	const { config, data } = qotmPaths(io.env);
	const session = readSession(config);
	if (!session) return { status: 'signed-out' };
	const before = readFavorites(data);
	const sent = { add: [...before.pending.add], remove: [...before.pending.remove] };
	let res;
	try {
		res = await api<Synced>(io, '/v1/me/favorites/sync', {
			method: 'PUT',
			token: session.token,
			body: sent,
			timeoutMs
		});
	} catch {
		return { status: 'queued', reason: 'the API could not be reached', pending: sent.add.length + sent.remove.length };
	}
	if (res.status === 401)
		return {
			status: 'queued',
			reason: 'your session ended; run qotm login',
			pending: sent.add.length + sent.remove.length
		};
	if (res.status !== 200)
		return { status: 'queued', reason: apiMessage(res), pending: sent.add.length + sent.remove.length };

	// Changes made while the request was out stay queued for next time.
	const now = readFavorites(data);
	const pending = {
		add: now.pending.add.filter((id) => !sent.add.includes(id)),
		remove: now.pending.remove.filter((id) => !sent.remove.includes(id))
	};
	const skipped = res.body.skipped ?? [];
	const localOnly = [...new Set([...now.localOnly, ...skipped])].filter((id) => !pending.remove.includes(id));
	const merged = res.body.favorites.filter((f) => !pending.remove.includes(f.id));
	const known = new Set(merged.map((f) => f.id));
	const keep = now.favorites.filter(
		(f) => !known.has(f.id) && (localOnly.includes(f.id) || pending.add.includes(f.id))
	);
	const favorites = [...keep, ...merged].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
	writeFavorites(data, { favorites, pending, localOnly });
	return { status: 'synced', handle: session.handle, count: favorites.length, skipped };
}
