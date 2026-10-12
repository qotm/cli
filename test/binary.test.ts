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

	it('pipes plain text: no escape codes, even with --source', () => {
		const out = qotm(['--source']);
		expect(out).not.toMatch(/\x1b\[/);
		expect(qotm(['--plain'])).not.toMatch(/\x1b\[/);
	});

	it('prints valid JSON with --json', () => {
		expect(JSON.parse(qotm(['--json']))).toHaveProperty('text');
	});

	it('answers in under 150 ms', () => {
		const home = tempDir();
		qotm([], home); // warm the file cache
		const runs = Array.from({ length: 5 }, () => {
			const start = performance.now();
			qotm([], home);
			return performance.now() - start;
		}).sort((a, b) => a - b);
		// The median of five, from process start to exit.
		expect(runs[2]).toBeLessThan(150);
	});

	it('keeps favorites and private quotes across runs, offline', () => {
		const home = tempDir();
		qotm([], home);
		expect(qotm(['save'], home)).toBe('saved to favorites\n');
		qotm(['add', 'Name things twice.'], home);
		// New processes, still with the network refused.
		expect(qotm(['favorites'], home).split('\n').filter(Boolean)).toHaveLength(1);
		expect(qotm(['save'], home)).toBe('already in your favorites\n');
		expect(qotm(['--personal'], home)).toBe('Name things twice.\n—  you\n');
		expect(qotm(['--favorites'], home)).toMatch(/\n— {2}.+\n$/);
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
