import { homedir } from 'node:os';
import { join } from 'node:path';

export type Paths = {
	/** settings.json (QOT-109) and the session token (QOT-97). */
	config: string;
	/** qotm.sqlite (after a sync), favorites, private quotes, history. */
	data: string;
};

/**
 * The platform's standard folders for qotm. `QOTM_HOME` puts both under one
 * directory (tests, portable installs).
 *
 * - Linux (XDG): $XDG_CONFIG_HOME/qotm (~/.config/qotm), $XDG_DATA_HOME/qotm (~/.local/share/qotm)
 * - macOS: ~/Library/Preferences/qotm, ~/Library/Application Support/qotm
 * - Windows: %APPDATA%\qotm\Config, %LOCALAPPDATA%\qotm\Data
 */
export function qotmPaths(
	env: Record<string, string | undefined> = process.env,
	platform: NodeJS.Platform = process.platform,
	home: string = homedir()
): Paths {
	if (env.QOTM_HOME) return { config: join(env.QOTM_HOME, 'config'), data: join(env.QOTM_HOME, 'data') };
	if (platform === 'darwin')
		return {
			config: join(home, 'Library', 'Preferences', 'qotm'),
			data: join(home, 'Library', 'Application Support', 'qotm')
		};
	if (platform === 'win32') {
		const roaming = env.APPDATA || join(home, 'AppData', 'Roaming');
		const local = env.LOCALAPPDATA || join(home, 'AppData', 'Local');
		return { config: join(roaming, 'qotm', 'Config'), data: join(local, 'qotm', 'Data') };
	}
	return {
		config: join(env.XDG_CONFIG_HOME || join(home, '.config'), 'qotm'),
		data: join(env.XDG_DATA_HOME || join(home, '.local', 'share'), 'qotm')
	};
}
