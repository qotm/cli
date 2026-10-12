import { describe, expect, it } from 'vitest';
import { testIo } from '../test/io.js';
import { main } from './main.js';

describe('qotm', () => {
	it('prints help for --help, -h and help', async () => {
		for (const argv of [['--help'], ['-h'], ['help']]) {
			const t = testIo();
			expect(await main(argv, t.io)).toBe(0);
			expect(t.out()).toContain('Usage:\n  qotm <command> [options]');
			expect(t.out()).toContain('https://qotm.dev');
		}
	});

	it('prints the version', async () => {
		const t = testIo();
		expect(await main(['--version'], t.io)).toBe(0);
		expect(t.out()).toBe('0.0.0-test\n');
	});

	it('refuses an unknown command with exit code 2', async () => {
		const t = testIo();
		expect(await main(['frobnicate'], t.io)).toBe(2);
		expect(t.err()).toBe('qotm: Unknown command "frobnicate". Run qotm --help for the list.\n');
		expect(t.out()).toBe('');
		const h = testIo();
		expect(await main(['help', 'frobnicate'], h.io)).toBe(2);
	});
});
