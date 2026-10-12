import { join } from 'node:path';
import { CliError, type Io } from './io.js';
import { qotmPaths } from './paths.js';
import { readJson, writeJson } from './store.js';

/** Every setting `qotm config` knows, with its default and how to read a value. */
export const SETTINGS = {
	api: {
		default: 'https://api.qotm.dev',
		env: 'QOTM_API_URL',
		describe: 'the qotm API (login, sync, favorites, submit)',
		parse: (v: string) => url(v)
	},
	site: {
		default: 'https://qotm.dev',
		env: 'QOTM_SITE_URL',
		describe: 'the qotm site (qotm open, search --web)',
		parse: (v: string) => url(v)
	},
	color: {
		default: 'auto',
		env: undefined,
		describe: 'auto (on a terminal), always or never',
		parse: (v: string) => {
			if (!['auto', 'always', 'never'].includes(v)) throw new CliError('color is auto, always or never.', 2);
			return v;
		}
	},
	history: {
		default: '50',
		env: undefined,
		describe: 'how many recent quotes qotm avoids repeating (0: none)',
		parse: (v: string) => {
			if (!/^\d{1,4}$/.test(v)) throw new CliError('history is a number of quotes, like 50.', 2);
			return String(Number(v));
		}
	}
} as const;

export type Key = keyof typeof SETTINGS;
export const KEYS = Object.keys(SETTINGS) as Key[];

function url(v: string): string {
	try {
		const u = new URL(v);
		if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error();
		return v.replace(/\/+$/, '');
	} catch {
		throw new CliError(`"${v}" is not a URL (https://…).`, 2);
	}
}

export const settingsFile = (io: Io) => join(qotmPaths(io.env).config, 'settings.json');
const readSettings = (io: Io) => readJson<Partial<Record<Key, string>>>(settingsFile(io), {});

/** Where a value comes from: the environment, settings.json, or the default. */
export type Resolved = { key: Key; value: string; from: 'env' | 'settings' | 'default' };

export function resolve(io: Io, key: Key): Resolved {
	const s = SETTINGS[key];
	const fromEnv = s.env ? io.env[s.env] : undefined;
	if (fromEnv) return { key, value: s.parse(fromEnv), from: 'env' };
	const saved = readSettings(io)[key];
	if (saved !== undefined) return { key, value: saved, from: 'settings' };
	return { key, value: s.default, from: 'default' };
}

export const setting = (io: Io, key: Key) => resolve(io, key).value;

export function setSetting(io: Io, key: Key, value: string): string {
	const parsed = SETTINGS[key].parse(value);
	writeJson(settingsFile(io), { ...readSettings(io), [key]: parsed });
	return parsed;
}

export function unsetSetting(io: Io, key: Key): void {
	const { [key]: _, ...rest } = readSettings(io);
	writeJson(settingsFile(io), rest);
}

export function assertKey(key: string | undefined): Key {
	if (!key || !(key in SETTINGS))
		throw new CliError(`Unknown setting "${key ?? ''}". Settings: ${KEYS.join(', ')}.`, 2);
	return key as Key;
}
