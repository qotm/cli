import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { tempDir } from './datasets.js';

const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const NO_NETWORK = fileURLToPath(new URL('./no-network.mjs', import.meta.url));

/** The built binary, in a fresh home, with the network refused. */
function qotm(args: string[], home = tempDir()) {
	return execFileSync(process.execPath, ['--import', NO_NETWORK, CLI, ...args], {
		encoding: 'utf8',
		env: { ...process.env, QOTM_HOME: home },
		stdio: ['ignore', 'pipe', 'pipe']
	});
}

describe('the qotm binary', () => {
	it('shows a quote on a fresh install with the network off', () => {
		const out = qotm([]);
		expect(out).toMatch(/^.+\n— .+\n$/);
	});

	it('still shows one when the synced dataset is corrupt', () => {
		const home = tempDir();
		mkdirSync(join(home, 'data'), { recursive: true });
		writeFileSync(join(home, 'data', 'qotm.sqlite'), 'garbage');
		expect(qotm([], home)).toMatch(/\n— .+\n$/);
	});

	it('prints no SQLite experimental warning', () => {
		const out = execFileSync(process.execPath, [CLI], {
			encoding: 'utf8',
			env: { ...process.env, QOTM_HOME: tempDir() },
			stdio: ['ignore', 'pipe', 'pipe']
		});
		expect(out).not.toMatch(/ExperimentalWarning/);
	});
});
