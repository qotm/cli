import { defineConfig } from 'vitest/config';

export default defineConfig({
	define: { __QOTM_VERSION__: JSON.stringify('0.0.0-test') },
	test: {
		include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
		environment: 'node',
		globalSetup: ['test/global-setup.ts'],
		// GitHub's Windows runners start processes and open SQLite files slowly
		// enough that a few tests overran the 5s default there.
		testTimeout: process.platform === 'win32' ? 30_000 : 5_000
	}
});
